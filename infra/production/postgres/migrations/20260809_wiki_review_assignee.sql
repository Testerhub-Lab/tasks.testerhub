ALTER TABLE wiki_pages
ADD COLUMN IF NOT EXISTS review_assignee_id uuid REFERENCES users (id) ON DELETE SET NULL;
