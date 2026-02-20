CREATE TYPE "public"."transaction_type" AS ENUM('import_diff', 'founding', 'emission', 'write_down', 'sale_transfer', 'inheritance', 'gift', 'split', 'reverse_split', 'conversion', 'redemption', 'merger', 'demerger', 'manual_adjustment');--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"import_batch_id" uuid,
	"snapshot_data" jsonb NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"effective_date" date NOT NULL,
	"description" text,
	"from_shareholder_id" uuid,
	"to_shareholder_id" uuid,
	"share_class_id" uuid,
	"num_shares" bigint DEFAULT 0 NOT NULL,
	"price_per_share" numeric(20, 4),
	"total_amount" numeric(20, 4),
	"share_numbers_from" bigint,
	"share_numbers_to" bigint,
	"shares_before" bigint,
	"shares_after" bigint,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_batch_id" uuid,
	"document_reference" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "effective_date" date;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_shareholder_id_shareholders_id_fk" FOREIGN KEY ("from_shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_shareholder_id_shareholders_id_fk" FOREIGN KEY ("to_shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_share_class_id_share_classes_id_fk" FOREIGN KEY ("share_class_id") REFERENCES "public"."share_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snapshots_company_id_idx" ON "snapshots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "snapshots_effective_date_idx" ON "snapshots" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "transactions_company_id_idx" ON "transactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "transactions_effective_date_idx" ON "transactions" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "transactions_from_shareholder_idx" ON "transactions" USING btree ("from_shareholder_id");--> statement-breakpoint
CREATE INDEX "transactions_to_shareholder_idx" ON "transactions" USING btree ("to_shareholder_id");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_import_batch_idx" ON "transactions" USING btree ("import_batch_id");