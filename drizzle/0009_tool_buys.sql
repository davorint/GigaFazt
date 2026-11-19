CREATE TABLE "tool_buy_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tool_buy_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_buys" (
	"id" text PRIMARY KEY NOT NULL,
	"need" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "tool_buy_versions_record_idx" ON "tool_buy_versions" USING btree ("tool_buy_id","version");--> statement-breakpoint
CREATE INDEX "tool_buys_rev_idx" ON "tool_buys" USING btree ("rev");