CREATE TABLE "outages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"router_id" text NOT NULL,
	"site_id" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"baseline" integer DEFAULT 0 NOT NULL,
	"low" integer DEFAULT 0 NOT NULL,
	"detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_metrics" (
	"router_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"online" integer,
	"gateways" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "router_users" ADD COLUMN "ont_rtt" double precision;--> statement-breakpoint
ALTER TABLE "router_users" ADD COLUMN "ont_loss" double precision;--> statement-breakpoint
ALTER TABLE "router_users" ADD COLUMN "ont_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outages_open_idx" ON "outages" USING btree ("site_id","ended_at");--> statement-breakpoint
CREATE INDEX "outages_router_idx" ON "outages" USING btree ("router_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "router_metrics_pk" ON "router_metrics" USING btree ("router_id","bucket");--> statement-breakpoint
CREATE INDEX "router_metrics_bucket_idx" ON "router_metrics" USING btree ("bucket");