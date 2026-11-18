CREATE TABLE "report_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'nuevo' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'interno' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_move_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"move_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"qty" double precision DEFAULT 0 NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text DEFAULT '' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'almacen' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "report_versions_record_idx" ON "report_versions" USING btree ("report_id","version");--> statement-breakpoint
CREATE INDEX "reports_rev_idx" ON "reports" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_move_versions_record_idx" ON "stock_move_versions" USING btree ("move_id","version");--> statement-breakpoint
CREATE INDEX "stock_moves_rev_idx" ON "stock_moves" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "stock_moves_item_idx" ON "stock_moves" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "unit_versions_record_idx" ON "unit_versions" USING btree ("unit_id","version");--> statement-breakpoint
CREATE INDEX "units_rev_idx" ON "units" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "units_serial_idx" ON "units" USING btree ("serial");--> statement-breakpoint
CREATE INDEX "units_client_idx" ON "units" USING btree ("client_id");