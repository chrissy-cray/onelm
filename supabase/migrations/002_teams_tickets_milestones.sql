-- ─────────────────────────────────────────────────────────────────────────────
-- OneLM Teams Migration (002)
-- Run AFTER 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── firms ─────────────────────────────────────────────────────────────────────
-- A firm is the top-level org. All teams and clients live under one firm.

CREATE TABLE IF NOT EXISTS firms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── teams ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                    -- e.g. "Case Managers", "Support"
  team_type   TEXT NOT NULL DEFAULT 'general'
                CHECK (team_type IN ('case_manager','support','admin','general')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_firm_id ON teams(firm_id);

-- ── team_members ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
  display_name TEXT,
  avatar_initials TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_firm_id ON team_members(firm_id);

-- ── client_assignments ────────────────────────────────────────────────────────
-- Links a client notebook to a specific case manager.

CREATE TABLE IF NOT EXISTS client_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, case_manager_id)
);

CREATE INDEX idx_client_assignments_client_id   ON client_assignments(client_id);
CREATE INDEX idx_client_assignments_manager_id  ON client_assignments(case_manager_id);

-- ── milestone_templates ───────────────────────────────────────────────────────
-- Reusable milestone definitions per firm (can customize per practice area).

CREATE TABLE IF NOT EXISTS milestone_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,          -- "PIP Ledger", "Declarations Page", etc.
  description     TEXT,
  default_order   INT NOT NULL DEFAULT 0,
  practice_area   TEXT,                   -- NULL = applies to all
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed standard PI milestones (inserted per firm on onboarding)
-- INSERT INTO milestone_templates (firm_id, name, default_order) VALUES ...

-- ── milestones ────────────────────────────────────────────────────────────────
-- One row per milestone per client. Linked to a ticket when one is created.

CREATE TABLE IF NOT EXISTS milestones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES milestone_templates(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','pending','in_progress','done')),
  completed_by    UUID REFERENCES auth.users(id),
  completed_at    TIMESTAMPTZ,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,  -- uploaded doc
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestones_client_id ON milestones(client_id);
CREATE INDEX idx_milestones_firm_id   ON milestones(firm_id);
CREATE INDEX idx_milestones_status    ON milestones(status);

CREATE TRIGGER milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── tickets ───────────────────────────────────────────────────────────────────
-- A task assigned from a case manager to a support team member.

CREATE TABLE IF NOT EXISTS tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  milestone_id    UUID REFERENCES milestones(id) ON DELETE SET NULL,

  -- who
  assigned_by     UUID NOT NULL REFERENCES auth.users(id),   -- case manager
  assigned_to     UUID NOT NULL REFERENCES auth.users(id),   -- support member

  -- what
  title           TEXT NOT NULL,           -- "Obtain PIP ledger"
  description     TEXT,                    -- optional note
  document_type   TEXT,                    -- "pip_ledger","bi_limits","declarations_page", etc.

  -- state
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','review','done','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','urgent')),
  due_date        DATE,

  -- completion
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES auth.users(id),
  completion_note TEXT,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,  -- uploaded result

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_client_id   ON tickets(client_id);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_assigned_by ON tickets(assigned_by);
CREATE INDEX idx_tickets_firm_id     ON tickets(firm_id);
CREATE INDEX idx_tickets_status      ON tickets(status);
CREATE INDEX idx_tickets_milestone   ON tickets(milestone_id);

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,    -- 'ticket_assigned','ticket_completed','milestone_done'
  title       TEXT NOT NULL,
  body        TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_id   UUID REFERENCES tickets(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read    ON notifications(user_id, read);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE firms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of a given firm?
CREATE OR REPLACE FUNCTION is_firm_member(fid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE firm_id = fid AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- firms — visible to members only
CREATE POLICY "firms: select members"   ON firms FOR SELECT USING (is_firm_member(id));

-- teams — all firm members can see all teams
CREATE POLICY "teams: select members"   ON teams FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "teams: insert admin"     ON teams FOR INSERT WITH CHECK (is_firm_member(firm_id));

-- team_members — see all members of your firm
CREATE POLICY "tm: select members"      ON team_members FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "tm: insert admin"        ON team_members FOR INSERT WITH CHECK (is_firm_member(firm_id));
CREATE POLICY "tm: delete self"         ON team_members FOR DELETE USING (user_id = auth.uid());

-- client_assignments
CREATE POLICY "ca: select firm"         ON client_assignments FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "ca: insert firm"         ON client_assignments FOR INSERT WITH CHECK (is_firm_member(firm_id));
CREATE POLICY "ca: delete firm"         ON client_assignments FOR DELETE USING (is_firm_member(firm_id));

-- milestone_templates
CREATE POLICY "mt: select firm"         ON milestone_templates FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "mt: insert firm"         ON milestone_templates FOR INSERT WITH CHECK (is_firm_member(firm_id));
CREATE POLICY "mt: update firm"         ON milestone_templates FOR UPDATE USING (is_firm_member(firm_id));

-- milestones
CREATE POLICY "ms: select firm"         ON milestones FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "ms: insert firm"         ON milestones FOR INSERT WITH CHECK (is_firm_member(firm_id));
CREATE POLICY "ms: update firm"         ON milestones FOR UPDATE USING (is_firm_member(firm_id));
CREATE POLICY "ms: delete firm"         ON milestones FOR DELETE USING (is_firm_member(firm_id));

-- tickets — assigned_by and assigned_to can see; all firm members can see
CREATE POLICY "tickets: select firm"    ON tickets FOR SELECT USING (is_firm_member(firm_id));
CREATE POLICY "tickets: insert firm"    ON tickets FOR INSERT WITH CHECK (is_firm_member(firm_id));
CREATE POLICY "tickets: update firm"    ON tickets FOR UPDATE USING (is_firm_member(firm_id));
CREATE POLICY "tickets: delete own"     ON tickets FOR DELETE USING (assigned_by = auth.uid());

-- notifications — own only
CREATE POLICY "notif: select own"       ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif: update own"       ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notif: insert firm"      ON notifications FOR INSERT WITH CHECK (is_firm_member(firm_id));

-- ── Seed standard PI milestone templates (run once per firm on signup) ─────────
-- Your onboarding flow should call something like:
/*
  INSERT INTO milestone_templates (firm_id, name, default_order, document_type) VALUES
    ($firm_id, 'Police report',          1),
    ($firm_id, 'ER records',             2),
    ($firm_id, 'Medical records',        3),
    ($firm_id, 'Medical bills',          4),
    ($firm_id, 'Declarations page',      5),
    ($firm_id, 'PIP ledger',             6),
    ($firm_id, 'BI limits letter',       7),
    ($firm_id, 'Property damage report', 8),
    ($firm_id, 'Expert report',          9),
    ($firm_id, 'Demand letter',          10);
*/
