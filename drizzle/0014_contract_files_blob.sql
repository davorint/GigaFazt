ALTER TABLE "contract_files" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_files" ADD COLUMN "blob_path" text DEFAULT '' NOT NULL;