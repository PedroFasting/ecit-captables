# Design: Shareholder History Tracking

## Architecture Overview

Endringen utvider appen fra en snapshot-viewer til en ledger-basert aksjebok. Den sentrale designbeslutningen er:

> **Holdings-tabellen forblir "naavarende tilstand".** Transaksjoner forklarer hvordan man kom dit. Snapshots bevarer historiske tilstander.

```
                    ┌─────────────┐
                    │  Excel/PDF  │
                    │   Upload    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Diff Engine │  (Phase A)
                    │  compare()   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐     ┌──────────────┐
                    │   Preview   │────►│   User       │
                    │   UI        │◄────│   Confirms   │
                    └──────┬──────┘     └──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
       │  Snapshot   │ │ Tx   │ │  Holdings   │
       │  (history)  │ │ Log  │ │  (current)  │
       └─────────────┘ └──────┘ └─────────────┘
```

## Database Schema (Samlet)

### Nye tabeller

#### `snapshots`

```sql
CREATE TABLE snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id),
  snapshot_data   JSONB NOT NULL,
  effective_date  DATE NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX snapshots_company_id_idx ON snapshots(company_id);
CREATE INDEX snapshots_effective_date_idx ON snapshots(effective_date);
```

`snapshot_data` JSONB-struktur:
```json
{
  "company": {
    "shareCapital": "1000000.00",
    "totalShares": 100000,
    "nominalValue": "10.000000"
  },
  "shareClasses": [
    {
      "id": "uuid",
      "name": "A-aksjer",
      "totalShares": 80000,
      "nominalValue": "10.000000",
      "shareCapital": "800000.00"
    }
  ],
  "holdings": [
    {
      "shareholderId": "uuid",
      "shareholderName": "ECIT AS",
      "shareClassId": "uuid",
      "shareClassName": "A-aksjer",
      "numShares": 50000,
      "ownershipPct": "50.000000000000",
      "votingPowerPct": "50.000000000000"
    }
  ]
}
```

Vi denormaliserer navn inn i JSONB saa vi kan vise historiske snapshots uten joins.

#### `transactions`

```sql
CREATE TYPE transaction_type AS ENUM (
  'import_diff',
  'founding',
  'emission',
  'write_down',
  'sale_transfer',
  'inheritance',
  'gift',
  'split',
  'reverse_split',
  'conversion',
  'redemption',
  'merger',
  'demerger',
  'manual_adjustment'
);

CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type                  transaction_type NOT NULL,
  effective_date        DATE NOT NULL,
  description           TEXT,

  -- Parties
  from_shareholder_id   UUID REFERENCES shareholders(id),
  to_shareholder_id     UUID REFERENCES shareholders(id),

  -- Share data
  share_class_id        UUID REFERENCES share_classes(id),
  num_shares            BIGINT NOT NULL DEFAULT 0,
  price_per_share       NUMERIC(20, 4),
  total_amount          NUMERIC(20, 4),
  share_numbers_from    BIGINT,
  share_numbers_to      BIGINT,

  -- Before/after state
  shares_before         BIGINT,
  shares_after          BIGINT,

  -- Source tracking
  source                TEXT NOT NULL DEFAULT 'manual',
  import_batch_id       UUID REFERENCES import_batches(id),
  document_reference    TEXT,
  metadata              JSONB,

  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  created_by            TEXT
);

CREATE INDEX transactions_company_id_idx ON transactions(company_id);
CREATE INDEX transactions_effective_date_idx ON transactions(effective_date);
CREATE INDEX transactions_from_shareholder_idx ON transactions(from_shareholder_id);
CREATE INDEX transactions_to_shareholder_idx ON transactions(to_shareholder_id);
CREATE INDEX transactions_type_idx ON transactions(type);
CREATE INDEX transactions_import_batch_idx ON transactions(import_batch_id);
```

### Endringer i eksisterende tabeller

```sql
ALTER TABLE import_batches ADD COLUMN effective_date DATE;
```

## Drizzle Schema (TypeScript)

Nye tabeller legges til i `app/src/db/schema/index.ts`:

```typescript
// ── Enums ──────────────────────────────────────────────
export const transactionTypeEnum = pgEnum("transaction_type", [
  "import_diff",
  "founding",
  "emission",
  "write_down",
  "sale_transfer",
  "inheritance",
  "gift",
  "split",
  "reverse_split",
  "conversion",
  "redemption",
  "merger",
  "demerger",
  "manual_adjustment",
]);

// ── Snapshots ──────────────────────────────────────────
export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  snapshotData: jsonb("snapshot_data").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("snapshots_company_id_idx").on(table.companyId),
  index("snapshots_effective_date_idx").on(table.effectiveDate),
]);

// ── Transactions ───────────────────────────────────────
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  effectiveDate: date("effective_date").notNull(),
  description: text("description"),

  fromShareholderId: uuid("from_shareholder_id").references(() => shareholders.id),
  toShareholderId: uuid("to_shareholder_id").references(() => shareholders.id),

  shareClassId: uuid("share_class_id").references(() => shareClasses.id),
  numShares: bigint("num_shares", { mode: "number" }).notNull().default(0),
  pricePerShare: numeric("price_per_share", { precision: 20, scale: 4 }),
  totalAmount: numeric("total_amount", { precision: 20, scale: 4 }),
  shareNumbersFrom: bigint("share_numbers_from", { mode: "number" }),
  shareNumbersTo: bigint("share_numbers_to", { mode: "number" }),

  sharesBefore: bigint("shares_before", { mode: "number" }),
  sharesAfter: bigint("shares_after", { mode: "number" }),

  source: text("source").notNull().default("manual"),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  documentReference: text("document_reference"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
}, (table) => [
  index("transactions_company_id_idx").on(table.companyId),
  index("transactions_effective_date_idx").on(table.effectiveDate),
  index("transactions_from_shareholder_idx").on(table.fromShareholderId),
  index("transactions_to_shareholder_idx").on(table.toShareholderId),
  index("transactions_type_idx").on(table.type),
  index("transactions_import_batch_idx").on(table.importBatchId),
]);
```

