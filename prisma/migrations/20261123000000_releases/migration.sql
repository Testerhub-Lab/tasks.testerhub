BEGIN;

CREATE UNIQUE INDEX "Task_projectId_id_key" ON "Task" ("projectId", id);

CREATE TABLE releases (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES "Project" (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  goal text NOT NULL DEFAULT '' CHECK (char_length(goal) <= 400),
  planned_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE TABLE release_issues (
  issue_id text NOT NULL,
  project_id text NOT NULL,
  release_id uuid NOT NULL,
  PRIMARY KEY (project_id, issue_id),
  FOREIGN KEY (project_id, issue_id) REFERENCES "Task" ("projectId", id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, release_id) REFERENCES releases (project_id, id) ON DELETE CASCADE
);
CREATE INDEX release_issues_release_id_idx ON release_issues (release_id);

COMMIT;
