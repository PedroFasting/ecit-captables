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
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────

export const entityTypeEnum = pgEnum("entity_type", ["company", "person"]);

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
  snapshots: many(snapshots),
  transactions: many(transactions),
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
  fromTransactions: many(transactions, { relationName: "fromTransactions" }),
  toTransactions: many(transactions, { relationName: "toTransactions" }),
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
  effectiveDate: date("effective_date"),
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
    snapshots: many(snapshots),
    transactions: many(transactions),
  })
);

// ── Snapshots ──────────────────────────────────────────

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  snapshotData: jsonb("snapshot_data").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("snapshots_company_id_idx").on(table.companyId),
  index("snapshots_effective_date_idx").on(table.effectiveDate),
]);

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  company: one(companies, {
    fields: [snapshots.companyId],
    references: [companies.id],
  }),
  importBatch: one(importBatches, {
    fields: [snapshots.importBatchId],
    references: [importBatches.id],
  }),
}));

// ── Transactions ───────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  effectiveDate: date("effective_date").notNull(),
  description: text("description"),

  // Parties
  fromShareholderId: uuid("from_shareholder_id").references(() => shareholders.id),
  toShareholderId: uuid("to_shareholder_id").references(() => shareholders.id),

  // Share data
  shareClassId: uuid("share_class_id").references(() => shareClasses.id),
  numShares: bigint("num_shares", { mode: "number" }).notNull().default(0),
  pricePerShare: numeric("price_per_share", { precision: 20, scale: 4 }),
  totalAmount: numeric("total_amount", { precision: 20, scale: 4 }),
  shareNumbersFrom: bigint("share_numbers_from", { mode: "number" }),
  shareNumbersTo: bigint("share_numbers_to", { mode: "number" }),

  // Before/after state
  sharesBefore: bigint("shares_before", { mode: "number" }),
  sharesAfter: bigint("shares_after", { mode: "number" }),

  // Source tracking
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

export const transactionsRelations = relations(transactions, ({ one }) => ({
  company: one(companies, {
    fields: [transactions.companyId],
    references: [companies.id],
  }),
  fromShareholder: one(shareholders, {
    fields: [transactions.fromShareholderId],
    references: [shareholders.id],
    relationName: "fromTransactions",
  }),
  toShareholder: one(shareholders, {
    fields: [transactions.toShareholderId],
    references: [shareholders.id],
    relationName: "toTransactions",
  }),
  shareClass: one(shareClasses, {
    fields: [transactions.shareClassId],
    references: [shareClasses.id],
  }),
  importBatch: one(importBatches, {
    fields: [transactions.importBatchId],
    references: [importBatches.id],
  }),
}));
