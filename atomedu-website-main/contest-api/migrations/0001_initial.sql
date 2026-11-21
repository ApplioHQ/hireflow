CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  contest_date TEXT NOT NULL,
  name TEXT NOT NULL,
  image_key TEXT NOT NULL UNIQUE,
  image_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  display_consent INTEGER NOT NULL CHECK (display_consent IN (0, 1))
);
CREATE INDEX submissions_by_date ON submissions (contest_date, created_at);

CREATE TABLE winners (
  contest_date TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image_key TEXT NOT NULL UNIQUE,
  image_type TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  display_consent INTEGER NOT NULL CHECK (display_consent IN (0, 1))
);

CREATE TABLE image_cleanup (
  image_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
