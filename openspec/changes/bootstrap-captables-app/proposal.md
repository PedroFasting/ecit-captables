# Proposal: Bootstrap ECIT Cap Tables App

## Problem

ECIT-konsernet har en kompleks eierstruktur med 12+ selskaper og hundrevis av aksjonaerer. Aksjonaerdata eksporteres fra dcompany.no som separate Excel-filer per selskap. Det finnes ingen enkel maate aa:

- Se hvem som eier hva paa tvers av alle selskaper
- Foelge en aksjonaer og se alle selskapene de har eierandel i
- Visualisere konsernstrukturen (TopCo -> MidCo -> BidCo -> holdingselskaper -> ManCo/datterselskaper)
- Identifisere krysseierskap og eierskapsmoenstre

I dag krever dette manuell gjennomgang av 12 separate regneark med ulike aksjeklasser (A, B, Preference) og opptil 400 aksjonaerer per selskap.

## Solution

En intern web-applikasjon (Next.js/React) som:

1. **Importerer aksjonaerboeker** fra dcompany.no Excel-eksporter og parser dem til en strukturert database
2. **Datarensing og entity resolution** - identifiser og slaa sammen duplikater (ulike skrivemaater, store/smaa bokstaver, ulike epostadresser for samme org.nr)
3. **Viser aksjonaeroversikt** - soekbar database over alle aksjonaerer paa tvers av selskaper
4. **Eierskapsanalyse** - velg en aksjonaer (eller en gruppe) og se alt de eier, med eierandeler, stemmerett og aksjeklasser
5. **Konsernstruktur-visualisering** - flere views: trestruktur, graf, tabell
6. **Krysseierskap-deteksjon** - identifiser aksjonaerer som gaar igjen paa tvers av selskaper

## Data Landscape

Datakilden er Excel-filer eksportert fra dcompany.no med standardisert format:

- **Header-seksjon** (rad 0-10/30): Selskapsnavn, org.nr, aksjeklasser med antall/paalydende/aksjekapital/stemmer
- **Kolonne-header** (rad 11 eller 31): Name, Org.nr, Number of shares, Ownership, Voting power, per aksjeklasse
- **Aksjonaer-rader**: En rad per aksjonaer med alle detaljer
- **Aksjeklasser varierer**: Noen selskaper har kun "Common shares", andre har A/B/Preference

Selskaper i datasettet:
- ECIT TopCo AS (932 969 750) - ~400 aksjonaerer, 3 aksjeklasser
- ECIT Midco Holding AS - eier av MidCo 2
- ECIT Midco 2 AS - eier av BidCo
- ECIT Bidco AS - eier av ECIT AS
- ECIT AS - hovedselskapet
- ECIT F&A Holding AS, ECIT IT Consulting Holding AS, ECIT IT Managed Services Holding AS, ECIT Tech Holding AS - vertikale holdingselskaper
- ECIT ITC ManCo AS, ECIT ITMS ManCo AS - management company-selskaper
- Club United AS - tilknyttet selskap

## Data Quality Issues (identifisert fra analyse)

Analysen av de 12 Excel-filene avdekket foelgende reelle problemer:

### Navnekonflikter (casing)
Samme aksjonaer skrives ulikt paa tvers av aksjonaerboeker:
- "ECIT MIDCO HOLDING AS" vs "ECIT Midco Holding AS" (org 822018262)
- "ECIT TopCo AS" vs "ECIT Topco AS" (org 932969750)
- "BENT LUND HOLDING AS" vs "Bent Lund Holding AS" (org 922705542)
- ~15 flere tilfeller av UPPERCASE vs Title Case

### Epostkonflikter
Samme aksjonaer (identifisert via org.nr) har ulike epostadresser i ulike selskaper:
- ecit.no vs ecit.com (f.eks. mdaland@ecit.com vs mdaland@ecit.no)
- ecit.no vs ecitsolutions.no (f.eks. joacim.lande@ecit.no vs ecitsolutions.no)
- Privat epost vs firmaepost (f.eks. paalbt@gmail.com vs ecitsolutions.no)

### Org.nr-formatkonflikter
Danske selskaper bruker inkonsistent format:
- "31499402" vs "DK31499402" for Mikkel Walde Holding ApS
- "38971131" vs "DK38971131" for Stoker Holding ApS

### Konsekvens
Uten datarensing vil samme aksjonaer dukke opp som flere ulike entiteter, og krysseierskap-analysen blir feilaktig. Entity resolution basert paa org.nr (med normalisering) er noedvendig.

## Scope

### In scope
- Excel-import/parser for dcompany.no-format
- Datarensing: entity resolution basert paa org.nr med normalisering
- Manuell merge-UI for tvilstilfeller
- Aksjonaerdatabase med soek og filtrering
- Aksjonaer-profilsider med krysseierskap
- Konsernstruktur-visualisering (flere views: tre, graf, tabell)
- Next.js web-app med PostgreSQL backend
- Aksjeklasse-haandtering (A, B, Preference, Common)

### Out of scope (for naa)
- Sanntidsintegrasjon med dcompany.no API
- Historisk eierskapsendring over tid
- Autentisering/tilgangsstyring (foerste versjon er internt)
- Verdivurdering eller finansielle beregninger
- Eksport-funksjonalitet

## Risks

- **Datakvalitet**: Excel-formatet kan variere mellom eksporter eller over tid
- **Personvern**: Aksjonaerdata inneholder personnummer og foedselsdatoer - maa haandteres forsvarlig
- **Skalering**: TopCo har 400 aksjonaerer, men datasettet er relativt lite totalt sett - ikke et reelt problem

## Success Criteria

- Kan importere alle 12 Excel-filer uten feil
- Kan soeke opp en aksjonaer og se alle selskaper de eier aksjer i
- Konsernstruktur er korrekt visualisert
- Kan identifisere aksjonaerer som gaar igjen i flere selskaper
