CREATE TABLE workspace_wiki_pages (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES "Workspace" (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  content_markdown text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX workspace_wiki_pages_workspace_id_idx ON workspace_wiki_pages (workspace_id);
