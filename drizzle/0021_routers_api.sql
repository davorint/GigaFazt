ALTER TABLE "router_rest" ADD COLUMN "protocol" text DEFAULT 'rest' NOT NULL;--> statement-breakpoint
ALTER TABLE "router_rest" ADD COLUMN "api_port" integer DEFAULT 8729 NOT NULL;