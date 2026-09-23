-- ============================================================================
-- MVA Platform Migration: Phase 05.7D.3 — Roster Safety Foundation & FK Hardening
-- ============================================================================
-- Target Database: Supabase PostgreSQL (Production / Staging / Dev)
-- Author: MVA Engineering Team
-- Date: 2026-09-23
-- 
-- Summary of Changes:
-- 1. Create enum type: roster_status ('ACTIVE', 'REMOVED')
-- 2. Add columns to registration_players:
--      - status: roster_status NOT NULL DEFAULT 'ACTIVE'
--      - removed_at: TIMESTAMPTZ(6) NULL
--      - removed_by_profile_id: UUID NULL REFERENCES profiles(id)
-- 3. Add foreign key constraint: fk_registration_players_removed_by
-- 4. Add performance indexes:
--      - idx_registration_players_status on registration_players(status)
--      - idx_registration_players_removed_by on registration_players(removed_by_profile_id)
-- 5. Harden payments foreign key fk_payments_registration_player:
--      - Drop dangerous ON DELETE CASCADE
--      - Add ON DELETE RESTRICT ON UPDATE NO ACTION
--
-- Safety Guarantees:
-- - Non-destructive to existing data.
-- - Existing roster memberships become 'ACTIVE' automatically via default.
-- - Verified payment rows cannot be cascade-deleted by database operations.
--
-- PRODUCTION ROLLOUT ORDER:
-- 1. Create full production database backup in Supabase Dashboard.
-- 2. Confirm current schema & FK state:
--      SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'fk_payments_registration_player';
-- 3. Apply this reviewed migration script via Supabase SQL Editor.
-- 4. Verify ACTIVE backfill & defaults:
--      SELECT status, count(*) FROM registration_players GROUP BY status;
-- 5. Verify payment FK constraint is strictly RESTRICT ('r'):
--      SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'fk_payments_registration_player';
-- 6. Deploy application release build.
-- 7. Smoke-test public team directory & roster profiles (/teams and /teams/[slug]).
-- 8. Smoke-test admin registration list & accounting details (/admin/registrations and /admin/registrations/[id]).
-- 9. Verify payment completeness & tournament totals.
-- ============================================================================

BEGIN;

-- 1. Create enum type roster_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roster_status') THEN
    CREATE TYPE roster_status AS ENUM ('ACTIVE', 'REMOVED');
  END IF;
END $$;

-- 2. Add lifecycle columns to registration_players
ALTER TABLE registration_players
  ADD COLUMN IF NOT EXISTS status roster_status NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ(6) NULL,
  ADD COLUMN IF NOT EXISTS removed_by_profile_id UUID NULL;

-- 3. Add foreign key constraint for removed_by_profile_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_registration_players_removed_by'
  ) THEN
    ALTER TABLE registration_players
      ADD CONSTRAINT fk_registration_players_removed_by
      FOREIGN KEY (removed_by_profile_id)
      REFERENCES profiles(id)
      ON UPDATE NO ACTION;
  END IF;
END $$;

-- 4. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_registration_players_status
  ON registration_players (status);

CREATE INDEX IF NOT EXISTS idx_registration_players_removed_by
  ON registration_players (removed_by_profile_id);

-- 5. Harden payments.fk_payments_registration_player: Replace CASCADE with RESTRICT
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS fk_payments_registration_player;

ALTER TABLE payments
  ADD CONSTRAINT fk_payments_registration_player
  FOREIGN KEY (registration_player_id)
  REFERENCES registration_players(id)
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

-- Post-condition Verification
DO $$
DECLARE
  v_confdeltype "char";
BEGIN
  SELECT confdeltype INTO v_confdeltype
  FROM pg_constraint
  WHERE conname = 'fk_payments_registration_player';

  IF v_confdeltype IS NULL OR v_confdeltype <> 'r' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: fk_payments_registration_player confdeltype is %, expected r (RESTRICT)', v_confdeltype;
  END IF;
END $$;

COMMIT;
