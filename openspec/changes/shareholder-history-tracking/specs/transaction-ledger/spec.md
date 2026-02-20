# Spec: Transaction Ledger + Manual Registration

## Overview

En fullstendig transaksjonsmodell (ledger) for alle typer eierskapsendringer i norske aksjeselskaper. Inkluderer bade automatisk utledede transaksjoner (fra import-diff, Phase A) og manuelt registrerte transaksjoner.

Ledgeren er den autoritative kilden for **hvordan** eierskapet har endret seg. Holdings-tabellen representerer naavarende tilstand; transaksjoner forklarer hvordan man kom dit.

## Transaction Types

### Enum: `transaction_type`

```sql
CREATE TYPE transaction_type AS ENUM (
  -- Automatisk fra import
  'import_diff',

  -- Livssyklus
  'founding',           -- Stiftelse
  'emission',           -- Emisjon / kapitalforhoeyelse
  'write_down',         -- Nedskrivning av aksjekapital

  -- Overdragelse
  'sale_transfer',      -- Salg / overdragelse (kjoep/salg mellom parter)
  'inheritance',        -- Arv
  'gift',               -- Gave

  -- Strukturendringer
  'split',              -- Aksjesplitt (1:N)
  'reverse_split',      -- Aksjespleis (N:1)
  'conversion',         -- Konvertering mellom aksjeklasser
  'redemption',         -- Innloesning (selskapet kjoeper tilbake og sletter)

  -- Selskapsstruktur
  'merger',             -- Fusjon
  'demerger',           -- Fisjon

  -- Korreksjon
  'manual_adjustment'   -- Manuell justering / korreksjon
);
```

### Typegrupper for UI

| Gruppe | Typer | Beskrivelse |
|--------|-------|-------------|
| Stiftelse & Kapital | `founding`, `emission`, `write_down`, `redemption` | Endrer totalt antall aksjer i selskapet |
| Overdragelse | `sale_transfer`, `inheritance`, `gift` | Aksjer flytter mellom parter, totalt uendret |
| Strukturendring | `split`, `reverse_split`, `conversion` | Endrer aksjenes egenskaper |
| Selskapsstruktur | `merger`, `demerger` | Paavirker hele selskapet |
| System | `import_diff`, `manual_adjustment` | Ikke "ekte" transaksjoner |

## DB Schema

### `transactions` (full versjon)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | uuid PK | | |
| company_id | uuid FK | not null | Selskapet |
| type | transaction_type | not null | |
| effective_date | date | not null | Naar transaksjonen skjedde |
| description | text | | Fritekst-beskrivelse |
| | | | |
| **Parter** | | | |
| from_shareholder_id | uuid FK | nullable | Selger / avgiver (null for emisjon) |
| to_shareholder_id | uuid FK | nullable | Kjoeper / mottaker (null for innloesning) |
| | | | |
| **Aksjedata** | | | |
| share_class_id | uuid FK | nullable | Aksjeklasse |
| num_shares | bigint | not null | Antall aksjer i transaksjonen |
| price_per_share | numeric(20,4) | nullable | Pris per aksje (vederlag) |
| total_amount | numeric(20,4) | nullable | Totalt vederlag |
| share_numbers_from | bigint | nullable | Aksjenummer fra |
| share_numbers_to | bigint | nullable | Aksjenummer til |
| | | | |
| **Foer/etter** | | | |
| shares_before | bigint | nullable | Aksjonaerens beholdning foer (for `to_shareholder`) |
| shares_after | bigint | nullable | Aksjonaerens beholdning etter |
| | | | |
| **Metadata** | | | |
| source | text | not null | `import`, `manual`, `pdf_import` |
| import_batch_id | uuid FK | nullable | Referanse til import batch |
| document_reference | text | nullable | Link til vedtak, protokoll, PDF |
| metadata | jsonb | nullable | Ekstra data per type |
| created_at | timestamp | not null | |
| created_by | text | nullable | Bruker (for fremtidig auth) |

### Indekser

```sql
CREATE INDEX transactions_company_id_idx ON transactions(company_id);
CREATE INDEX transactions_effective_date_idx ON transactions(effective_date);
CREATE INDEX transactions_from_shareholder_idx ON transactions(from_shareholder_id);
CREATE INDEX transactions_to_shareholder_idx ON transactions(to_shareholder_id);
CREATE INDEX transactions_type_idx ON transactions(type);
CREATE INDEX transactions_import_batch_idx ON transactions(import_batch_id);
```

## Validation Rules Per Type

Hver transaksjonstype har spesifikke valideringsregler:

### `founding`
- `to_shareholder_id` required, `from_shareholder_id` must be null
- `num_shares` > 0
- `price_per_share` required (paalydende)
- `shares_before` must be 0 (selskapet er nytt)

### `emission`
- `to_shareholder_id` required (tegner), `from_shareholder_id` must be null
- `num_shares` > 0
- `price_per_share` required (tegningskurs)
- Selskapet maa eksistere

### `sale_transfer`, `inheritance`, `gift`
- Bade `from_shareholder_id` og `to_shareholder_id` required
- `num_shares` > 0
- `from_shareholder` maa ha >= `num_shares` i aktuell aksjeklasse
- For `sale_transfer`: `price_per_share` expected (men ikke paakrevd)
- For `gift`: `price_per_share` should be null/0

