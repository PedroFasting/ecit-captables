# Tasks: Shareholder History Tracking

## Phase A: Snapshot & Diff + Grunnleggende Ledger

### 1. Database Schema
- [x] Legg til `transactionTypeEnum` i schema
- [x] Legg til `snapshots`-tabell med JSONB snapshot_data
- [x] Legg til `transactions`-tabell med alle kolonner og indekser
- [x] Legg til `effective_date` paa `import_batches`
- [x] Legg til relations for nye tabeller
- [x] Kjoer `drizzle-kit push` (brukte push i stedet for migrate)
- [x] Verifiser at migration fungerer mot eksisterende data

### 2. Migration Script: Initial Snapshots
- [x] Skriv script som oppretter foerste snapshot for hvert selskap med eksisterende data
- [x] Sett `effective_date` fra `import_batches.imported_at`
- [x] Opprett `import_diff`-transaksjoner (type new) for alle eksisterende holdings
- [x] Kjoer og verifiser mot prod-data (38 snapshots, 559 transactions)

### 3. Diff Engine
- [x] Opprett `app/src/lib/import/diff.ts`
- [x] Implementer `calculateDiff()` — sammenligner naavarende holdings med parsed Excel
- [x] Refaktorer entity resolution til read-only modus for preview (match uten aa skrive)
- [x] Handter share class-endringer (nye, fjernede, endrede)
- [x] Handter shareholder-endringer (new, exited, increased, decreased, unchanged)
- [x] Beregn summary (antall av hver type)

### 4. Snapshot Creator
- [x] Opprett `app/src/lib/import/snapshot.ts`
- [x] Implementer `createSnapshot()` — serialiser naavarende state til JSONB
- [x] Inkluder denormaliserte navn for historisk visning

### 5. Importer Refactoring
- [x] Legg til `previewImport()` funksjon i `importer.ts`
- [x] Legg til `confirmImport()` funksjon
- [x] Behold eksisterende `importExcelFile()` som wrapper (bakoverkompatibel)
- [x] Opprett `import_diff`-transaksjoner automatisk fra diff-resultat

### 6. API Routes
- [x] Ny: `POST /api/import/preview` — returner diff uten aa importere
- [x] Endre: `POST /api/import` — stott `confirmed` parameter
- [x] Ny: `GET /api/companies/:id/snapshots` — list snapshots for selskap
- [x] Ny: `GET /api/companies/:id/transactions` — list transaksjoner for selskap

### 7. Import UI: Preview Step
- [x] Refaktorer import-siden til stepper (Upload -> Preview -> Result)
- [x] Bygg preview-komponent med diff-tabell
- [x] Fargekodet rader: groenn (ny), roed (utgaatt), gul (endret), graa (uendret)
- [x] Share class-endringer oeverst
- [x] Sammendrag-kort med tall
- [x] Bekreft/avbryt-knapper
- [x] Hopp over preview for foerstegangsimport

### 8. Company Detail: Historikk-fane
- [x] Legg til "Historikk"-tab paa selskapsside
- [x] Vis transaksjoner i tidslinje (nyeste foerst), gruppert per dato
- [x] Vis type, dato, beskrivelse, aksjer, foer/etter, kilde for hver transaksjon
- [x] Filter paa transaksjonstype

### 9. Testing & Verification
- [ ] Importer en Excel-fil for et selskap (foerstegangsimport)
  - Verifiser: snapshot opprettet, transaksjoner logget
- [ ] Re-importer samme fil
  - Verifiser: diff viser 0 endringer
- [ ] Importer oppdatert fil (endret aksjonaerdata)
  - Verifiser: diff viser korrekte endringer, preview er riktig
  - Verifiser: snapshot bevarer gammel tilstand
  - Verifiser: transaksjoner logges korrekt
- [x] Build og lint passerer
- [ ] Commit og push

---

## Phase B: Manuell Registrering + PDF Import

### 10. Transaction Validation Engine
- [ ] Opprett `app/src/lib/transactions/validate.ts`
- [ ] Implementer valideringsregler per transaksjonstype
- [ ] Implementer holdings-oppdateringslogikk per type
- [ ] Test valideringsreglene

### 11. Transaction API (CRUD)
- [ ] `POST /api/companies/:id/transactions` — opprett transaksjon + oppdater holdings
- [ ] `POST /api/companies/:id/transactions/validate` — preview uten aa lagre
- [ ] `GET /api/shareholders/:id/transactions` — aksjonaerens transaksjoner
- [ ] Test alle endpoints

### 12. Manual Registration UI
- [ ] Opprett `/companies/:id/transactions/new` side
- [ ] Typevelger med grupperte transaksjonstyper
- [ ] Dynamiske skjemaer per type (emisjon, salg, splitt, osv.)
- [ ] Aksjonaer-velger med soek
- [ ] Validering og foer/etter-preview
- [ ] Bekreftelsesside

### 13. PDF Parser
- [ ] Installer `pdf-parse` dependency
- [ ] Opprett `app/src/lib/import/pdf-parser.ts`
- [ ] Tekst-ekstraksjon fra PDF
- [ ] Strukturgjenkjenning (selskap, transaksjonsblokker)
- [ ] Transaksjonstype-matching (norske termer -> enum)
- [ ] Parti-parsing (org.nr, foedselsdato, navn)
- [ ] Tall-parsing (norsk format)
- [ ] Confidence scoring

### 14. PDF Import UI
- [ ] Utvid import-siden til aa akseptere PDF
- [ ] Review & match-steg for parsed transaksjoner
- [ ] Korreksjonsmuligheter for brukeren
- [ ] Bekreftelse og import

### 15. Dashboard Activity Feed
- [ ] Ny "Siste aktivitet"-seksjon paa dashboard
- [ ] Vis siste 10 transaksjoner paa tvers av selskaper
- [ ] Klikk for aa navigere til selskap/transaksjon

### 16. Shareholder Transaction History
- [ ] Legg til "Transaksjoner"-seksjon paa aksjonaerside
- [ ] Vis alle transaksjoner, gruppert per selskap
- [ ] Kronologisk tidslinje

---

## Phase C: Avansert Historikk og Rapportering (fremtidig)

### 17. Grafer og Visualisering
- [ ] Eierandelsutvikling over tid (linjegraf per selskap)
- [ ] Aksjonaersammensetning over tid (stacked bar)

### 18. Eksport
- [ ] CSV-eksport av transaksjonshistorikk
- [ ] PDF-eksport av aksjebok

### 19. Rapportering
- [ ] Rapportgrunnlag for aksjonaerregisteret
- [ ] Format tilpasset skatteetaten.no
