export const ARCHIVE_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS archive_objects (
  hash TEXT PRIMARY KEY,
  byte_size INTEGER NOT NULL,
  stored_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  source_agent TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  title TEXT,
  workspace TEXT,
  source_agent_version TEXT,
  parent_native_session_id TEXT,
  started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  latest_revision_id TEXT,
  UNIQUE(source_agent, native_session_id)
) STRICT;

CREATE TABLE IF NOT EXISTS journey_revisions (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  source_fingerprint TEXT NOT NULL,
  manifest_hash TEXT NOT NULL REFERENCES archive_objects(hash),
  captured_at TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  identity_conflict INTEGER NOT NULL DEFAULT 0 CHECK(identity_conflict IN (0, 1)),
  current_interpretation_id TEXT,
  UNIQUE(journey_id, source_fingerprint)
) STRICT;

CREATE TABLE IF NOT EXISTS revision_observations (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  manifest_hash TEXT REFERENCES archive_objects(hash)
) STRICT;

CREATE TABLE IF NOT EXISTS revision_files (
  revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  object_hash TEXT NOT NULL REFERENCES archive_objects(hash),
  byte_size INTEGER NOT NULL,
  PRIMARY KEY(revision_id, relative_path)
) STRICT;

CREATE TABLE IF NOT EXISTS interpretations (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK(provenance IN ('local', 'external')),
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(revision_id, id)
) STRICT;

CREATE TABLE IF NOT EXISTS interpretation_origins (
  interpretation_id TEXT NOT NULL REFERENCES interpretations(id) ON DELETE CASCADE,
  provenance TEXT NOT NULL CHECK(provenance IN ('local', 'external')),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(interpretation_id, provenance)
) STRICT;

CREATE TABLE IF NOT EXISTS activities (
  interpretation_id TEXT NOT NULL REFERENCES interpretations(id) ON DELETE CASCADE,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  evidence_anchor TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  source_order INTEGER NOT NULL,
  timestamp TEXT,
  text_content TEXT NOT NULL,
  document_json TEXT NOT NULL,
  PRIMARY KEY(interpretation_id, activity_id)
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS activity_fts USING fts5(
  text_content,
  native_name,
  capabilities,
  activity_id UNINDEXED,
  interpretation_id UNINDEXED,
  journey_id UNINDEXED,
  revision_id UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS review_overlays (
  journey_id TEXT PRIMARY KEY REFERENCES journeys(id) ON DELETE CASCADE,
  display_title TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  renderer_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS review_annotations (
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  evidence_anchor TEXT NOT NULL,
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0, 1)),
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(journey_id, evidence_anchor)
) STRICT;

CREATE TABLE IF NOT EXISTS sensitive_findings (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
  interpretation_id TEXT REFERENCES interpretations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('activity-text', 'activity-payload', 'source-file')),
  kind TEXT NOT NULL,
  activity_id TEXT,
  relative_path TEXT,
  start_offset INTEGER NOT NULL,
  match_length INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS pending_evidence (
  id TEXT PRIMARY KEY,
  source_agent TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS pending_evidence_files (
  pending_id TEXT NOT NULL REFERENCES pending_evidence(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  object_hash TEXT NOT NULL REFERENCES archive_objects(hash),
  byte_size INTEGER NOT NULL,
  PRIMARY KEY(pending_id, relative_path)
) STRICT;

CREATE TABLE IF NOT EXISTS capture_exclusions (
  source_agent TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(source_agent, native_session_id)
) STRICT;

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  keep_last_revisions INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_journeys_updated ON journeys(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_journey ON journey_revisions(journey_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_journey ON activities(journey_id, interpretation_id, source_order);
CREATE INDEX IF NOT EXISTS idx_sensitive_revision ON sensitive_findings(revision_id, interpretation_id);
CREATE INDEX IF NOT EXISTS idx_pending_source ON pending_evidence(source_agent, created_at DESC);
`;
