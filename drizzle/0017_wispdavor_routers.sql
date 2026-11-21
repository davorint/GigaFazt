CREATE TABLE "router_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"router_id" text NOT NULL,
	"kind" text NOT NULL,
	"user" text DEFAULT '' NOT NULL,
	"arg1" text DEFAULT '' NOT NULL,
	"arg2" text DEFAULT '' NOT NULL,
	"arg3" text DEFAULT '' NOT NULL,
	"arg4" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"service_id" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "router_users" (
	"router_id" text NOT NULL,
	"user" text NOT NULL,
	"profile" text DEFAULT '' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"rx_last" bigint DEFAULT 0 NOT NULL,
	"tx_last" bigint DEFAULT 0 NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routers" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"pppoe" boolean DEFAULT true NOT NULL,
	"hotspot" boolean DEFAULT false NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"key_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_5m" (
	"router_id" text NOT NULL,
	"user" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"down" bigint DEFAULT 0 NOT NULL,
	"up" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_hourly" (
	"router_id" text NOT NULL,
	"user" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"down" bigint DEFAULT 0 NOT NULL,
	"up" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"code" text PRIMARY KEY NOT NULL,
	"password" text NOT NULL,
	"router_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"price" double precision,
	"status" text DEFAULT 'pending' NOT NULL,
	"uptime" text DEFAULT '' NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"sold_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "router_actions_router_idx" ON "router_actions" USING btree ("router_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "router_users_pk" ON "router_users" USING btree ("router_id","user");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_5m_pk" ON "traffic_5m" USING btree ("router_id","user","bucket");--> statement-breakpoint
CREATE INDEX "traffic_5m_bucket_idx" ON "traffic_5m" USING btree ("bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_hourly_pk" ON "traffic_hourly" USING btree ("router_id","user","hour");--> statement-breakpoint
CREATE INDEX "traffic_hourly_hour_idx" ON "traffic_hourly" USING btree ("hour");--> statement-breakpoint
CREATE INDEX "vouchers_router_idx" ON "vouchers" USING btree ("router_id","status");