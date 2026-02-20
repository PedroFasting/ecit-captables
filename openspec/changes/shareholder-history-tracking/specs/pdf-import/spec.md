# Spec: PDF Import (dcompany.no Transaction History)

## Overview

dcompany.no kan eksportere transaksjonshistorikk som PDF. Denne spec-en beskriver en parser som leser dette formatet og importerer transaksjoner til ledgeren.

## PDF Format

> **Merk**: Det eksakte PDF-formatet fra dcompany.no maa verifiseres mot et faktisk eksempel. Denne spec-en er basert paa forventet format og maa oppdateres naar vi har tilgang til ekte PDF-filer.

### Forventet struktur

dcompany.no genererer PDF-er med transaksjonshistorikk per selskap. Typisk innhold:

```
Aksjebok - [Selskapsnavn]
Org.nr: [org number]

Transaksjonshistorikk

Dato        Type                Fra                    Til                     Antall    Pris    Aksjeklasse
2024-01-15  Emisjon             -                      ECIT AS (123456789)     10000     100.00  A-aksjer
2024-03-01  Salg/overdragelse   Ola Nordmann (010190)  Kari Hansen (150285)    500       150.00  A-aksjer
2024-06-15  Aksjesplitt 1:10    -                      -                       -         -       A-aksjer
...
```

Alternativt kan formatet vaere mer ustrukturert:

```
15.01.2024 - Emisjon
  ECIT AS (org.nr 123456789) tegner 10 000 A-aksjer til kurs NOK 100,00 per aksje.
  Aksjekapital oeker fra NOK 1 000 000 til NOK 2 000 000.

01.03.2024 - Salg/overdragelse
  Ola Nordmann (f. 01.01.1990) overforer 500 A-aksjer til Kari Hansen (f. 15.02.1985)
  Vederlag: NOK 150,00 per aksje, totalt NOK 75 000,00.
```

## Parser Architecture

### Teknologivalg

**pdf-parse** (npm) for tekst-ekstraksjon fra PDF. Pakken er lightweight og fungerer server-side.

Alternativ: **pdf.js** (Mozilla) for mer avansert parsing med posisjonsinformasjon, men trolig overkill.

### Parsing Pipeline

```
PDF file
  |
  v
[1. Text extraction]  -- pdf-parse -> raw text
  |
  v
[2. Structure detection]  -- Identifiser selskap, org.nr, transaksjonsblokker
  |
  v
[3. Transaction parsing]  -- Parse hver transaksjon: type, dato, parter, antall, pris
  |
  v
[4. Entity matching]  -- Match parter mot eksisterende shareholders via entity resolution
  |
  v
[5. Validation]  -- Sjekk konsistens (aksjer balanserer, datoer er kronologiske)
  |
  v
[6. Preview]  -- Vis parsed transaksjoner for bruker, flagg usikre matches
  |
  v
[7. Import]  -- Opprett transaksjoner i ledger, oppdater holdings
```

### Steg 1: Text Extraction

```typescript
import pdf from "pdf-parse";

async function extractText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}
```

### Steg 2: Structure Detection

Identifiser:
- **Selskap**: Soek etter "Aksjebok" eller "Org.nr" linjer
- **Transaksjonsblokker**: Soek etter dato-moenster (DD.MM.YYYY eller YYYY-MM-DD) fulgt av transaksjonstype

```typescript
interface ParsedPdfDocument {
  companyName: string | null;
  companyOrgNumber: string | null;
  rawTransactions: RawPdfTransaction[];
  parseWarnings: string[];
}

interface RawPdfTransaction {
  rawText: string;           // Original tekst
  date: string | null;       // Parsed dato
  type: string | null;       // Raa type-tekst (f.eks. "Emisjon", "Salg/overdragelse")
  fromParty: string | null;  // Raa tekst for selger/avgiver
  toParty: string | null;    // Raa tekst for kjoeper/mottaker
  numShares: number | null;
  pricePerShare: number | null;
  shareClassName: string | null;
  confidence: number;        // 0-1, hvor sikker parseren er
}
```

### Steg 3: Transaction Parsing

For hvert PDF-format brukes regex-moenster:

**Norske transaksjonstyper aa gjenkjenne**:
- "Stiftelse" / "Selskapsstiftelse" -> `founding`
- "Emisjon" / "Kapitalforhoeyelse" / "Nytegning" -> `emission`
- "Salg" / "Overdragelse" / "Salg/overdragelse" -> `sale_transfer`
- "Aksjesplitt" / "Splitt" -> `split`
- "Aksjespleis" / "Spleis" -> `reverse_split`
- "Konvertering" -> `conversion`
- "Innloesning" -> `redemption`
- "Fusjon" -> `merger`
- "Fisjon" -> `demerger`
- "Arv" -> `inheritance`
- "Gave" -> `gift`
- "Nedskrivning" / "Kapitalnedsettelse" -> `write_down`

