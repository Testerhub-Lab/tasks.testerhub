BEGIN;

CREATE TABLE IF NOT EXISTS issue_view_preferences (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope text NOT NULL,
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  layout text NOT NULL DEFAULT 'board',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issue_view_preferences_scope
    CHECK (scope IN ('all', 'project', 'my')),
  CONSTRAINT issue_view_preferences_layout
    CHECK (layout IN ('board', 'list')),
  CONSTRAINT issue_view_preferences_project_scope
    CHECK (
      (scope = 'all' AND project_id IS NULL)
      OR (scope = 'project' AND project_id IS NOT NULL)
      OR scope = 'my'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS issue_view_preferences_global_key
  ON issue_view_preferences (workspace_id, user_id, scope)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS issue_view_preferences_project_key
  ON issue_view_preferences (workspace_id, user_id, scope, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS issue_view_preferences_project_id_idx
  ON issue_view_preferences (project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE issue_view_preferences OWNER TO pulsar_zero;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_view_preferences TO pulsar_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
      pubname = 'pulsar_zero_data'
      AND schemaname = 'public'
      AND tablename = 'issue_view_preferences'
  ) THEN
    EXECUTE 'ALTER PUBLICATION pulsar_zero_data ADD TABLE issue_view_preferences (
      id, workspace_id, user_id, scope, project_id, layout, created_at, updated_at
    )';
  END IF;
END $$;

COMMIT;
