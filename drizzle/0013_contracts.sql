CREATE TABLE "contract_files" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'otro' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "contract_files_contract_idx" ON "contract_files" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_versions_record_idx" ON "contract_versions" USING btree ("contract_id","version");--> statement-breakpoint
CREATE INDEX "contracts_rev_idx" ON "contracts" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "contracts_end_idx" ON "contracts" USING btree ("end_date");