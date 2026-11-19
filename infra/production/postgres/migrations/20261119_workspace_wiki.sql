BEGIN;
CREATE TABLE IF NOT EXISTS workspace_wiki_pages (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  content_markdown text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS workspace_wiki_pages_workspace_id_idx ON workspace_wiki_pages (workspace_id);
GRANT SELECT, INSERT, UPDATE ON workspace_wiki_pages TO pulsar_app;
COMMIT;
