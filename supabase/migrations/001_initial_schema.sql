-- ─────────────────────────────────────────────────────────────────────────────
-- OneLM Database Schema
-- Run via: supabase db push  OR  paste into Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── clients ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  doa           DATE,                    -- date of accident
  injury_type   TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'review', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_user_id ON clients(user_id);

-- ── documents ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  storage_path    TEXT NOT NULL UNIQUE,  -- path in Supabase Storage bucket
  extracted_text  TEXT NOT NULL DEFAULT '',
  mime_type       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_client_id ON documents(client_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);

-- ── messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  citation    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_client_id ON messages(client_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Each user can only see/modify their own data.

ALTER TABLE clients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;

-- clients policies
CREATE POLICY "clients: select own"  ON clients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "clients: insert own"  ON clients FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "clients: update own"  ON clients FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "clients: delete own"  ON clients FOR DELETE USING (user_id = auth.uid());

-- documents policies
CREATE POLICY "docs: select own"  ON documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "docs: insert own"  ON documents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "docs: delete own"  ON documents FOR DELETE USING (user_id = auth.uid());

-- messages policies
CREATE POLICY "msgs: select own"  ON messages FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "msgs: insert own"  ON messages FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Create this in Supabase Dashboard → Storage, or via CLI:
-- supabase storage create case-documents --public false

-- Storage RLS (paste in Supabase Dashboard → Storage → Policies)
/*
  Bucket: case-documents

  SELECT policy:
    ((storage.foldername(name))[1] = auth.uid()::text)

  INSERT policy:
    ((storage.foldername(name))[1] = auth.uid()::text)

  DELETE policy:
    ((storage.foldername(name))[1] = auth.uid()::text)
*/
