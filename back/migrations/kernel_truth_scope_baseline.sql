-- S15: TruthScope — "aucune vérité n'est universelle par défaut" (KRD §13.7).
-- Expand-only, append-only, ADDITIVE. Adds ONE NULLABLE content-addressed column to
-- the S02 kernel.truth record: scope jsonb (the serialized TruthScope value object).
-- Applied via Atlas (declarative); this file is the canonical DDL source.
--
-- EXPAND-CONTRACT (CLAUDE.md §3/§9): the column is added NULLABLE so existing rows are
-- untouched — NO backfill, NO NOT NULL flip this step. A non-active *idea* may have no
-- scope yet; the ACTIVE-truth requirement ("an active truth must carry a scope, unless
-- explicitly global") is enforced by the PURE guard scope.Validate, NOT by a NOT NULL —
-- so an idea can exist scope-less before promotion. It does NOT alter, drop, or
-- NOT-NULL-flip any prior column; the S02 kernel.truth shape is otherwise unchanged.
--
-- CONTENT-ADDRESS (KRD §12, S02): the scope rides INSIDE the same content-addressed
-- body, so id == version == Hash(Canonicalize(body)) still holds; this `scope jsonb` is
-- a PROJECTED, queryable copy of body->'scope' for the SELECT-only Workbench panel, NOT
-- a second source of truth. The record stays append-only (head moves via a NEW row +
-- superseded_by, never an UPDATE/DELETE of the body). Changing the scope ⇒ a new
-- version (a SemanticDiff change_type `rescope`, KRD §44.1), never an in-place edit.
--
-- THE WALL (CLAUDE.md §2): no GRANT is added/changed here. The agent role keeps its
-- SELECT-only on kernel.truth (granted in kernel_records_baseline.sql / S04 wall grants);
-- only the privileged aidos CLI writer role writes truth, via an approved ChangeSet.
-- This migration is AUTHORED here but APPLIED by the migration role.

-- scope — the serialized TruthScope value object (KRD §13.7). Nullable: a non-active
-- idea may be scope-less; the active-truth rule is the guard's job, not a NOT NULL.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS scope jsonb;
