# Spec: Snapshot & Diff

## Overview

Endre import-pipelinen fra "overskriv" til "diff + bekreft". Naar en Excel-fil importeres for et selskap som allerede har data, beregnes endringene og vises for brukeren foer de bekreftes. Historiske snapshots bevares slik at man kan se tilbake i tid.

## Current Behavior

I dag gjor importeren:
1. Upsert company (oppdaterer share capital, total shares osv.)
2. **Slett alle share_classes for selskapet**
3. **Slett alle holdings for selskapet**
4. Opprett nye share_classes og holdings fra Excel-data
5. Entity resolution matcher/oppretter shareholders

Dette betyr at forrige tilstand er **tapt** etter import. Det finnes ingen maate aa se hva som var foer, eller hva som endret seg.

## Target Behavior

### 1. Snapshot-lagring

Foer en import endrer noe, tas det et snapshot av naavarende tilstand:

```
snapshots
  id              uuid PK
  company_id      uuid FK -> companies
  import_batch_id uuid FK -> import_batches (batch som skapte dette snapshotet)
  snapshot_data   jsonb       -- { shareClasses: [...], holdings: [...] }
  effective_date  date        -- dato snapshotet representerer
  created_at      timestamp
```

`snapshot_data` inneholder en fullstendig kopi av selskapets share classes og holdings paa det tidspunktet, inkludert aksjonaer-IDer og alle tallverdier. Dette er en JSONB-kolonne for fleksibilitet — vi trenger ikke aa joine mot historiske data, bare lagre og vise dem.

### 2. Diff-beregning

Naar en ny Excel-fil lastes opp, beregnes diff foer noe lagres:

**Input**: Parsed Excel-data + eksisterende holdings i DB.

**Output**: En `ImportDiff` med:

```typescript
interface ImportDiff {
  companyId: string;
  companyName: string;
  
  // Share class changes
  shareClassChanges: ShareClassChange[];
  
  // Shareholder-level changes
  shareholderChanges: ShareholderChange[];
  
  // Summary
  summary: {
    newShareholders: number;
    exitedShareholders: number;
    changedHoldings: number;
    unchangedHoldings: number;
    newShareClasses: number;
    removedShareClasses: number;
  };
}

interface ShareClassChange {
  type: "added" | "removed" | "changed";
  name: string;
  before?: { totalShares: number; nominalValue: string; shareCapital: string; };
  after?: { totalShares: number; nominalValue: string; shareCapital: string; };
}

interface ShareholderChange {
  type: "new" | "exited" | "increased" | "decreased" | "class_changed" | "unchanged";
  shareholderName: string;
  shareholderId?: string;       // null for nye aksjonaerer
  orgNumber?: string;
  
  // Per share class
  holdingChanges: HoldingChange[];
  
  // Aggregated
  totalSharesBefore: number;
  totalSharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}

interface HoldingChange {
  shareClassName: string;
  sharesBefore: number;
  sharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}
```

**Diff-logikk**:
1. Matcher aksjonaerer mellom eksisterende holdings og parsed Excel via entity resolution (org number > DOB+name > name)
2. Aksjonaerer i Excel men ikke i DB = `new`
3. Aksjonaerer i DB men ikke i Excel = `exited`
4. Aksjonaerer i begge med forskjellig antall = `increased` / `decreased`
5. Aksjonaerer i begge med samme antall men annen klasse = `class_changed`
6. Aksjonaerer i begge med identisk data = `unchanged`

### 3. Preview-steg i import-flyten

Import-siden faar et nytt steg mellom filopplasting og bekreftelse:

**Steg 1: Upload** (eksisterer) — Dra-og-slipp Excel-fil

**Steg 2: Preview** (nytt) — Vises naar selskapet allerede har data:
- Sammendrag: "X nye aksjonaerer, Y utgaatt, Z endret, W uendret"
- Tabell med alle endringer, fargekodet:
  - Groenn: nye aksjonaerer
  - Roedt: utgaatte aksjonaerer  
  - Gult: endrede holdings (med foer/etter-verdier)
  - Graat: uendrede (collapsed som default)
- Share class-endringer vises oeverst
- Knapper: "Bekreft import" / "Avbryt"

**Steg 3: Resultat** (eksisterer, utvides) — Viser resultat inkl. antall transaksjoner opprettet

