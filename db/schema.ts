import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Phase 5.3 cloud schema. Two design notes:
 *
 * 1. IDs are `text` not `uuid`: clients (Dexie) generate IDs offline-first
 *    and we want to round-trip them unchanged when the sync engine (Phase
 *    5.4) pushes to Postgres.
 *
 * 2. Entities still stored in `stories.state` JSON for v1: characters,
 *    conflicts, timeline events, world bible sections. These have rich
 *    nested structure already serialized in the Dexie `stories.data` blob
 *    — promoting them to their own tables is a future migration once we
 *    have a query pattern that justifies normalization.
 */

// users — synced from Clerk via webhook
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  plan: text('plan').notNull().default('free'), // free | writer | author | studio
  stripeCustomerId: text('stripe_customer_id').unique(),
});

// stories — owned by users
export const stories = pgTable(
  'stories',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    // state: the existing Dexie `stories.data` blob (story state minus
    // chapter contents). Holds characters / conflicts / timeline / world
    // bible / genesis data until we normalize them.
    state: jsonb('state'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('stories_owner_idx').on(t.ownerId),
  }),
);

// story_collaborators — populated in Phase 5.6
export const storyCollaborators = pgTable(
  'story_collaborators',
  {
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // owner | editor | reader
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storyId, t.userId] }),
    userIdx: index('collaborators_user_idx').on(t.userId),
  }),
);

// chapters — full content stored
export const chapters = pgTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    summary: text('summary'),
    canonStatus: text('canon_status').notNull().default('flexible'),
    source: text('source'),
    orderIndex: integer('order_index').notNull().default(0),
    wordCount: integer('word_count').notNull().default(0),
    version: integer('version').notNull().default(1), // optimistic concurrency
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    storyOrderIdx: index('chapters_story_order_idx').on(t.storyId, t.orderIndex),
  }),
);

// chapter_versions — Phase 4.7 / MP-03 manuscript-wide version history
export const chapterVersions = pgTable(
  'chapter_versions',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .references(() => chapters.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    data: jsonb('data').notNull(), // full ChapterVersion blob
  },
  (t) => ({
    chapterIdx: index('chapter_versions_chapter_idx').on(t.chapterId, t.createdAt),
  }),
);

// story_snapshots — Phase 4.7 / MP-03
export const storySnapshots = pgTable(
  'story_snapshots',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    chapterCount: integer('chapter_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    data: jsonb('data').notNull(), // serialized StoryState payload at snapshot time
  },
  (t) => ({
    storyIdx: index('snapshots_story_idx').on(t.storyId, t.createdAt),
  }),
);

// sessions — writing sessions (gamification + flow metrics)
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    wordsAdded: integer('words_added').notNull().default(0),
    flowScore: integer('flow_score'),
    heteronymId: text('heteronym_id'),
    data: jsonb('data').notNull(), // full WritingSession blob
  },
  (t) => ({
    storyStartedIdx: index('sessions_story_started_idx').on(t.storyId, t.startedAt),
  }),
);

// chat_messages — AI copilot history
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    chapterId: text('chapter_id'), // nullable — global vs per-chapter
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    timestamp: timestamp('timestamp').notNull(),
  },
  (t) => ({
    storyTimestampIdx: index('chat_story_timestamp_idx').on(t.storyId, t.timestamp),
  }),
);

// writer_insights — Phase 4.12 / MP-11 long-term writer memory
export const writerInsights = pgTable(
  'writer_insights',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    category: text('category').notNull(),
    observation: text('observation').notNull(),
    evidenceCount: integer('evidence_count').notNull().default(1),
    lastObservedAt: timestamp('last_observed_at').notNull(),
    confidence: integer('confidence').notNull().default(50), // 0–100
    pinned: integer('pinned').notNull().default(0), // 0/1
  },
  (t) => ({
    storyCategoryIdx: index('insights_story_category_idx').on(t.storyId, t.category),
  }),
);

// Type inference exports — consumers `import type { User } from '@/db/schema'`
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type StoryCollaborator = typeof storyCollaborators.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;