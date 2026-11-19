CREATE TABLE "appointment_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'instalacion' NOT NULL,
	"who" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pass_hash" text NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "appointment_versions_record_idx" ON "appointment_versions" USING btree ("appointment_id","version");--> statement-breakpoint
CREATE INDEX "appointments_rev_idx" ON "appointments" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "appointments_date_idx" ON "appointments" USING btree ("date");