**Parti-matching**:
- Soek etter org.nr i parentes: `ECIT AS (923456789)` -> orgNumber = "923456789"
- Soek etter foedselsdato: `Ola Nordmann (f. 01.01.1990)` -> dateOfBirth = "1990-01-01"
- Soek etter foedselsdato kort: `Ola Nordmann (010190)` -> dateOfBirth = "1990-01-01"

**Tall-parsing**:
- Norsk format: `10 000` eller `10.000` (tusenskilletegn)
- Desimal: `100,00` (komma)
- Valuta: "NOK 100,00" eller "kr 100,00"

### Steg 4: Entity Matching

Bruk eksisterende entity resolution fra importeren:
1. Match paa org.nr (mest paalitelig)
2. Match paa foedselsdato + navn
3. Match paa normalisert navn + entity type

For umatched parter: flagg som "ny aksjonaer" og la brukeren bekrefte.

### Steg 5: Validation

- Datoer maa vaere kronologiske (advarsel, ikke feil)
- Salg: selger maa ha nok aksjer (advarsel — historisk saldo er kanskje ikke kjent)
- Emisjon: antall maa vaere positivt
- Splitt: faktor maa vaere et positivt heltall

Validering er "soft" — advarsler, ikke blokkering. PDF-data kan vaere ufullstendig.

### Steg 6: Preview

Vis parsed transaksjoner i en tabell:

| Status | Dato | Type | Fra | Til | Aksjer | Pris | Klasse | Confidence |
|--------|------|------|-----|-----|--------|------|--------|------------|
| OK | 15.01.2024 | Emisjon | - | ECIT AS | 10 000 | 100,00 | A | 95% |
| Advarsel | 01.03.2024 | Salg | Ola Nordmann | **Ukjent: Kari Hansen** | 500 | 150,00 | A | 70% |

- Groent: alt matchet, hoeyt confidence
- Gult: noe usikkert (lav confidence, umatched part)
- Roedt: parsing feilet, manuell input noedvendig

Brukeren kan:
- Korrigere feilparsede felt
- Matche ukjente parter manuelt
- Velge bort transaksjoner som ikke skal importeres
- Bekrefte hele batchen

## UI Flow

### Route: `/import` (utvides)

Legg til stotte for PDF i eksisterende import-side:
- Filtyper akseptert: `.xlsx` og `.pdf`
- For PDF: vises "PDF Transaction Import" i stedet for Excel-import

### Alternativt: `/companies/:id/import-transactions`

Kontekst-spesifikk import for et selskap:
- Brukeren velger selskap foerst, deretter laster opp PDF
- Fordel: vi vet allerede hvilket selskap det gjelder
- Bedre matching-kontekst

### PDF Import Wizard (3 steg)

**Steg 1: Upload**
- Dra-og-slipp PDF
- Valgfritt: velg selskap (om ikke allerede valgt)
- System parser PDF og viser fremdrift

**Steg 2: Review & Match**
- Vis alle parsed transaksjoner i tabell
- Flagg usikre matches med gul/roed markering
- La brukeren korrigere:
  - Dropdown for transaksjonstype (om feil-detektert)
  - Aksjonaer-soek for umatched parter
  - Rediger tall (aksjer, pris) om feilparset
- Confidence-score per transaksjon

**Steg 3: Confirm & Import**
- Sammendrag: "N transaksjoner klare, M advarsler, K feil"
- "Importer" / "Avbryt"
- Resultat: antall transaksjoner opprettet, holdings oppdatert

## API Endpoints

### Parse PDF (preview)
```
POST /api/import/pdf/parse
Body: multipart/form-data { file, company_id? }
Response: { document: ParsedPdfDocument, matchedTransactions: MatchedTransaction[] }
```

### Import parsed transactions
```
POST /api/import/pdf/confirm
Body: { company_id, transactions: ConfirmedTransaction[] }
Response: { imported: number, holdingsUpdated: number, warnings: string[] }
```

## Robustness

PDF-parsing er inherent usikkert. Strategier:

1. **Multiple regex patterns**: Prov flere moenster for samme felt. Bruk det med hoeyest confidence.
2. **Fuzzy matching**: For aksjonaernavn, bruk normalisert sammenligning (som eksisterende entity resolution).
3. **Graceful degradation**: Om et felt ikke kan parses, vis det som tomt med "ukjent" og la brukeren fylle inn.
4. **Confidence scoring**: Hver parsed verdi faar en confidence-score. Brukeren ser totalscoren per transaksjon.
5. **Format versioning**: Om dcompany.no endrer PDF-format, kan vi legge til nye parsere uten aa fjerne gamle.

## Dependencies

- Phase A (Snapshot & Diff) maa vaere ferdig foerst — transactions-tabellen maa eksistere
- Transaction ledger spec maa vaere implementert — vi oppretter transaksjoner via samme API
- Entity resolution (eksisterer) — brukes til aa matche parter

## Out of Scope

- OCR for skannede PDF-er (antar digital/tekst-basert PDF)
- Import fra andre formater enn dcompany.no
- Automatisk gjenkjenning av PDF-kilde (antar alltid dcompany.no)
