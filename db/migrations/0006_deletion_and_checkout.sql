CREATE TABLE "checkout_attempts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"customer_id" text,
	"email" text NOT NULL,
	"price_id" text NOT NULL,
	"plan" text NOT NULL,
	"interval" text NOT NULL,
	"app_url" text NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "checkout_attempts_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "deleted_stories" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_tombstones" (
	"story_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "sync_tombstones_story_id_entity_type_entity_id_pk" PRIMARY KEY("story_id","entity_type","entity_id")
);
--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_stories" ADD CONSTRAINT "deleted_stories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_tombstones" ADD CONSTRAINT "sync_tombstones_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_tombstones_sync_idx" ON "sync_tombstones" USING btree ("story_id","deleted_at");