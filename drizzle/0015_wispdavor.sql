CREATE TABLE "portal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"seen_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "portal_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"template" text NOT NULL,
	"phone" text NOT NULL,
	"status" text NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "portal_links_client_idx" ON "portal_links" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "whatsapp_sends_client_idx" ON "whatsapp_sends" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "whatsapp_sends_sent_idx" ON "whatsapp_sends" USING btree ("sent_at");