Foerste gang et selskap importeres, hoppes preview-steget over (alt er nytt).

### 4. Automatisk transaksjonsopprettelse

Naar diff er bekreftet og import gjennomfoeres:
1. Ta snapshot av naavarende tilstand
2. Gjennomfoer import (oppdater share classes + holdings som foer)
3. Opprett `import_diff`-transaksjoner basert paa diff-resultatet:
   - En transaksjon per shareholderChange som ikke er `unchanged`
   - Type settes til `import_diff`
   - Metadata fylles fra diff (foer/etter-verdier)

### 5. Historisk import

Brukeren kan laste opp eldre Excel-filer med en eksplisitt dato. Dette bygger historikk bakover:
- Datofelt i upload-dialogen (valgfritt, default = i dag)
- Filen importeres som et historisk snapshot med angitt dato
- Diff beregnes bakover (dette snapshotet vs. foerste eksisterende snapshot)
- Transaksjoner opprettes med den angitte datoen

## API Changes

### Ny endpoint: Preview import
```
POST /api/import/preview
Body: multipart/form-data { file, date? }
Response: { diff: ImportDiff, isFirstImport: boolean }
```

### Endret endpoint: Confirm import
```
POST /api/import
Body: multipart/form-data { file, date?, confirmed: boolean }
```
- Naar `confirmed=false` (eller mangler): returner preview (som /api/import/preview)
- Naar `confirmed=true`: gjennomfoer import med snapshot + transaksjoner

### Ny endpoint: Hent snapshots
```
GET /api/companies/:id/snapshots
Response: { snapshots: Snapshot[] }
```

### Ny endpoint: Sammenlign snapshots
```
GET /api/companies/:id/snapshots/compare?from=<id>&to=<id>
Response: { diff: ImportDiff }
```

## DB Schema Changes

### Ny tabell: `snapshots`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| company_id | uuid FK | Refererer til companies |
| import_batch_id | uuid FK | Batch som trigget snapshotet |
| snapshot_data | jsonb | Full kopi av share classes + holdings |
| effective_date | date | Dato snapshotet representerer |
| created_at | timestamp | |

### Ny tabell: `transactions` (grunnleggende — utvides i Phase B)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| company_id | uuid FK | Selskapet transaksjonen gjelder |
| type | enum | Transaksjonstype (starter med `import_diff`, `manual_adjustment`) |
| shareholder_id | uuid FK | Aksjonaeren som paavirkes |
| share_class_id | uuid FK | Aksjeklasse (nullable) |
| shares_before | bigint | Antall aksjer foer |
| shares_after | bigint | Antall aksjer etter |
| price_per_share | numeric | Pris per aksje (nullable) |
| effective_date | date | Dato for transaksjonen |
| import_batch_id | uuid FK | Null for manuelle transaksjoner |
| description | text | Fritekst-beskrivelse |
| metadata | jsonb | Ekstra data (utvidet i Phase B) |
| created_at | timestamp | |

### Endring i eksisterende tabeller

- `import_batches`: Legg til `effective_date` (date) — dato filen representerer (kan vaere forskjellig fra importtidspunkt)
- `holdings`: Ingen endringer (fortsetter aa representere naavarende tilstand)

## Edge Cases

1. **Foerste import for et selskap**: Ingen diff, ingen preview. Alle holdings opprettes som `import_diff` type=`new` transaksjoner med shares_before=0.
2. **Re-import av identisk fil**: Diff viser 0 endringer. Brukeren kan velge aa ikke importere.
3. **Aksjonaer endrer navn mellom importer**: Entity resolution matcher paa org number. Diff viser dette som `unchanged` (korrekt — eierandelen endret seg ikke).
4. **Ny aksjeklasse i ny fil**: Vises som `added` i shareClassChanges. Aksjonaerer med holdings i ny klasse vises som `increased` eller `class_changed`.
5. **Aksjeklasse fjernet**: Vises som `removed`. Aksjonaerer som hadde holdings i den klassen faar `decreased` eller `exited`.
6. **Historisk import med dato foer eksisterende data**: Snapshotet lagres med den angitte datoen. Tidslinje-visningen sorterer kronologisk.

## Out of Scope

- Manuell registrering av transaksjoner (Phase B)
- PDF-import (Phase B)
- Grafer og visualisering av historikk (Phase C)
- Eksport av transaksjonshistorikk (Phase C)
