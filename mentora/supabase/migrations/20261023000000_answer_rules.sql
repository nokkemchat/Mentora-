-- Section-based answer rules for papers ("Answer all in Section A and any FOUR from Section B")
ALTER TABLE papers ADD COLUMN IF NOT EXISTS answer_rules jsonb;
ALTER TABLE past_paper_questions ADD COLUMN IF NOT EXISTS section text;
