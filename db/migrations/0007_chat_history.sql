ALTER TABLE "chat_messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;