import {
  pgTable,
  uuid,
  text,
  numeric,
  bigint,
  timestamp,
  pgEnum,
  boolean,
  date,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────

export const entityTypeEnum = pgEnum("entity_type", ["company", "person"]);

// ── Companies ──────────────────────────────────────────

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  orgNumber: text("org_number").unique().notNull(),
  shareCapital: numeric("share_capital", { precision: 20, scale: 2 }),
  totalShares: bigint("total_shares", { mode: "number" }),
  totalVotes: bigint("total_votes", { mode: "number" }),
  nominalValue: numeric("nominal_value", { precision: 20, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  shareClasses: many(shareClasses),
  holdings: many(holdings),
  importBatches: many(importBatches),
}));

// ── Share Classes ──────────────────────────────────────

export const shareClasses = pgTable("share_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  totalShares: bigint("total_shares", { mode: "number" }),
  nominalValue: numeric("nominal_value", { precision: 20, scale: 6 }),
  shareCapital: numeric("share_capital", { precision: 20, scale: 2 }),
  totalVotes: bigint("total_votes", { mode: "number" }),
  remarks: text("remarks"),
}, (table) => [
  index("share_classes_company_id_idx").on(table.companyId),
]);

export const shareClassesRelations = relations(
  shareClasses,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [shareClasses.companyId],
      references: [companies.id],
    }),
    holdings: many(holdings),
  })
);

// ── Shareholders ───────────────────────────────────────

export const shareholders = pgTable("shareholders", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalName: text("canonical_name").notNull(),
  orgNumber: text("org_number"),
  dateOfBirth: date("date_of_birth"),
  entityType: entityTypeEnum("entity_type").notNull(),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const shareholdersRelations = relations(shareholders, ({ many }) => ({
  aliases: many(shareholderAliases),
  contacts: many(shareholderContacts),
  holdings: many(holdings),
}));

// ── Shareholder Aliases ────────────────────────────────

export const shareholderAliases = pgTable("shareholder_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareholderId: uuid("shareholder_id")
    .notNull()
    .references(() => shareholders.id, { onDelete: "cascade" }),
  nameVariant: text("name_variant").notNull(),
  email: text("email"),
  sourceCompanyId: uuid("source_company_id").references(() => companies.id),
}, (table) => [
  index("shareholder_aliases_shareholder_id_idx").on(table.shareholderId),
]);

export const shareholderAliasesRelations = relations(
  shareholderAliases,
  ({ one }) => ({
    shareholder: one(shareholders, {
      fields: [shareholderAliases.shareholderId],
      references: [shareholders.id],
    }),
    sourceCompany: one(companies, {
      fields: [shareholderAliases.sourceCompanyId],
      references: [companies.id],
    }),
  })
);

// ── Shareholder Contacts ───────────────────────────────

export const shareholderContacts = pgTable("shareholder_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareholderId: uuid("shareholder_id")
    .notNull()
    .references(() => shareholders.id, { onDelete: "cascade" }),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  isPrimary: boolean("is_primary").default(false),
}, (table) => [
  index("shareholder_contacts_shareholder_id_idx").on(table.shareholderId),
]);

export const shareholderContactsRelations = relations(
  shareholderContacts,
  ({ one }) => ({
    shareholder: one(shareholders, {
      fields: [shareholderContacts.shareholderId],
      references: [shareholders.id],
    }),
  })
);

// ── Holdings ───────────────────────────────────────────

export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareholderId: uuid("shareholder_id")
    .notNull()
    .references(() => shareholders.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  shareClassId: uuid("share_class_id").references(() => shareClasses.id),
  numShares: bigint("num_shares", { mode: "number" }),
  ownershipPct: numeric("ownership_pct", { precision: 18, scale: 12 }),
  votingPowerPct: numeric("voting_power_pct", { precision: 18, scale: 12 }),
  totalCostPrice: numeric("total_cost_price", { precision: 20, scale: 4 }),
  entryDate: date("entry_date"),
  shareNumbers: text("share_numbers"),
  isPledged: boolean("is_pledged").default(false),
  pledgeDetails: text("pledge_details"),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("holdings_shareholder_id_idx").on(table.shareholderId),
  index("holdings_company_id_idx").on(table.companyId),
  index("holdings_share_class_id_idx").on(table.shareClassId),
  index("holdings_import_batch_id_idx").on(table.importBatchId),
]);

export const holdingsRelations = relations(holdings, ({ one }) => ({
  shareholder: one(shareholders, {
    fields: [holdings.shareholderId],
    references: [shareholders.id],
  }),
  company: one(companies, {
    fields: [holdings.companyId],
    references: [companies.id],
  }),
  shareClass: one(shareClasses, {
    fields: [holdings.shareClassId],
    references: [shareClasses.id],
  }),
  importBatch: one(importBatches, {
    fields: [holdings.importBatchId],
    references: [importBatches.id],
  }),
}));

// ── Import Batches ─────────────────────────────────────

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  sourceFile: text("source_file").notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  recordsImported: bigint("records_imported", { mode: "number" }),
  conflictsFound: bigint("conflicts_found", { mode: "number" }),
}, (table) => [
  index("import_batches_company_id_idx").on(table.companyId),
]);

export const importBatchesRelations = relations(
  importBatches,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [importBatches.companyId],
      references: [companies.id],
    }),
    holdings: many(holdings),
  })
);
