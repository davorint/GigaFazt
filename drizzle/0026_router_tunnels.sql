CREATE TABLE "router_tunnels" (
	"router_id" text PRIMARY KEY NOT NULL,
	"n" integer NOT NULL,
	"public_key" text DEFAULT '' NOT NULL,
	"rest_port" integer DEFAULT 443 NOT NULL,
	"api_port" integer DEFAULT 8729 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "router_tunnels_n_idx" ON "router_tunnels" USING btree ("n");