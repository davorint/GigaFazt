CREATE TABLE "field_files" (
	"id" text PRIMARY KEY NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"kind" text DEFAULT 'foto' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"bytes" "bytea",
	"blob_path" text DEFAULT '' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "field_files_ref_idx" ON "field_files" USING btree ("ref_kind","ref_id");