CREATE TABLE "payable_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"payable_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" text PRIMARY KEY NOT NULL,
	"payee" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'otro' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receivable_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"receivable_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" text PRIMARY KEY NOT NULL,
	"payer" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "payable_versions_record_idx" ON "payable_versions" USING btree ("payable_id","version");--> statement-breakpoint
CREATE INDEX "payables_rev_idx" ON "payables" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "payables_due_idx" ON "payables" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "receivable_versions_record_idx" ON "receivable_versions" USING btree ("receivable_id","version");--> statement-breakpoint
CREATE INDEX "receivables_rev_idx" ON "receivables" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "receivables_due_idx" ON "receivables" USING btree ("due_date");