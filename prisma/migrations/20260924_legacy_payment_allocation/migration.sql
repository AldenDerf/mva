-- ============================================================================
-- MVA Platform Migration: Phase 05.7D.5 — Legacy Verified Payment Allocation
-- ============================================================================
-- Target Database: PostgreSQL (Local mva_dev / Supabase)
-- Author: MVA Engineering Team
-- Date: 2026-09-24
--
-- Summary of Changes:
-- 1. Create table payment_allocations:
--      - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--      - payment_id UUID NOT NULL
--      - registration_player_id UUID NOT NULL
--      - amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0)
--      - allocated_by_profile_id UUID NOT NULL
--      - reconciliation_note TEXT NOT NULL
--      - created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
--      - reversed_at TIMESTAMPTZ(6) NULL
--      - reversed_by_profile_id UUID NULL
--      - reversal_reason TEXT NULL
-- 2. Foreign Keys:
--      - fk_payment_allocations_payment -> payments(id) ON DELETE RESTRICT
--      - fk_payment_allocations_registration_player -> registration_players(id) ON DELETE RESTRICT
--      - fk_payment_allocations_allocated_by -> profiles(id)
--      - fk_payment_allocations_reversed_by -> profiles(id)
-- 3. Indexes & Constraints:
--      - idx_payment_allocations_payment on (payment_id)
--      - idx_payment_allocations_registration_player on (registration_player_id)
--      - idx_payment_allocations_allocated_by on (allocated_by_profile_id)
--      - idx_payment_allocations_reversed_by on (reversed_by_profile_id)
--      - Partial unique index uq_payment_allocations_active_player on (payment_id, registration_player_id) WHERE reversed_at IS NULL
--
-- Safety Guarantees:
-- - Non-destructive to existing data.
-- - No backfill or automatic assignment of legacy payments.
-- - Existing payment rows remain untouched.
-- ============================================================================

BEGIN;

-- 1. Create table payment_allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  registration_player_id UUID NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  allocated_by_profile_id UUID NOT NULL,
  reconciliation_note TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ(6) NULL,
  reversed_by_profile_id UUID NULL,
  reversal_reason TEXT NULL
);

-- 2. Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_allocations_payment'
  ) THEN
    ALTER TABLE payment_allocations
      ADD CONSTRAINT fk_payment_allocations_payment
      FOREIGN KEY (payment_id)
      REFERENCES payments(id)
      ON DELETE RESTRICT
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_allocations_registration_player'
  ) THEN
    ALTER TABLE payment_allocations
      ADD CONSTRAINT fk_payment_allocations_registration_player
      FOREIGN KEY (registration_player_id)
      REFERENCES registration_players(id)
      ON DELETE RESTRICT
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_allocations_allocated_by'
  ) THEN
    ALTER TABLE payment_allocations
      ADD CONSTRAINT fk_payment_allocations_allocated_by
      FOREIGN KEY (allocated_by_profile_id)
      REFERENCES profiles(id)
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_allocations_reversed_by'
  ) THEN
    ALTER TABLE payment_allocations
      ADD CONSTRAINT fk_payment_allocations_reversed_by
      FOREIGN KEY (reversed_by_profile_id)
      REFERENCES profiles(id)
      ON UPDATE NO ACTION;
  END IF;
END $$;

-- 3. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment
  ON payment_allocations (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_registration_player
  ON payment_allocations (registration_player_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_allocated_by
  ON payment_allocations (allocated_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_reversed_by
  ON payment_allocations (reversed_by_profile_id);

-- 4. Partial unique index to enforce active allocation uniqueness per player per payment
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_allocations_active_player
  ON payment_allocations (payment_id, registration_player_id)
  WHERE reversed_at IS NULL;

COMMIT;
