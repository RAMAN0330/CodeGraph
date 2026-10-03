import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({ connectionString: env.databaseUrl });

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      github_login TEXT,
      github_avatar_url TEXT,
      github_token TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS repo_tree_cache (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      tree_json JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner, repo, branch)
    );
    ALTER TABLE repo_tree_cache ADD COLUMN IF NOT EXISTS etag TEXT;

    CREATE TABLE IF NOT EXISTS repo_file_cache (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner, repo, branch, path)
    );

    -- Content-addressed by git blob sha: valid forever once written, since a
    -- given sha's content can never change. This is what makes re-analyzing
    -- an unchanged repo free regardless of how much time has passed.
    CREATE TABLE IF NOT EXISTS repo_file_blob_cache (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      sha TEXT NOT NULL,
      content TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner, repo, sha)
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      repository_full_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'codebase';
    ALTER TABLE projects ALTER COLUMN repository_full_name DROP NOT NULL;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS db_connection_encrypted TEXT;

    CREATE TABLE IF NOT EXISTS project_members (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      invited_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per owner/repo/branch, keyed by the commit it was analyzed at.
    -- Reopening at the same commit sha means data_json can be served directly
    -- with zero GitHub fetches and zero re-parsing.
    CREATE TABLE IF NOT EXISTS analysis_results (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      data_json JSONB NOT NULL,
      analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner, repo, branch)
    );

    -- One compact row per analyzed commit (health + headline stats), so the
    -- Overview can diff against the previous commit on any device and
    -- regressions can be detected server-side. Trimmed per repo/branch.
    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      snapshot_json JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_key ON analysis_snapshots(owner, repo, branch, captured_at DESC);

    -- Regressions found between consecutive snapshots of the same branch.
    CREATE TABLE IF NOT EXISTS analysis_alerts (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      previous_value NUMERIC,
      current_value NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_alerts_repo ON analysis_alerts(owner, repo, created_at DESC);

    -- Slack/Discord incoming-webhook URL for a codebase project's regression
    -- alerts. Encrypted: the URL alone is enough to post into the channel.
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS alert_webhook_encrypted TEXT;

    -- Single-use links that let a new user register into an existing
    -- organization. Only a SHA-256 of the token is stored.
    CREATE TABLE IF NOT EXISTS organization_invites (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      used_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    -- Workspaces are shared across the organization. Existing ones join the
    -- organization of the user who created them.
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
    UPDATE workspaces w SET organization_id = u.organization_id FROM users u WHERE w.user_id = u.id AND w.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_workspaces_organization ON workspaces(organization_id);

    -- Project members are accounts in the organization (they gain edit rights).
    -- Older email-only entries link to an account whose username matches.
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE project_members ALTER COLUMN email DROP NOT NULL;
    UPDATE project_members m SET user_id = u.id
      FROM projects p JOIN workspaces w ON w.id = p.workspace_id JOIN users u ON u.organization_id = w.organization_id
      WHERE m.project_id = p.id AND m.user_id IS NULL AND m.email IS NOT NULL AND lower(u.username) = lower(m.email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_user ON project_members(project_id, user_id) WHERE user_id IS NOT NULL;

    -- Notes a team leaves on files/folders of a repository, shared within
    -- the organization.
    CREATE TABLE IF NOT EXISTS annotations (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      path TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_repo ON annotations(organization_id, owner, repo);

    -- Named workspace views (section + optional file + branch) shared within
    -- an organization.
    CREATE TABLE IF NOT EXISTS saved_views (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      name TEXT NOT NULL,
      section TEXT NOT NULL,
      file_path TEXT,
      branch TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_saved_views_repo ON saved_views(organization_id, owner, repo);

    -- Latest uploaded test coverage per organization/repository/branch, as
    -- per-file line counts already matched to repository paths.
    CREATE TABLE IF NOT EXISTS coverage_reports (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      format TEXT NOT NULL,
      files_json JSONB NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, owner, repo, branch)
    );

    -- Periodic point-in-time snapshots of a connected database project's size
    -- and connection counts, written (throttled) whenever the Overview or
    -- Performance telemetry endpoints are polled. This is what lets the
    -- Storage page show real growth over time instead of a single reading.
    CREATE TABLE IF NOT EXISTS db_metric_snapshots (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      database_size_bytes BIGINT,
      table_count INTEGER,
      connections_active INTEGER,
      connections_total INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_db_metric_snapshots_project ON db_metric_snapshots(project_id, captured_at);

    -- Threshold alert rules for a connected database project (Alerts page).
    -- Evaluated inline against live metrics on each Overview/Performance
    -- poll rather than via a background worker.
    CREATE TABLE IF NOT EXISTS db_alert_rules (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      condition TEXT NOT NULL,
      threshold NUMERIC NOT NULL,
      for_minutes INTEGER NOT NULL DEFAULT 5,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
