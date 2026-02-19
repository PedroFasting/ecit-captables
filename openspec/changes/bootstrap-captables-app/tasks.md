# Tasks: Bootstrap ECIT Cap Tables App

## Phase 1: Project Setup

- [ ] Initialiser Next.js 15 med App Router, TypeScript, Tailwind CSS
- [ ] Sett opp Docker Compose med PostgreSQL
- [ ] Installer og konfigurer Drizzle ORM med PostgreSQL-driver
- [ ] Sett opp shadcn/ui komponentbibliotek
- [ ] Konfigurer prosjektstruktur: `src/app/`, `src/lib/`, `src/components/`, `src/db/`
- [ ] Sett opp ESLint, Prettier, .env-haandtering

## Phase 2: Database Schema

- [ ] Definer Drizzle-schema for `companies`
- [ ] Definer Drizzle-schema for `share_classes`
- [ ] Definer Drizzle-schema for `shareholders` med `entity_type` enum
- [ ] Definer Drizzle-schema for `shareholder_aliases`
- [ ] Definer Drizzle-schema for `shareholder_contacts`
- [ ] Definer Drizzle-schema for `holdings`
- [ ] Definer Drizzle-schema for `import_batches`
- [ ] Kjoer foerste migrasjon og verifiser schema i PostgreSQL
- [ ] Lag materialized view for `shareholder_summary`

## Phase 3: Excel Import Pipeline

- [ ] Implementer Excel-parser: les header-seksjon (selskapsnavn, org.nr, aksjeklasser)
- [ ] Implementer dynamisk header-deteksjon (rad 11 vs rad 31, varierende kolonner)
- [ ] Implementer aksjonaer-rad-parsing med haandtering av "Total"/"Exported" rader
- [ ] Implementer data-normalisering (org.nr-format, casing, epost, DK-prefix)
- [ ] Implementer entity resolution: auto-merge paa org.nr med casing-forskjell
- [ ] Implementer entity resolution: flagg konflikter (ulik epost, ulike representanter)
- [ ] Implementer database-insert med upsert-logikk (oppdater eksisterende, opprett nye)
- [ ] Implementer import-batch-logging
- [ ] Test import med alle 12 Excel-filer, verifiser 0 feil
- [ ] Lag seed-script som importerer alle filene fra `Aksjeeierbøker/`

## Phase 4: API Routes

- [ ] `GET /api/companies` - liste alle selskaper med soek/filtrering
- [ ] `GET /api/companies/[id]` - selskapsdetalj med aksjonaerer og aksjeklasser
- [ ] `GET /api/shareholders` - liste alle aksjonaerer med soek/filtrering
- [ ] `GET /api/shareholders/[id]` - aksjonaerdetalj med alle holdings
- [ ] `GET /api/structure` - konsernstruktur som tre/graf-data
- [ ] `GET /api/cross-ownership` - aksjonaerer med eierskap i flere selskaper
- [ ] `POST /api/import` - last opp og prosesser Excel-fil
- [ ] `GET /api/import/conflicts` - liste flaggede konflikter
- [ ] `POST /api/shareholders/merge` - slaa sammen to aksjonaer-entiteter
- [ ] `GET /api/stats` - dashboard-statistikk

## Phase 5: UI - Layout og Navigasjon

- [ ] Lag app-layout med sidebar-navigasjon (shadcn)
- [ ] Dashboard-side (/) med statistikk-kort og oversikt
- [ ] Implementer soek-komponent (global soek paa tvers av aksjonaerer og selskaper)

## Phase 6: UI - Selskaper

- [ ] Selskaps-listeside (/companies) med soek og sortering
- [ ] Selskaps-detaljside (/companies/[id]) med info-header
- [ ] Aksjonaertabell paa selskapsdetaljsiden med filtrering per aksjeklasse
- [ ] Aksjeklasse-oversikt med pie chart (eierandeler)

## Phase 7: UI - Aksjonaerer

- [ ] Aksjonaer-listeside (/shareholders) med soek, filter (selskap/person)
- [ ] Aksjonaer-detaljside (/shareholders/[id]) med profil-info
- [ ] Holdings-tabell: alle selskaper aksjonaeren eier i, med detaljer
- [ ] Mini-graf-visualisering av aksjonaerens eierskap

## Phase 8: UI - Konsernstruktur

- [ ] Trevisning: hierarkisk tre fra TopCo nedover (collapsible nodes)
- [ ] Grafvisning: interaktiv node-graf med React Flow, eierlinjer med prosent
- [ ] Tabellvisning: flat tabell med parent → child relasjoner
- [ ] View-switcher mellom de tre visningene
- [ ] Klikk-navigasjon fra node til selskapsdetaljside

## Phase 9: UI - Krysseierskap og Analyse

- [ ] Krysseierskap-side (/cross-ownership): aksjonaerer i flere selskaper
- [ ] Gruppert visning: ekspander aksjonaer → se alle eierskap
- [ ] Filter: minimum antall selskaper, aksjeklasse, land

## Phase 10: UI - Import og Datarensing

- [ ] Import-side (/import): fil-opplasting med drag-and-drop
- [ ] Import-status og fremdriftsvisning
- [ ] Konflikter-koe: liste over flaggede entity resolution-konflikter
- [ ] Datarensing-side (/data-cleanup): merge/split aksjonaerer
- [ ] Alias-editor: legg til/fjern navnevarianter og kontaktinfo

## Phase 11: Polering

- [ ] Responsivt design (fungerer paa tablet/desktop)
- [ ] Loading states og error handling paa alle sider
- [ ] Toasts/notifikasjoner for import og merge-operasjoner
- [ ] Verifiser at alle 12 selskaper vises korrekt med riktige aksjonaerer
- [ ] Verifiser krysseierskap: manuell sjekk av 5-10 kjente tilfeller
