# Design: Bootstrap ECIT Cap Tables App

## Architecture Overview

Next.js full-stack applikasjon med PostgreSQL database. Server-side rendering for dashboards, API routes for dataoperasjoner, og React-klient for interaktive visualiseringer.

```
┌─────────────────────────────────────────────┐
│                Next.js App                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Pages/   │  │  API      │  │  Import   │  │
│  │  Views    │  │  Routes   │  │  Pipeline │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │              │         │
│  ┌────┴──────────────┴──────────────┴─────┐  │
│  │          Drizzle ORM / Service Layer    │  │
│  └────────────────┬───────────────────────┘  │
└───────────────────┼──────────────────────────┘
                    │
            ┌───────┴───────┐
            │  PostgreSQL   │
            └───────────────┘
```

## Tech Stack

| Layer | Valg | Begrunnelse |
|-------|------|-------------|
| Framework | Next.js 15 (App Router) | Full-stack, SSR, API routes i ett |
| UI | React + Tailwind CSS + shadcn/ui | Rask utvikling, god komponentbibliotek |
| ORM | Drizzle ORM | Type-safe, lettvekt, god PostgreSQL-stoette |
| Database | PostgreSQL (via Docker) | Relasjonell, samtidige brukere, materialized views, full-text search |
| Excel-parsing | xlsx (SheetJS) | Moden lib for .xlsx-parsing i Node.js |
| Visualisering | React Flow + D3.js | React Flow for interaktive grafer, D3 for diagrammer |
| Charts | Recharts | Enkle diagrammer for statistikk |

## Data Model

### Core Tables

```
companies
├── id (uuid, PK)
├── name (text) - "ECIT TopCo AS"
├── org_number (text, unique) - "932969750" (normalisert, uten mellomrom)
├── share_capital (decimal)
├── total_shares (bigint)
├── total_votes (bigint)
├── nominal_value (decimal)
├── created_at / updated_at
│
├── share_classes[]
│   ├── id (uuid, PK)
│   ├── company_id (FK)
│   ├── name (text) - "A-shares", "B-shares", "Preference shares", "Common shares"
│   ├── total_shares (bigint)
│   ├── nominal_value (decimal)
│   ├── share_capital (decimal)
│   ├── total_votes (bigint)
│   └── remarks (text) - f.eks. stemmebegrensninger
│
└── import_batches[]
    ├── id (uuid, PK)
    ├── imported_at (timestamp)
    ├── source_file (text)
    └── company_id (FK)

shareholders
├── id (uuid, PK)
├── canonical_name (text) - normalisert hovednavn
├── org_number (text, nullable) - for selskapsaksjonaerer
├── date_of_birth (date, nullable) - for personlige aksjonaerer
├── entity_type (enum: 'company' | 'person')
├── country (text)
├── created_at / updated_at
│
├── shareholder_aliases[]
│   ├── id (uuid, PK)
│   ├── shareholder_id (FK)
│   ├── name_variant (text) - "BENT LUND HOLDING AS" etc.
│   ├── email (text, nullable)
│   └── source_company_id (FK) - hvor aliaset ble funnet
│
└── shareholder_contacts[]
    ├── id (uuid, PK)
    ├── shareholder_id (FK)
    ├── email (text)
    ├── phone (text)
    ├── address (text)
    └── is_primary (boolean)

holdings
├── id (uuid, PK)
├── shareholder_id (FK)
├── company_id (FK)
├── share_class_id (FK)
├── num_shares (bigint)
├── ownership_pct (decimal) - beregnet eierandel
├── voting_power_pct (decimal) - beregnet stemmeandel
├── total_cost_price (decimal)
├── entry_date (date)
├── share_numbers (text) - "1-3000;3001-3100"
├── is_pledged (boolean)
├── pledge_details (text)
├── import_batch_id (FK)
└── created_at / updated_at

-- Denormalisert view for raske oppslag
shareholder_summary (materialized view)
├── shareholder_id
├── total_companies (int) - antall selskaper de eier aksjer i
├── total_shares_value (decimal)
├── companies_list (jsonb) - [{company, ownership, shares}]
```

## Import Pipeline

Flertrinns pipeline som haandterer Excel-parsing, datarensing og entity resolution:

