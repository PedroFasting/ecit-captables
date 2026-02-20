# Proposal: Shareholder History Tracking

## Problem

ECIT Cap Tables fungerer i dag som en **snapshot viewer** — den viser siste versjon av aksjeeierboken for hvert selskap, men har ingen historikk. Naar en ny Excel-fil importeres, overskriver den forrige fullstendig:

- Aksjeklasser og holdings slettes og re-opprettes fra scratch
- Ingen diff mellom gammel og ny versjon beregnes
- Endringer i eierskap (nye aksjonaerer, salg, emisjoner) er usynlige
- Det er umulig aa spore hvordan en aksjonaers eierandel har utviklet seg over tid

For en organisasjon som ECIT med aktiv konsolidering, emisjoner, interne salg og ManCo-programmer, er det kritisk aa forstaa **hvordan** eierskapet endrer seg — ikke bare hvordan det ser ut akkurat naa.

Maalbildet er en fullstendig digital aksjebok (ledger) som kan brukes til aarlig rapportering til aksjonaerregisteret via skatteetaten.no.

## Solution

Utvide applikasjonen fra "snapshot viewer" til en **fullstendig aksjebok med historikk og transaksjonslogg**. Hovedelementene:

### 1. Snapshot-basert import med diff (Phase A)

Naar en ny Excel-fil importeres for et selskap som allerede har data:
- Behold forrige versjon som et historisk snapshot
- Beregn diff automatisk: nye aksjonaerer, utgaatte aksjonaerer, endringer i antall aksjer, eierandel, aksjeklasse
- Vis endringene for brukeren foer de bekreftes (preview-steg)
- Logg endringene som transaksjoner (automatisk)
- Stotte for historisk import: last inn eldre Excel-filer med dato-parameter for aa bygge historikk bakover

### 2. Transaksjonsmodell med manuell registrering og PDF-import (Phase B)

#### Norske transaksjonstyper

Basert paa aksjeloven og det som rapporteres til aksjonaerregisteret:

| Type | Norsk | Beskrivelse |
|------|-------|-------------|
| `founding` | Stiftelse | Selskapet opprettes, foerste aksjer utstedes |
| `emission` | Emisjon / kapitalforhoeyelse | Nye aksjer utstedes, aksjekapital oekes |
| `sale_transfer` | Salg / overdragelse | Aksjer overfoeres fra en eier til en annen |
| `split` | Aksjesplitt | Aksjer deles opp (1:N) uten verdiendring |
| `reverse_split` | Aksjespleis | Aksjer slaas sammen (N:1) |
| `conversion` | Konvertering | Aksjer endrer klasse (f.eks. B -> A) |
| `redemption` | Innloesning | Selskapet kjoeper tilbake og sletter aksjer |
| `merger` | Fusjon | Selskaper slaas sammen, aksjer konverteres |
| `demerger` | Fisjon | Selskap deles, aksjer fordeles |
| `inheritance` | Arv | Aksjer overfoeres ved arv |
| `gift` | Gave | Vederlagsfri overdragelse |
| `write_down` | Nedskrivning | Aksjekapital settes ned |
| `import_diff` | Import-endring | Automatisk utledet fra diff mellom to Excel-importer |
| `manual_adjustment` | Manuell justering | Korreksjon / opprydding |

#### Transaksjons-metadata

Hver transaksjon inneholder:
- **Selskap** og **aksjeklasse**
- **Fra-aksjonaer** og **til-aksjonaer** (for salg/overdragelse)
- **Antall aksjer**, **pris per aksje** (vederlag), **total kostpris**
- **Aksjenummer-range** (fra-til)
- **Dato** (effektiv dato for transaksjonen)
- **Kilde**: import_batch (automatisk) eller manuell
- **Dokumentreferanse**: link til PDF, vedtak, protokoll
- **Kommentar**: fritekst

#### PDF-import

dcompany.no kan eksportere transaksjonshistorikk som PDF. Vi bygger en parser som:
- Leser standard dcompany.no PDF-format for transaksjoner
- Ekstrakter transaksjonstype, dato, aksjonaerer, antall, pris
- Matcher mot eksisterende aksjonaerer og selskaper
- Viser preview foer import bekreftes
- Oppretter transaksjoner i ledger

