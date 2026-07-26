CREATE TABLE spike_issue (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  done boolean NOT NULL DEFAULT false
);

CREATE INDEX spike_issue_owner_id_idx ON spike_issue (owner_id, id);

CREATE PUBLICATION pulsar_zero_data FOR TABLE spike_issue;
