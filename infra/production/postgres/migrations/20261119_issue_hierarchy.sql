BEGIN;
ALTER TABLE issues ADD COLUMN parent_id uuid,
  ADD CONSTRAINT issues_parent_fk FOREIGN KEY (workspace_id, project_id, parent_id)
    REFERENCES issues (workspace_id, project_id, id) ON DELETE SET NULL (parent_id),
  ADD CONSTRAINT issues_parent_check CHECK (parent_id IS NULL OR (id <> parent_id AND upper(type) <> 'EPIC'));
CREATE INDEX issues_parent_idx ON issues (parent_id) WHERE parent_id IS NOT NULL;
COMMIT;
