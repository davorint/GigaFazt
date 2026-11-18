CREATE TABLE "client_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"building" text DEFAULT '' NOT NULL,
	"apartment" text DEFAULT '' NOT NULL,
	"pppoe_user" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "client_versions_record_idx" ON "client_versions" USING btree ("client_id","version");--> statement-breakpoint
CREATE INDEX "clients_rev_idx" ON "clients" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "clients_pppoe_idx" ON "clients" USING btree ("pppoe_user");--> statement-breakpoint
CREATE INDEX "clients_building_idx" ON "clients" USING btree ("building");