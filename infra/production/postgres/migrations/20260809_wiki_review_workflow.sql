BEGIN;

ALTER TABLE wiki_pages
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS review_version integer,
  ADD COLUMN IF NOT EXISTS approved_version integer,
  ADD COLUMN IF NOT EXISTS review_requested_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wiki_pages_workflow_status'
  ) THEN
    ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_workflow_status
      CHECK (workflow_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wiki_pages_review_version'
  ) THEN
    ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_review_version
      CHECK (review_version IS NULL OR review_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wiki_pages_approved_version'
  ) THEN
    ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_approved_version
      CHECK (approved_version IS NULL OR approved_version > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wiki_review_decisions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  page_id uuid NOT NULL,
  revision_id uuid NOT NULL REFERENCES wiki_page_revisions (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decision text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wiki_review_decisions_page_fk
    FOREIGN KEY (workspace_id, project_id, page_id)
    REFERENCES wiki_pages (workspace_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT wiki_review_decisions_decision
    CHECK (decision IN ('APPROVED', 'CHANGES_REQUESTED')),
  CONSTRAINT wiki_review_decisions_comment_length
    CHECK (comment IS NULL OR char_length(comment) <= 20000)
);

CREATE INDEX IF NOT EXISTS wiki_review_decisions_page_created_idx
  ON wiki_review_decisions (page_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS wiki_comment_threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  page_id uuid NOT NULL,
  revision_id uuid NOT NULL REFERENCES wiki_page_revisions (id) ON DELETE CASCADE,
  anchor_quote text,
  status text NOT NULL DEFAULT 'OPEN',
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  resolved_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT wiki_comment_threads_page_fk
    FOREIGN KEY (workspace_id, project_id, page_id)
    REFERENCES wiki_pages (workspace_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT wiki_comment_threads_status
    CHECK (status IN ('OPEN', 'RESOLVED')),
  CONSTRAINT wiki_comment_threads_anchor_length
    CHECK (anchor_quote IS NULL OR char_length(anchor_quote) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS wiki_comment_threads_page_created_idx
  ON wiki_comment_threads (page_id, status, created_at, id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS wiki_comments (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES wiki_comment_threads (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT wiki_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 20000)
);

CREATE INDEX IF NOT EXISTS wiki_comments_thread_created_idx
  ON wiki_comments (thread_id, created_at, id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS wiki_attachments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  page_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT wiki_attachments_page_fk
    FOREIGN KEY (workspace_id, project_id, page_id)
    REFERENCES wiki_pages (workspace_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT wiki_attachments_object_key_length
    CHECK (char_length(object_key) BETWEEN 1 AND 1024),
  CONSTRAINT wiki_attachments_file_name_length
    CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT wiki_attachments_size CHECK (size_bytes BETWEEN 1 AND 2147483647)
);

CREATE INDEX IF NOT EXISTS wiki_attachments_page_created_idx
  ON wiki_attachments (page_id, created_at, id)
  WHERE archived_at IS NULL;

ALTER TABLE wiki_review_decisions OWNER TO pulsar_zero;
ALTER TABLE wiki_comment_threads OWNER TO pulsar_zero;
ALTER TABLE wiki_comments OWNER TO pulsar_zero;
ALTER TABLE wiki_attachments OWNER TO pulsar_zero;

GRANT SELECT, INSERT, UPDATE, DELETE ON wiki_review_decisions TO pulsar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wiki_comment_threads TO pulsar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wiki_comments TO pulsar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wiki_attachments TO pulsar_app;

COMMIT;
