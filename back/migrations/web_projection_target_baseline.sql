-- S38: the web-projection target — register `ts-next` (a Next.js component) and the
-- `control` source kind in the S34 emit ledger (runtime.generated_artifacts).
-- EXPAND-ONLY, additive, idempotent: it WIDENS the target CHECK to a SUPERSET (the S34
-- set ∪ {ts-next}) and never narrows it, never drops a column, never touches a GRANT
-- (expand-contract, forward-only — CLAUDE.md §9 anti-overwrite). The prior targets
-- (go-sqlc | pg-ddl | ts-types) and every prior ledger row stay valid.
--
-- THE WALL is unchanged (S04 + S34): the agent role keeps SELECT-only on the ledger
-- (it reads its emit history for the /web-preview panel); only the `aidos` writer role
-- inserts a row, through the /web-project gesture. The web emitter READS the control +
-- action AST from kernel (SELECT-only) and WRITES the .tsx projection into front/web
-- (the filesystem, below the line), recording the emit here.
--
-- WHY A CHECK WIDEN (not "no table touch"): the S38 spec says "insert target='ts-next'
-- rows; do not alter the S34 table". The S34 CHECK only admitted go-sqlc|pg-ddl|ts-types,
-- so a ts-next insert would be refused. Widening a closed-set CHECK to a superset is the
-- canonical additive (refine) change — it is recorded as ADR 0028 + a SemanticDiff
-- (change_type=refine, additive); it adds a member, it removes none. No GRANT, column,
-- or prior row is altered.

-- Guard: only widen if the table exists (S34 baseline applied first).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'runtime' AND table_name = 'generated_artifacts'
    ) THEN
        -- Drop the prior (narrower) CHECK and re-add the widened (superset) one. The
        -- constraint name is stable (Postgres auto-names it
        -- generated_artifacts_target_check); guard on its existence so this is idempotent.
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'generated_artifacts_target_check'
        ) THEN
            ALTER TABLE runtime.generated_artifacts
                DROP CONSTRAINT generated_artifacts_target_check;
        END IF;
        -- Idempotent re-add (drop the widened one too if a prior run added it).
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'generated_artifacts_target_check_s38'
        ) THEN
            ALTER TABLE runtime.generated_artifacts
                DROP CONSTRAINT generated_artifacts_target_check_s38;
        END IF;
        ALTER TABLE runtime.generated_artifacts
            ADD CONSTRAINT generated_artifacts_target_check_s38
            CHECK (target IN ('go-sqlc', 'pg-ddl', 'ts-types', 'ts-next'));
    END IF;
END $$;