### `split`
- `to_shareholder_id` should be null (paavirker alle)
- `metadata.split_factor` required (f.eks. 10 for 1:10 splitt)
- Alle holdings i aksjeklassen multipliseres

### `reverse_split`
- Som `split` men med `metadata.merge_factor`
- Alle holdings i aksjeklassen divideres (maa gaa opp)

### `conversion`
- `to_shareholder_id` required
- `metadata.from_share_class_id` og `metadata.to_share_class_id` required
- Aksjer i gammel klasse reduseres, aksjer i ny klasse oekes

### `redemption`
- `from_shareholder_id` required, `to_shareholder_id` must be null
- `num_shares` > 0
- Aksjonaeren maa ha >= `num_shares`
- Selskapets totale aksjer reduseres

### `merger`, `demerger`
- Komplekse typer — initial implementasjon bruker `metadata` for detaljer
- Validering: grunnleggende sjekk at aksjer balanserer

## Manual Registration UI

### Route: `/companies/:id/transactions/new`

**Layout**: Side-panel eller modal med trinnbasert skjema:

#### Steg 1: Velg type
- Dropdown/cards med transaksjonstyper gruppert etter kategori
- Kort beskrivelse av hver type
- Vanligste typer (emisjon, salg) fremhevet

#### Steg 2: Detaljer (tilpasset per type)

**Emisjon-skjema**:
- Tegner (aksjonaer-velger med soek)
- Aksjeklasse (dropdown)
- Antall nye aksjer
- Tegningskurs (pris per aksje)
- Aksjenummer-range (valgfritt)
- Dato
- Beskrivelse / vedtaksreferanse

**Salg/overdragelse-skjema**:
- Selger (aksjonaer-velger, filtrert paa de som har aksjer i selskapet)
- Kjoeper (aksjonaer-velger, eller opprett ny)
- Aksjeklasse (dropdown)
- Antall aksjer (max = selgers beholdning i klassen)
- Pris per aksje
- Aksjenummer-range (valgfritt)
- Dato
- Beskrivelse

**Splitt-skjema**:
- Aksjeklasse (dropdown)
- Splittfaktor (f.eks. 1:10)
- Dato
- Alle aksjonaerer med aksjer i klassen vises med foer/etter

#### Steg 3: Bekreftelse
- Vis sammendrag av transaksjonen
- Vis effekt paa holdings (foer/etter)
- "Registrer" / "Avbryt"

#### Steg 4: Resultat
- Bekreftelse: transaksjonen er registrert
- Holdings oppdatert
- Link til transaksjon i historikk

### Holdings-oppdatering

Naar en transaksjon bekreftes:

1. **Validering**: Sjekk at transaksjonen er gyldig (nok aksjer, korrekte parter, osv.)
2. **Oppdater holdings**:
   - For `from_shareholder`: reduser `num_shares` i holding (slett holding om 0)
   - For `to_shareholder`: oek `num_shares` i eksisterende holding, eller opprett ny
   - For `split/reverse_split`: oppdater alle holdings i aksjeklassen
3. **Oppdater company**: Oppdater `total_shares` og `share_capital` ved emisjon/innloesning/splitt
4. **Opprett transaksjon**: Lagre i `transactions`-tabellen

Alt i en database-transaksjon.

## API Endpoints

### Transaksjoner for et selskap
```
GET /api/companies/:id/transactions
Query: ?type=emission&from=2024-01-01&to=2024-12-31&page=1&limit=50
Response: { transactions: Transaction[], total: number }
```

### Transaksjoner for en aksjonaer
```
GET /api/shareholders/:id/transactions
Query: ?company_id=...&type=...&page=1&limit=50
Response: { transactions: Transaction[], total: number }
```

### Registrer ny transaksjon
```
POST /api/companies/:id/transactions
Body: { type, effective_date, from_shareholder_id?, to_shareholder_id?, share_class_id?, num_shares, price_per_share?, description?, document_reference?, metadata? }
Response: { transaction: Transaction, holdingsUpdated: HoldingUpdate[] }
```

### Valider transaksjon (preview)
```
POST /api/companies/:id/transactions/validate
Body: (same as create)
Response: { valid: boolean, errors: string[], preview: { holdingsBefore: ..., holdingsAfter: ... } }
```

## Edge Cases

1. **Salg til ny aksjonaer**: Kjoeper finnes ikke i systemet. UI maa tillate opprettelse av ny aksjonaer som del av transaksjonsflyten.
2. **Emisjon med flere tegnere**: Opprettes som separate transaksjoner (en per tegner), alle med samme dato og beskrivelse.
3. **Splitt naar aksjer ikke gaar opp**: Feilmelding — splittfaktor maa vaere slik at alle aksjonaerer faar hele aksjer.
4. **Transaksjon med feil**: Brukeren kan opprette en `manual_adjustment` for aa korrigere. Transaksjoner slettes ikke (audit trail).
5. **Transaksjon paa historisk dato**: Tillatt, men holdings oppdateres til naavarende tilstand (vi reberegner ikke alle etterfoeelgende transaksjoner).
6. **Konflikt med import-data**: Manuell transaksjon og etterfoeelgende import kan gi inkonsistens. Import-preview viser avvik og brukeren bestemmer.

## Out of Scope

- Skattemessig inngangsverdi (FIFO/gjennomsnitt)
- Automatisk rapportgenerering til aksjonaerregisteret (Phase C)
- Batch-import av mange transaksjoner fra CSV
- Undo/revert av transaksjoner
