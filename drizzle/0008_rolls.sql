CREATE TABLE "roll_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"roll_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rolls" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"cable" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"left_m" double precision DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "roll_versions_record_idx" ON "roll_versions" USING btree ("roll_id","version");--> statement-breakpoint
CREATE INDEX "rolls_rev_idx" ON "rolls" USING btree ("rev");