## Import Pipeline Changes (Phase A)

Naavarende flyt:
```
upload -> parse -> (delete old) -> insert new
```

Ny flyt:
```
upload -> parse -> diff against current -> preview -> confirm -> snapshot + insert + transactions
```

### Diff Engine

Ny modul: `app/src/lib/import/diff.ts`

```typescript
export function calculateDiff(
  currentHoldings: CurrentHolding[],
  parsedShareholders: ParsedShareholder[],
  entityResolver: EntityResolver
): ImportDiff
```

Diff-motoren er en ren funksjon — ingen DB-tilgang. Den tar inn naavarende state og ny state, og returnerer en diff.

### Snapshot Creator

Ny modul: `app/src/lib/import/snapshot.ts`

```typescript
export async function createSnapshot(
  tx: Tx,
  companyId: string,
  importBatchId: string,
  effectiveDate: string
): Promise<string>  // returns snapshot ID
```

Leser naavarende share classes + holdings, serialiserer til JSONB, lagrer.

### Import Coordinator (endret)

`importer.ts` endres fra "overskriv" til "koordiner":

```typescript
// Ny eksportert funksjon
export async function previewImport(buffer: Buffer, fileName: string): Promise<ImportPreview>

// Endret eksportert funksjon  
export async function confirmImport(
  buffer: Buffer, 
  fileName: string, 
  effectiveDate?: string
): Promise<ImportResult>
```

`confirmImport` gjor:
1. Parse Excel
2. Beregn diff
3. Ta snapshot av naavarende tilstand
4. Gjennomfoer import (som foer)
5. Opprett transaksjoner basert paa diff
6. Returner resultat med diff-sammendrag

## Frontend Changes

### Import-side (Phase A)

Ny stepper-komponent:

```
[1. Upload] -> [2. Preview Diff] -> [3. Result]
```

Preview-steget viser:
- Sammendrag-kort (nye, utgaatte, endrede, uendrede)
- Diff-tabell med fargekodet endringer
- Datofelt for historisk import
- Bekreft/avbryt-knapper

### Selskapsside (Phase A/B)

Ny "Historikk"-fane med:
- Tidslinje over transaksjoner (nyeste foerst)
- Hver transaksjon viser: dato, type, parter, aksjer, kilde
- Filter paa transaksjonstype

### Aksjonaerside (Phase B)

Ny "Transaksjoner"-seksjon med:
- Alle transaksjoner for aksjonaeren paa tvers av selskaper
- Grouped by selskap eller kronologisk

### Dashboard (Phase B)

Ny "Siste aktivitet"-seksjon:
- Activity feed med siste 10 transaksjoner paa tvers av alle selskaper
- Klikk for aa gaa til transaksjon

## Migration Strategy

### Eksisterende data

Eksisterende holdings representerer foerste kjente tilstand. Ved foerste import med diff-stoetle:

1. **Opprett initielt snapshot** for hvert selskap med eksisterende data (migration script)
2. Marker snapshotet med `effective_date` = tidspunkt for original import (fra `import_batches.imported_at`)
3. Opprett `import_diff` transaksjoner med type=`founding` for alle eksisterende holdings (shares_before=0, shares_after=current)

Dette gjor at historikk-visningen har en startpunkt.

### Database migration

Bruk Drizzle Kit:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## File Structure (new/modified)

```
app/src/
  db/schema/index.ts              # + snapshots, transactions, transactionTypeEnum
  lib/import/
    diff.ts                       # NEW: diff engine
    snapshot.ts                   # NEW: snapshot creator
    importer.ts                   # MODIFIED: preview + confirm flow
    pdf-parser.ts                 # NEW (Phase B): PDF parsing
  app/
    import/page.tsx               # MODIFIED: preview step
    companies/[id]/
      page.tsx                    # MODIFIED: + Historikk tab
      transactions/
        page.tsx                  # NEW (Phase B): transaction list
        new/page.tsx              # NEW (Phase B): manual registration
    shareholders/[id]/
      page.tsx                    # MODIFIED: + Transaksjoner section
    api/
      import/
        route.ts                  # MODIFIED: preview/confirm
        preview/route.ts          # NEW: preview endpoint
      companies/[id]/
        snapshots/route.ts        # NEW: snapshot list
        transactions/route.ts     # NEW: transaction CRUD
      shareholders/[id]/
        transactions/route.ts     # NEW: shareholder transactions
```
