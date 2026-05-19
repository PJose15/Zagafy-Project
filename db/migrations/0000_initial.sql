CREATE TABLE "chapter_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"summary" text,
	"canon_status" text DEFAULT 'flexible' NOT NULL,
	"source" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"chapter_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"words_added" integer DEFAULT 0 NOT NULL,
	"flow_score" integer,
	"heteronym_id" text,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"state" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_collaborators" (
	"story_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "story_collaborators_story_id_user_id_pk" PRIMARY KEY("story_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "story_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"chapter_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "writer_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"category" text NOT NULL,
	"observation" text NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"last_observed_at" timestamp NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"pinned" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_versions" ADD CONSTRAINT "chapter_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_collaborators" ADD CONSTRAINT "story_collaborators_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_collaborators" ADD CONSTRAINT "story_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_snapshots" ADD CONSTRAINT "story_snapshots_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writer_insights" ADD CONSTRAINT "writer_insights_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_versions_chapter_idx" ON "chapter_versions" USING btree ("chapter_id","created_at");--> statement-breakpoint
CREATE INDEX "chapters_story_order_idx" ON "chapters" USING btree ("story_id","order_index");--> statement-breakpoint
CREATE INDEX "chat_story_timestamp_idx" ON "chat_messages" USING btree ("story_id","timestamp");--> statement-breakpoint
CREATE INDEX "sessions_story_started_idx" ON "sessions" USING btree ("story_id","started_at");--> statement-breakpoint
CREATE INDEX "stories_owner_idx" ON "stories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "collaborators_user_idx" ON "story_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "snapshots_story_idx" ON "story_snapshots" USING btree ("story_id","created_at");--> statement-breakpoint
CREATE INDEX "insights_story_category_idx" ON "writer_insights" USING btree ("story_id","category");