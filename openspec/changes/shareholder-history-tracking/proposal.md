# Proposal: Shareholder History Tracking

## Problem

ECIT Cap Tables fungerer i dag som en **snapshot viewer** — den viser siste versjon av aksjeeierboken for hvert selskap, men har ingen historikk. Naar en ny Excel-fil importeres, overskriver den forrige fullstendig:

- Aksjeklasser og holdings slettes og re-opprettes fra scratch
- Ingen diff mellom gammel og ny versjon beregnes
- Endringer i eierskap (nye aksjonaerer, salg, emisjoner) er usynlige
- Det er umulig aa spore hvordan en aksjonaers eierandel har utviklet seg over tid

For en organisasjon som ECIT med aktiv konsolidering, emisjoner, interne salg og ManCo-programmer, er det kritisk aa forstaa **hvordan** eierskapet endrer seg — ikke bare hvordan det ser ut akkurat naa.

## Solution

Utvide applikasjonen fra "snapshot viewer" til en **fullstendig aksjebok med historikk**. Hovedelementene:

### 1. Snapshot-basert import med diff

Naar en ny Excel-fil importeres for et selskap som allerede har data:
- Behold forrige versjon som et historisk snapshot
- Beregn diff automatisk: nye aksjonaerer, utgaatte aksjonaerer, endringer i antall aksjer, eierandel, aksjeklasse
- Vis endringene for brukeren foer de bekreftes
- Logg endringene som transaksjoner (se under)

### 2. Transaksjonsmodell

En ny tabell `transactions` som logger hver endring i eierskap:
- **Type**: `import_new` (ny aksjonaer), `import_increase` (flere aksjer), `import_decrease` (faerre aksjer), `import_exit` (aksjonaer borte), `emission` (kapitalutvidelse), `internal_sale`, `external_sale`, `split`, `conversion`, `manual_adjustment`
- **Metadata**: Fra-aksjonaer, til-aksjonaer (for salg), antall aksjer, pris per aksje, aksjeklasse, dato, kilde (import batch eller manuell), kommentar
- Transaksjoner utledet fra import-diff opprettes automatisk
- Manuelle transaksjoner kan registreres direkte

### 3. Historikk-visninger

- **Per selskap**: Tidslinje over endringer, graf over aksjonaersammensetning over tid
- **Per aksjonaer**: Historikk over alle transaksjoner, eierandelsutvikling
- **Oversikt**: Siste endringer paa tvers av alle selskaper (activity feed)

### 4. Import-forbedringer

- **Preview-steg**: Vis diff foer import bekreftes (nye/endrede/fjernede aksjonaerer)
- **Batch-sammenligning**: Sammenlign to vilkaarlige importtidspunkter
- **Historisk import**: Last inn eldre Excel-filer (med dato-parameter) for aa bygge historikk bakover

## Phases

Vi anbefaler en fasedelt tilnaerming:

### Phase A: Snapshot & Diff (MVP)
- Behold historiske snapshots ved re-import
- Beregn og vis diff mellom to importer
- Preview-steg i import-flyten
- Grunnleggende tidslinje per selskap

### Phase B: Transaksjonsmodell
- DB-schema for transaksjoner
- Automatisk transaksjonsutledning fra diffs
- Transaksjonshistorikk per aksjonaer
- Activity feed paa dashboard

### Phase C: Manuell registrering
- UI for aa registrere manuelle transaksjoner (emisjoner, salg, splitter)
- Validering mot eksisterende data (kan ikke selge mer enn man har)
- Stoetle for ulike transaksjonstyper med tilpassede skjemaer

### Phase D: Avansert historikk
- Grafer over eierandelsutvikling over tid
- Historisk import (eldre filer med dato)
- Eksport av transaksjonshistorikk
- Sammenligning mellom vilkaarlige tidspunkter

## Constraints

- Excel-filene fra dcompany.no har ikke endringsinformasjon — all diff-logikk maa utledes fra sammenligning av snapshots
- Datoer for endringer mellom to importer er ukjente (vi vet bare "mellom import A og import B skjedde dette")
- Manuelt registrerte transaksjoner maa kunne sameksistere med import-utledede
- Eksisterende funksjonalitet (visninger, soek, struktur) skal ikke brekke

## Out of Scope (for naa)

- Integrasjon med Broennoeysundregistrene eller Altinn for automatisk henting
- Digital signering eller juridisk gyldige aksjeeierbokfoersel
- Multi-bruker med tilgangskontroll (kan komme senere)
- Automatisk varsling ved eierskapsendringer
