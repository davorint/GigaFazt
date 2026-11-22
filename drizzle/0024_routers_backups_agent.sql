CREATE TABLE "router_backup_parts" (
	"router_id" text NOT NULL,
	"upload" text NOT NULL,
	"idx" integer NOT NULL,
	"total" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "router_backups" ADD COLUMN "source" text DEFAULT 'rest' NOT NULL;--> statement-breakpoint
ALTER TABLE "router_backups" ADD COLUMN "hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "router_backups" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "router_backup_parts_pk" ON "router_backup_parts" USING btree ("router_id","upload","idx");