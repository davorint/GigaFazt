CREATE TABLE "cfdis" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"payment_id" text DEFAULT '' NOT NULL,
	"uuid" text DEFAULT '' NOT NULL,
	"serie" text DEFAULT '' NOT NULL,
	"folio" text DEFAULT '' NOT NULL,
	"total" double precision NOT NULL,
	"receiver_rfc" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "online_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"status" text NOT NULL,
	"payment_intent_id" text DEFAULT '' NOT NULL,
	"payment_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"client_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"autopay" boolean DEFAULT false NOT NULL,
	"payment_method_id" text DEFAULT '' NOT NULL,
	"card_brand" text DEFAULT '' NOT NULL,
	"card_last4" text DEFAULT '' NOT NULL,
	"card_funding" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_customers_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "wisp_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cfdis_client_idx" ON "cfdis" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "cfdis_payment_idx" ON "cfdis" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "online_payments_client_idx" ON "online_payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "online_payments_pi_idx" ON "online_payments" USING btree ("payment_intent_id");