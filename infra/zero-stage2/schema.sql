BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 120)
);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_length
    CHECK (char_length(provider) BETWEEN 1 AND 40),
  CONSTRAINT auth_identities_subject_length
    CHECK (char_length(provider_subject) BETWEEN 1 AND 320),
  CONSTRAINT auth_identities_password_hash
    CHECK (provider <> 'password' OR password_hash IS NOT NULL),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX auth_identities_user_id_idx ON auth_identities (user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address inet
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT workspaces_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT workspaces_slug_format
    CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX workspaces_slug_key ON workspaces (lower(slug));

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_members_role
    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))
);

CREATE INDEX workspace_members_user_id_idx
  ON workspace_members (user_id, workspace_id);

CREATE TABLE workflows (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT workflows_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX workflows_one_default_per_workspace
  ON workflows (workspace_id)
  WHERE is_default AND archived_at IS NULL;

CREATE TABLE workflow_states (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  color text,
  rank text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT workflow_states_workflow_fk
    FOREIGN KEY (workspace_id, workflow_id)
    REFERENCES workflows (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workflow_states_name_length
    CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT workflow_states_category
    CHECK (category IN ('BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED')),
  CONSTRAINT workflow_states_rank_length CHECK (char_length(rank) BETWEEN 1 AND 128),
  UNIQUE (workspace_id, id, workflow_id)
);

CREATE INDEX workflow_states_order_idx
  ON workflow_states (workflow_id, rank)
  WHERE archived_at IS NULL;

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  next_issue_number integer NOT NULL DEFAULT 1,
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT projects_workflow_fk
    FOREIGN KEY (workspace_id, workflow_id)
    REFERENCES workflows (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT projects_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  CONSTRAINT projects_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT projects_next_issue_number CHECK (next_issue_number > 0),
  UNIQUE (workspace_id, key),
  UNIQUE (workspace_id, id, workflow_id),
  UNIQUE (workspace_id, id)
);

CREATE INDEX projects_workspace_order_idx
  ON projects (workspace_id, name, id)
  WHERE archived_at IS NULL;

CREATE TABLE issues (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  state_id uuid NOT NULL,
  number integer NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM',
  rank text NOT NULL,
  creator_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT issues_project_fk
    FOREIGN KEY (workspace_id, project_id, workflow_id)
    REFERENCES projects (workspace_id, id, workflow_id) ON DELETE CASCADE,
  CONSTRAINT issues_state_fk
    FOREIGN KEY (workspace_id, state_id, workflow_id)
    REFERENCES workflow_states (workspace_id, id, workflow_id) ON DELETE RESTRICT,
  CONSTRAINT issues_number CHECK (number > 0),
  CONSTRAINT issues_title_length CHECK (char_length(title) BETWEEN 1 AND 240),
  CONSTRAINT issues_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT issues_rank_length CHECK (char_length(rank) BETWEEN 1 AND 128),
  UNIQUE (project_id, number),
  UNIQUE (workspace_id, id)
);

CREATE INDEX issues_project_rank_idx
  ON issues (project_id, state_id, rank)
  WHERE archived_at IS NULL;
CREATE INDEX issues_workspace_updated_idx ON issues (workspace_id, updated_at DESC);

CREATE TABLE comments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT comments_issue_fk
    FOREIGN KEY (workspace_id, issue_id)
    REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT comments_body_length CHECK (char_length(body) BETWEEN 1 AND 20000)
);

CREATE INDEX comments_issue_created_idx ON comments (issue_id, created_at, id);

CREATE TABLE tags (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT tags_name_length CHECK (char_length(name) BETWEEN 1 AND 60),
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX tags_workspace_name_key
  ON tags (workspace_id, lower(name))
  WHERE archived_at IS NULL;

CREATE TABLE issue_tags (
  workspace_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, tag_id),
  CONSTRAINT issue_tags_issue_fk
    FOREIGN KEY (workspace_id, issue_id)
    REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT issue_tags_tag_fk
    FOREIGN KEY (workspace_id, tag_id)
    REFERENCES tags (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX issue_tags_tag_id_idx ON issue_tags (tag_id, issue_id);

CREATE TABLE issue_participants (
  workspace_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, user_id, role),
  CONSTRAINT issue_participants_issue_fk
    FOREIGN KEY (workspace_id, issue_id)
    REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT issue_participants_role CHECK (role IN ('ASSIGNEE', 'WATCHER'))
);

CREATE INDEX issue_participants_user_id_idx
  ON issue_participants (user_id, issue_id);

CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT attachments_issue_fk
    FOREIGN KEY (workspace_id, issue_id)
    REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT attachments_object_key_length
    CHECK (char_length(object_key) BETWEEN 1 AND 1024),
  CONSTRAINT attachments_file_name_length
    CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT attachments_size CHECK (size_bytes BETWEEN 1 AND 2147483647)
);

CREATE INDEX attachments_issue_created_idx ON attachments (issue_id, created_at, id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_workspace_created_idx
  ON audit_events (workspace_id, created_at DESC);
CREATE INDEX audit_events_entity_idx
  ON audit_events (entity_type, entity_id, created_at DESC);

-- This is an allowlist. Auth identities, password hashes, session tokens and
-- audit payloads are deliberately absent from the Zero publication.
CREATE PUBLICATION pulsar_zero_data FOR TABLE
  users (id, display_name, avatar_url, created_at, updated_at),
  workspaces (
    id, name, slug, created_by_id, created_at, updated_at, archived_at
  ),
  workspace_members (
    workspace_id, user_id, role, created_at, updated_at
  ),
  workflows (
    id, workspace_id, name, is_default, created_at, updated_at, archived_at
  ),
  workflow_states (
    id, workspace_id, workflow_id, name, category, color, rank,
    created_at, updated_at, archived_at
  ),
  projects (
    id, workspace_id, workflow_id, key, name, description, next_issue_number,
    created_by_id, created_at, updated_at, archived_at
  ),
  issues (
    id, workspace_id, project_id, workflow_id, state_id, number, title,
    description, priority, rank, creator_id, reporter_id,
    created_at, updated_at, archived_at
  ),
  comments (
    id, workspace_id, issue_id, author_id, body,
    created_at, updated_at, archived_at
  ),
  tags (
    id, workspace_id, name, color, created_at, updated_at, archived_at
  ),
  issue_tags (workspace_id, issue_id, tag_id, created_by_id, created_at),
  issue_participants (
    workspace_id, issue_id, user_id, role, created_by_id, created_at
  ),
  attachments (
    id, workspace_id, issue_id, object_key, file_name, content_type,
    size_bytes, uploaded_by_id, created_at, archived_at
  );

COMMIT;
