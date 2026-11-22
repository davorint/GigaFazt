ALTER TABLE "routers" ADD COLUMN "poll_script" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
-- Until a new script is pasted, a router runs at the rate it was set up with.
UPDATE "routers" SET "poll_script" = "poll_minutes";
