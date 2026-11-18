CREATE TABLE "site_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"municipality" text DEFAULT '' NOT NULL,
	"rooms" integer DEFAULT 0 NOT NULL,
	"towers" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "site_versions_record_idx" ON "site_versions" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "sites_rev_idx" ON "sites" USING btree ("rev");