```
Excel-fil (.xlsx)
    │
    ▼
[1. Parse Header]
    - Hent selskapsnavn + org.nr fra rad 2
    - Identifiser aksjeklasser (Common / A+B+Preference)
    - Les metadata: antall aksjer, paalydende, aksjekapital
    │
    ▼
[2. Parse Aksjonaerer]
    - Finn header-rad (varierer: rad 11 eller 31)
    - Map kolonner dynamisk basert paa header
    - Parse hver aksjonaer-rad
    - Ignorer "Total"-rader og footer
    │
    ▼
[3. Normaliser Data]
    - Org.nr: fjern mellomrom, legg til landsprefiks (DK-nummer)
    - Navn: trim whitespace
    - Epost: lowercase
    - Datoer: standardiser format
    │
    ▼
[4. Entity Resolution]
    - Match mot eksisterende aksjonaerer paa org.nr (primaer noekkel)
    - For personer uten org.nr: match paa foedselsdato + navn
    - Flagg konflikter (ulike navn, ulike epostadresser) for review
    - Auto-merge ved hoey konfidensgrad (kun casing-forskjell)
    │
    ▼
[5. Lagre]
    - Opprett/oppdater selskap, aksjeklasser
    - Opprett/oppdater aksjonaerer med aliaser
    - Opprett holdings
    - Logg import-batch
```

## Entity Resolution Strategy

Tre nivaaer av matching:

1. **Auto-merge (hoey konfidens)**: Samme org.nr, kun casing-forskjell i navn
   - "BENT LUND HOLDING AS" ↔ "Bent Lund Holding AS" → automatisk merge
2. **Auto-merge med flagg**: Samme org.nr, ulik epost
   - Begge epostadresser lagres, flagges for review
3. **Manuell review**: Ingen org.nr-match, men liknende navn
   - Presenteres i admin-UI for manuell beslutning

## Pages / Views

### 1. Dashboard (/)
- Oversikt: antall selskaper, aksjonaerer, total aksjekapital
- Siste importjobb-status
- Topp aksjonaerer (etter antall selskaper de eier i)

### 2. Selskaper (/companies)
- Liste over alle selskaper med soek
- Klikk for detalj-side

### 3. Selskapsdetalj (/companies/[id])
- Selskapsinfo (navn, org.nr, aksjekapital, aksjeklasser)
- Aksjonaerliste med eierandeler, stemmerett
- Filtrering per aksjeklasse

### 4. Aksjonaerer (/shareholders)
- Soekbar liste over alle aksjonaerer
- Vis antall selskaper de eier i
- Filtrering: selskapsaksjonaerer vs. privatpersoner

### 5. Aksjonaerdetalj (/shareholders/[id])
- All info om aksjonaeren
- Liste over alle selskaper de eier aksjer i, med detaljer per selskap
- Kjente aliaser og kontaktinfo
- Eierskap visualisert som mini-graf

### 6. Konsernstruktur (/structure)
Flere views:
- **Trevisning**: Hierarkisk tre fra TopCo nedover
- **Grafvisning**: Interaktiv node-graf med React Flow
- **Tabellvisning**: Flat tabell med parent-child-relasjoner
- Klikk paa node for aa navigere til selskapsdetalj

### 7. Krysseierskap (/cross-ownership)
- Aksjonaerer som finnes i flere selskaper
- Gruppert visning: klikk aksjonaer → se alle deres eierskap
- Filtrer paa minimumsantall selskaper

### 8. Import (/import)
- Last opp Excel-filer
- Vis import-status og eventuelle konflikter
- Entity resolution review-koe

### 9. Datarensing (/data-cleanup)
- Liste over flaggede konflikter
- Merge/split aksjonaerer manuelt
- Alias-haandtering

## Key Technical Decisions

1. **Org.nr som primaernoekkel for matching** - mer paalitelig enn navn
2. **Aliases-tabell** - bevar alle varianter av navn/epost, velg ett kanonisk
3. **Import batches** - sporbarhet for hvilken fil data kom fra
4. **Materialized view for summary** - unngaa tunge JOINs paa dashboards
5. **Docker Compose for PostgreSQL** - enkel lokal utvikling
6. **Server Components der mulig** - raskere lasting, mindre JS til klient
7. **React Flow for graf-visualisering** - moden lib, god interaktivitet, bygd for React
