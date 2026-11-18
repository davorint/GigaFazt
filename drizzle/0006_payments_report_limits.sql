CREATE TABLE "payment_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" text DEFAULT '' NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"date" date,
	"amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "report_hits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip_hash" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_versions_record_idx" ON "payment_versions" USING btree ("payment_id","version");--> statement-breakpoint
CREATE INDEX "payments_rev_idx" ON "payments" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("date");--> statement-breakpoint
CREATE INDEX "report_hits_at_idx" ON "report_hits" USING btree ("at");--> statement-breakpoint
CREATE INDEX "report_hits_ip_idx" ON "report_hits" USING btree ("ip_hash","at");