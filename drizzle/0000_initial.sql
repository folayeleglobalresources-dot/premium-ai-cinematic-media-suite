CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "logline" text DEFAULT '' NOT NULL,
  "width" integer DEFAULT 1920 NOT NULL,
  "height" integer DEFAULT 1080 NOT NULL,
  "fps" double precision DEFAULT 24 NOT NULL,
  "aspect" text DEFAULT '16:9' NOT NULL,
  "timeline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "poster" text,
  "status" text DEFAULT 'development' NOT NULL,
  "duration_sec" double precision DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "assets" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "mime" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'import' NOT NULL,
  "duration_sec" double precision DEFAULT 0 NOT NULL,
  "width" integer DEFAULT 0 NOT NULL,
  "height" integer DEFAULT 0 NOT NULL,
  "size_bytes" double precision DEFAULT 0 NOT NULL,
  "thumbnail" text,
  "filmstrip" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "peaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "slate" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "captions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rating" integer DEFAULT 0 NOT NULL,
  "favorite" boolean DEFAULT false NOT NULL,
  "project_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stream_destinations" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "platform" text DEFAULT 'custom' NOT NULL,
  "whip_url" text NOT NULL,
  "stream_key" text DEFAULT '' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stream_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text DEFAULT 'Untitled broadcast' NOT NULL,
  "destination_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'live' NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz,
  "duration_sec" double precision DEFAULT 0 NOT NULL,
  "peak_kbps" double precision DEFAULT 0 NOT NULL,
  "avg_fps" double precision DEFAULT 0 NOT NULL,
  "resolution" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "shotlists" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "logline" text NOT NULL,
  "genre" text DEFAULT 'drama' NOT NULL,
  "tone" text DEFAULT '' NOT NULL,
  "engine" text DEFAULT 'lumiere-local' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "projects_updated_at_idx" ON "projects" ("updated_at");
CREATE INDEX IF NOT EXISTS "assets_created_at_idx" ON "assets" ("created_at");
CREATE INDEX IF NOT EXISTS "assets_project_id_idx" ON "assets" ("project_id");
CREATE INDEX IF NOT EXISTS "stream_sessions_started_at_idx" ON "stream_sessions" ("started_at");
CREATE INDEX IF NOT EXISTS "shotlists_created_at_idx" ON "shotlists" ("created_at");
