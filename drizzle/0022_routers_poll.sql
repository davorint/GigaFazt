ALTER TABLE "routers" ADD COLUMN "poll_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
-- Routers set up before this keep reporting every 2 minutes (their pasted scripts do); new ones default to 5.
UPDATE "routers" SET "poll_minutes" = 2;
