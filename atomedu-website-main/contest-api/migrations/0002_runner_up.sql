ALTER TABLE submissions ADD COLUMN beauty_score INTEGER CHECK (beauty_score BETWEEN 0 AND 10);
ALTER TABLE submissions ADD COLUMN creativity_score INTEGER CHECK (creativity_score BETWEEN 0 AND 10);
ALTER TABLE submissions ADD COLUMN complexity_score INTEGER CHECK (complexity_score BETWEEN 0 AND 10);

-- Nullable columns keep winners selected before this migration readable.
ALTER TABLE winners ADD COLUMN runner_up_submission_id TEXT;
ALTER TABLE winners ADD COLUMN runner_up_name TEXT;
ALTER TABLE winners ADD COLUMN runner_up_image_key TEXT;
ALTER TABLE winners ADD COLUMN runner_up_image_type TEXT;
ALTER TABLE winners ADD COLUMN runner_up_terms_version TEXT;
ALTER TABLE winners ADD COLUMN runner_up_terms_accepted_at TEXT;
ALTER TABLE winners ADD COLUMN runner_up_display_consent INTEGER CHECK (runner_up_display_consent IN (0, 1));

CREATE UNIQUE INDEX winners_runner_up_id ON winners (runner_up_submission_id);
CREATE UNIQUE INDEX winners_runner_up_image_key ON winners (runner_up_image_key);
