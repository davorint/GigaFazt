CREATE SEQUENCE "public"."sync_rev" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "deployment_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"data" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"plan_id" text NOT NULL,
	"add_on_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_date" date,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"status" text DEFAULT 'nuevo' NOT NULL,
	"status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"price" numeric(12, 2),
	"role" text DEFAULT '' NOT NULL,
	"supplier_id" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"kinds" text DEFAULT '' NOT NULL,
	"rfc" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "survey_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"survey_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"municipality" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "deployment_versions_record_idx" ON "deployment_versions" USING btree ("deployment_id","version");--> statement-breakpoint
CREATE INDEX "deployments_rev_idx" ON "deployments" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "material_versions_record_idx" ON "material_versions" USING btree ("material_id","version");--> statement-breakpoint
CREATE INDEX "materials_rev_idx" ON "materials" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "materials_supplier_idx" ON "materials" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "provider_versions_record_idx" ON "provider_versions" USING btree ("provider_id","version");--> statement-breakpoint
CREATE INDEX "providers_rev_idx" ON "providers" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "survey_versions_record_idx" ON "survey_versions" USING btree ("survey_id","version");--> statement-breakpoint
CREATE INDEX "surveys_rev_idx" ON "surveys" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "surveys_updated_idx" ON "surveys" USING btree ("updated_at");