#### Manuell registrering

UI for aa registrere transaksjoner direkte:
- Typevelger med tilpassede skjemaer per transaksjonstype
- Emisjon: antall nye aksjer, pris, tegner(e), aksjeklasse
- Salg: selger, kjoeper, antall, pris, aksjeklasse
- Splitt: splittfaktor, aksjeklasse
- Validering: kan ikke selge mer enn man eier, aksjetall maa stemme
- Transaksjonen oppdaterer holdings automatisk

### 3. Historikk-visninger

- **Per selskap**: Tidslinje over transaksjoner, graf over aksjonaersammensetning over tid
- **Per aksjonaer**: Alle transaksjoner, eierandelsutvikling, kostpris-historikk
- **Oversikt**: Activity feed paa dashboard — siste endringer paa tvers av alle selskaper
- **Rapportgrunnlag**: Data strukturert slik det trengs for aarlig rapportering til aksjonaerregisteret

## Capabilities

Capabilities lister hva som skal spesifiseres i egne spec-filer:

1. **snapshot-diff** — Bevar historiske snapshots ved re-import, beregn diff, vis preview
2. **transaction-ledger** — Transaksjonsmodell med norske typer, metadata, validering
3. **manual-registration** — UI for manuell registrering av alle transaksjonstyper
4. **pdf-import** — Parser for dcompany.no PDF-eksporter av transaksjonshistorikk
5. **history-views** — Tidslinjer, grafer, activity feed, rapportgrunnlag

## Phases

### Phase A: Snapshot & Diff + Grunnleggende ledger
- Ny DB-tabell: `snapshots` (bevarer historisk tilstand)
- Ny DB-tabell: `transactions` (ledger)
- Diff-beregning ved re-import (sammenligner naavarende holdings med ny fil)
- Preview-steg i import-flyten: vis nye/endrede/fjernede aksjonaerer foer bekreftelse
- Automatisk opprettelse av `import_diff`-transaksjoner fra diff
- Grunnleggende tidslinje per selskap
- Stotte for aa importere eldre filer med dato for aa bygge historikk bakover

### Phase B: Manuell registrering + PDF-import
- UI for manuell registrering av transaksjoner (emisjon, salg, splitt, osv.)
- Validering: forretningsregler per transaksjonstype
- PDF-parser for dcompany.no transaksjonshistorikk
- Transaksjoner oppdaterer holdings-tabellen automatisk
- Activity feed paa dashboard

### Phase C: Avansert historikk og rapportering
- Grafer over eierandelsutvikling over tid (per selskap og per aksjonaer)
- Sammenligning mellom vilkaarlige tidspunkter
- Eksport av transaksjonshistorikk (CSV, PDF)
- Rapportgrunnlag for aksjonaerregisteret (skatteetaten.no-format)

## Constraints

- Excel-filene fra dcompany.no har ikke endringsinformasjon — all diff-logikk maa utledes fra sammenligning av snapshots
- Datoer for endringer mellom to importer er ukjente med mindre brukeren angir dato eksplisitt
- Manuelt registrerte transaksjoner maa sameksistere med import-utledede uten konflikter
- En transaksjon skal aldri kunne bryte konsistensen i holdings (f.eks. negativ aksjebeholdning)
- Eksisterende funksjonalitet (visninger, soek, struktur, entity resolution) skal ikke brekke
- PDF-formatet fra dcompany.no kan variere — parser maa vaere robust og flagge usikkerhet

## Impact

- **Eksisterende import**: Endres fra "overskriv" til "diff + bekreft". Ikke-destruktiv.
- **Holdings-tabellen**: Faar ny kolonne for snapshot-referanse. Eksisterende data beholdes som foerste snapshot.
- **Dashboard**: Utvides med activity feed.
- **Selskapssider**: Faar ny "Historikk"-fane.
- **Aksjonaersider**: Faar transaksjonshistorikk.

## Out of Scope (for naa)

- Integrasjon med Broennoeysundregistrene eller Altinn for automatisk henting/rapportering
- Digital signering eller juridisk gyldige aksjeeierbokfoersel
- Multi-bruker med tilgangskontroll
- Automatisk varsling ved eierskapsendringer
- Skattemessig inngangsverdi-beregning (FIFO/gjennomsnitt)
