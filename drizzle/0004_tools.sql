CREATE TABLE "tool_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" text DEFAULT 'bien' NOT NULL,
	"holder_kind" text DEFAULT 'bodega' NOT NULL,
	"holder" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "tool_versions_record_idx" ON "tool_versions" USING btree ("tool_id","version");--> statement-breakpoint
CREATE INDEX "tools_rev_idx" ON "tools" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "tools_holder_idx" ON "tools" USING btree ("holder");