ALTER TABLE "whatsapp_sends" ADD COLUMN "ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "whatsapp_sends_ref_idx" ON "whatsapp_sends" USING btree ("client_id","ref");