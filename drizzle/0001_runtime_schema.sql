-- Align the active LUMIÈRE application schema with src/db/schema.ts.
-- Preserve the first-generation project and asset records instead of dropping them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'logline'
  ) AND to_regclass('legacy_projects') IS NULL THEN
    ALTER TABLE projects RENAME TO legacy_projects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'assets' AND column_name = 'size_bytes'
  ) AND to_regclass('legacy_assets') IS NULL THEN
    ALTER TABLE assets RENAME TO legacy_assets;
  END IF;

  IF to_regclass('projects_updated_at_idx') IS NOT NULL AND to_regclass('legacy_projects_updated_at_idx') IS NULL THEN
    ALTER INDEX projects_updated_at_idx RENAME TO legacy_projects_updated_at_idx;
  END IF;
  IF to_regclass('assets_created_at_idx') IS NOT NULL AND to_regclass('legacy_assets_created_at_idx') IS NULL THEN
    ALTER INDEX assets_created_at_idx RENAME TO legacy_assets_created_at_idx;
  END IF;
  IF to_regclass('assets_project_id_idx') IS NOT NULL AND to_regclass('legacy_assets_project_id_idx') IS NULL THEN
    ALTER INDEX assets_project_id_idx RENAME TO legacy_assets_project_id_idx;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS projects (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '' NOT NULL,
  aspect text DEFAULT '16:9' NOT NULL,
  fps real DEFAULT 24 NOT NULL,
  width integer DEFAULT 1920 NOT NULL,
  height integer DEFAULT 1080 NOT NULL,
  look_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id serial PRIMARY KEY,
  project_id integer REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL,
  mime text NOT NULL,
  size bigint DEFAULT 0 NOT NULL,
  duration_ms integer DEFAULT 0 NOT NULL,
  width integer DEFAULT 0 NOT NULL,
  height integer DEFAULT 0 NOT NULL,
  fps real DEFAULT 0 NOT NULL,
  file_path text,
  thumb_path text,
  look_id text,
  tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  favorite boolean DEFAULT false NOT NULL,
  source text DEFAULT 'studio' NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS timelines (
  id serial PRIMARY KEY,
  project_id integer REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  duration_ms integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS looks (
  id serial PRIMARY KEY,
  name text NOT NULL,
  category text DEFAULT 'Custom' NOT NULL,
  description text DEFAULT '' NOT NULL,
  grade jsonb DEFAULT '{}'::jsonb NOT NULL,
  cube_text text,
  lut_size integer DEFAULT 0 NOT NULL,
  swatch jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id serial PRIMARY KEY,
  title text NOT NULL,
  protocol text DEFAULT 'whip' NOT NULL,
  endpoint text DEFAULT '' NOT NULL,
  status text DEFAULT 'live' NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id serial PRIMARY KEY,
  kind text NOT NULL,
  title text DEFAULT '' NOT NULL,
  input jsonb DEFAULT '{}'::jsonb NOT NULL,
  output jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id serial PRIMARY KEY,
  key text DEFAULT 'default' NOT NULL UNIQUE,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects(updated_at);
CREATE INDEX IF NOT EXISTS assets_created_at_idx ON assets(created_at);
CREATE INDEX IF NOT EXISTS assets_project_id_idx ON assets(project_id);
CREATE INDEX IF NOT EXISTS timelines_project_id_idx ON timelines(project_id);
CREATE INDEX IF NOT EXISTS looks_category_idx ON looks(category);
CREATE INDEX IF NOT EXISTS broadcasts_started_at_idx ON broadcasts(started_at);
CREATE INDEX IF NOT EXISTS ai_sessions_created_at_idx ON ai_sessions(created_at);
