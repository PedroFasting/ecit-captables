CREATE TYPE "public"."entity_type" AS ENUM('company', 'person');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"org_number" text NOT NULL,
	"share_capital" numeric(20, 2),
	"total_shares" bigint,
	"total_votes" bigint,
	"nominal_value" numeric(20, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_org_number_unique" UNIQUE("org_number")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shareholder_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"share_class_id" uuid,
	"num_shares" bigint,
	"ownership_pct" numeric(18, 12),
	"voting_power_pct" numeric(18, 12),
	"total_cost_price" numeric(20, 4),
	"entry_date" date,
	"share_numbers" text,
	"is_pledged" boolean DEFAULT false,
	"pledge_details" text,
	"import_batch_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"source_file" text NOT NULL,
	"company_id" uuid,
	"records_imported" bigint,
	"conflicts_found" bigint
);
--> statement-breakpoint
CREATE TABLE "share_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"total_shares" bigint,
	"nominal_value" numeric(20, 6),
	"share_capital" numeric(20, 2),
	"total_votes" bigint,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "shareholder_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shareholder_id" uuid NOT NULL,
	"name_variant" text NOT NULL,
	"email" text,
	"source_company_id" uuid
);
--> statement-breakpoint
CREATE TABLE "shareholder_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shareholder_id" uuid NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"is_primary" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "shareholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"org_number" text,
	"date_of_birth" date,
	"entity_type" "entity_type" NOT NULL,
	"country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_shareholder_id_shareholders_id_fk" FOREIGN KEY ("shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_share_class_id_share_classes_id_fk" FOREIGN KEY ("share_class_id") REFERENCES "public"."share_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_classes" ADD CONSTRAINT "share_classes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholder_aliases" ADD CONSTRAINT "shareholder_aliases_shareholder_id_shareholders_id_fk" FOREIGN KEY ("shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholder_aliases" ADD CONSTRAINT "shareholder_aliases_source_company_id_companies_id_fk" FOREIGN KEY ("source_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholder_contacts" ADD CONSTRAINT "shareholder_contacts_shareholder_id_shareholders_id_fk" FOREIGN KEY ("shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE cascade ON UPDATE no action;