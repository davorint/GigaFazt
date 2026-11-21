CREATE TABLE "router_backups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"router_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_rest" (
	"router_id" text PRIMARY KEY NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"port" integer DEFAULT 443 NOT NULL,
	"read_user" text DEFAULT '' NOT NULL,
	"read_pass" text DEFAULT '' NOT NULL,
	"write_user" text DEFAULT '' NOT NULL,
	"write_pass" text DEFAULT '' NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "router_backups_router_idx" ON "router_backups" USING btree ("router_id","created_at");