ALTER TABLE "chapter_versions" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chapter_versions_sync_idx" ON "chapter_versions" ("chapter_id", "synced_at");
--> statement-breakpoint
ALTER TABLE "story_snapshots" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_snapshots_sync_idx" ON "story_snapshots" ("story_id", "synced_at");
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_sync_idx" ON "sessions" ("story_id", "synced_at");
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_sync_idx" ON "chat_messages" ("story_id", "synced_at");
--> statement-breakpoint
ALTER TABLE "writer_insights" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "writer_insights_sync_idx" ON "writer_insights" ("story_id", "synced_at");
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_sync_idx" ON "comments" ("story_id", "synced_at");
