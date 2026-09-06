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
