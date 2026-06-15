package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// PgGoalCheckSource is the PRODUCTION goal-check source (ADR 0081, issue A): it reads
// the live goal-check state from real Postgres, SELECT-ONLY, to feed the NON-GAMEABLE
// stop (KRD §57 ①, §8) the same four inputs the S29 engine grades:
//
//	red set → green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster
//
// It is the wire that closes ADR 0081's "MutationRunner branché dans le chemin de Stop"
// gap: until this source reads the real mutation score + the live red-set verdicts, the
// goal-check half ran only over the in-memory seam (NoGoalSource / the fault-injection
// fixture) and the computed "done" was incomplete. PgGoalCheckSource makes the Stop
// gate read the REAL densimètre + the REAL red wave when a DB is wired.
//
// THE WALL (CLAUDE.md §2): every query is a SELECT below the line. It reads
//   - ideas.goal           (the agent role has SELECT only — the goal is a TRUTH record;
//     opening/closing it stays the aidos CLI writer role);
//   - runtime.mirror_runs   (below the waterline — the per-mirror cliquet verdicts);
//   - runtime.mutation_runs (below the waterline — the densimètre run-log, S40);
//   - fitness.mutation_threshold (the DECLARED floor — SELECT only, never authored, §8);
//   - runtime.completeness_runs / completeness_monster_findings (the monster set, S12).
//
// It WRITES NOTHING and NEVER stamps a goal CLOSED — the verdict is computed by the pure
// S29 engine (goal.IsClosed / goal.CloseBlockReason) over the values this source loads.
//
// ANTI-PASSTHROUGH (KRD §82): a read failure is returned as an error so CheckGoal fails
// CLOSED (a goal whose evidence cannot be read must NOT close on absent evidence); a
// missing per-mirror verdict is left absent so the goal engine treats it as RED. The DB
// source never fabricates a green it cannot prove.
//
// FALLBACK (CLAUDE.md, the bootstrap exception): when no DATABASE_URL is wired, main.go
// keeps the default NoGoalSource (no open goal → goal-check is a no-op) so the interactive
// cockpit's Stop still fails-open without a DB — UNCHANGED. PgGoalCheckSource is wired
// ONLY when a pool exists; absent a pool the binary's behaviour is exactly as before.
type PgGoalCheckSource struct {
	Pool *pgxpool.Pool
	// MutationScope selects the densimètre scope whose latest run feeds the gate. The
	// Stop hook grades AIDOS's own Go cut, so it defaults to "go" (see NewPgGoalCheckSource).
	MutationScope string
}

// NewPgGoalCheckSource builds the production source over a pool, scoped to the Go
// densimètre (the scope the Stop hook grades — AIDOS's own code cut).
func NewPgGoalCheckSource(pool *pgxpool.Pool) *PgGoalCheckSource {
	return &PgGoalCheckSource{Pool: pool, MutationScope: "go"}
}

// goalBody is the SELECT-only view of the ideas.goal JSONB body the goal-check needs:
// the red set (the failing mirror refs that ARE the goal, §56) and the declared budgets
// (the secondary anti-runaway guard). Other body fields are not needed to compute the
// stop and are intentionally ignored.
type goalBody struct {
	RedSet  []string     `json:"red_set"`
	Budgets goal.Budgets `json:"budgets"`
}

// Load reads the live goal-check inputs. It returns hasGoal=false (a no-op goal-check)
// when there is no OPEN goal — the SAME contract as NoGoalSource, so a DB with no open
// goal behaves like the no-DB fallback (goal-check passes, completeness still runs). A
// query error is returned so the caller fails CLOSED (anti-passthrough).
func (s *PgGoalCheckSource) Load(ctx context.Context) (goal.Goal, goal.StopInput, bool, error) {
	g, hasGoal, err := s.loadOpenGoal(ctx)
	if err != nil {
		return goal.Goal{}, goal.StopInput{}, false, err
	}
	if !hasGoal {
		// No OPEN goal → nothing to close; goal-check is a no-op (the completeness half
		// still runs). This is the ABSENCE of an open goal, not a silent pass over a red one.
		return goal.Goal{}, goal.StopInput{}, false, nil
	}

	in, err := s.loadStopInput(ctx, g.RedSet)
	if err != nil {
		return goal.Goal{}, goal.StopInput{}, false, err
	}
	return g, in, true, nil
}

// loadOpenGoal reads the single OPEN goal (there is at most one open goal in a run; the
// most recently opened wins if several somehow exist). It reconstructs only the fields
// the stop predicate reads — the RED SET (from the JSONB body) and the budgets — plus
// the ids for the audit trail. hasGoal=false when no OPEN row exists.
func (s *PgGoalCheckSource) loadOpenGoal(ctx context.Context) (goal.Goal, bool, error) {
	const q = `
SELECT id, idea_ref, changeset_ref, body
FROM ideas.goal
WHERE status = 'OPEN'
ORDER BY created_at DESC
LIMIT 1`
	var id, ideaRef, changesetRef string
	var body []byte
	if err := s.Pool.QueryRow(ctx, q).Scan(&id, &ideaRef, &changesetRef, &body); err != nil {
		if err == pgx.ErrNoRows {
			return goal.Goal{}, false, nil
		}
		return goal.Goal{}, false, fmt.Errorf("stop: query open goal: %w", err)
	}
	var gb goalBody
	if err := json.Unmarshal(body, &gb); err != nil {
		return goal.Goal{}, false, fmt.Errorf("stop: decode goal body: %w", err)
	}
	g := goal.Goal{
		ID:           id,
		IdeaRef:      ideaRef,
		ChangeSetRef: changesetRef,
		RedSet:       gb.RedSet,
		Status:       goal.StatusOpen,
		Budgets:      gb.Budgets,
	}
	return g, true, nil
}

// loadStopInput assembles the four-part stop input from the runtime run-logs + the
// declared fitness floor. Every read is SELECT-only.
func (s *PgGoalCheckSource) loadStopInput(ctx context.Context, redSet []string) (goal.StopInput, error) {
	sensors, priorGreen, err := s.loadMirrorVerdicts(ctx, redSet)
	if err != nil {
		return goal.StopInput{}, err
	}
	mutation, floor, err := s.loadMutation(ctx)
	if err != nil {
		return goal.StopInput{}, err
	}
	monsters, err := s.loadMonsters(ctx)
	if err != nil {
		return goal.StopInput{}, err
	}
	return goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    priorGreen,
		Mutation:      mutation,
		MutationFloor: floor,
		Monsters:      monsters,
	}, nil
}

// loadMirrorVerdicts reads, per red-set mirror, its LATEST cliquet verdict from
// runtime.mirror_runs (green | red), and computes whether prior green is intact (no
// latest run carries regressed=true — a green→red regression on a prior truth, §8). A
// mirror with NO run is left ABSENT from the map so the goal engine treats it as RED
// (anti-passthrough: the goal cannot close on a mirror whose verdict was never recorded).
func (s *PgGoalCheckSource) loadMirrorVerdicts(ctx context.Context, redSet []string) (map[string]goal.SensorState, goal.PriorGreenState, error) {
	sensors := make(map[string]goal.SensorState, len(redSet))

	// Per red-set mirror: the latest run's status (DISTINCT ON the mirror, newest first).
	if len(redSet) > 0 {
		const qSensors = `
SELECT DISTINCT ON (mirror_id) mirror_id, status
FROM runtime.mirror_runs
WHERE mirror_id = ANY($1)
ORDER BY mirror_id, ran_at DESC, id DESC`
		rows, err := s.Pool.Query(ctx, qSensors, redSet)
		if err != nil {
			return nil, goal.PriorBroken, fmt.Errorf("stop: query mirror verdicts: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var mirrorID, status string
			if err := rows.Scan(&mirrorID, &status); err != nil {
				return nil, goal.PriorBroken, fmt.Errorf("stop: scan mirror verdict: %w", err)
			}
			if status == "green" {
				sensors[mirrorID] = goal.SensorGreen
			} else {
				sensors[mirrorID] = goal.SensorRed
			}
		}
		if err := rows.Err(); err != nil {
			return nil, goal.PriorBroken, fmt.Errorf("stop: iterate mirror verdicts: %w", err)
		}
	}

	// Prior green intact ⇔ no mirror's LATEST run is a green→red regression. We check the
	// latest run per mirror across the whole corpus (not only the red set): a regression on
	// ANY prior truth breaks the prior-green condition (§8).
	const qRegression = `
SELECT EXISTS (
  SELECT 1 FROM (
    SELECT DISTINCT ON (mirror_id) regressed
    FROM runtime.mirror_runs
    ORDER BY mirror_id, ran_at DESC, id DESC
  ) latest
  WHERE latest.regressed
)`
	var anyRegressed bool
	if err := s.Pool.QueryRow(ctx, qRegression).Scan(&anyRegressed); err != nil {
		return nil, goal.PriorBroken, fmt.Errorf("stop: query prior-green regression: %w", err)
	}
	priorGreen := goal.PriorIntact
	if anyRegressed {
		priorGreen = goal.PriorBroken
	}
	return sensors, priorGreen, nil
}

// loadMutation reads the LATEST densimètre run's score for the hook's scope, and the
// DECLARED floor. The floor is read SELECT-only from fitness.mutation_threshold (the
// declared bar, never authored by the agent — §8); when fitness carries no row, we fall
// back to the threshold_used recorded on the latest run (itself a SELECT-only mirror of
// the declared bar at run time). No mutation run yet ⇒ score 0 (below any positive floor
// ⇒ the gate blocks; the densimètre has not graded this cut, so it is not yet "done").
func (s *PgGoalCheckSource) loadMutation(ctx context.Context) (score float64, floor float64, err error) {
	const qRun = `
SELECT score, threshold_used
FROM runtime.mutation_runs
WHERE scope = $1
ORDER BY id DESC
LIMIT 1`
	var thresholdUsed float64
	switch err := s.Pool.QueryRow(ctx, qRun, s.MutationScope).Scan(&score, &thresholdUsed); err {
	case nil:
		// got the latest run
	case pgx.ErrNoRows:
		// No densimètre run for this scope yet: score 0, floor from fitness (below).
		score, thresholdUsed = 0, 0
	default:
		return 0, 0, fmt.Errorf("stop: query latest mutation run: %w", err)
	}

	floor, ok, ferr := s.readDeclaredFloor(ctx)
	if ferr != nil {
		return 0, 0, ferr
	}
	if !ok {
		// No declared floor row in fitness → use the bar the latest run recorded (the
		// declared bar at run time). If there is neither, floor stays 0 (and the gate
		// closes only on the other three conditions for an ungraded cut).
		floor = thresholdUsed
	}
	return score, floor, nil
}

// readDeclaredFloor reads the declared mutation floor for the hook's scope SELECT-only
// from fitness.mutation_threshold (the same head-mutable, content-addressed row the
// S40 densimètre reads). ok=false ⇒ no declared row (the caller falls back to the run's
// recorded threshold). The fitness schema is SELECT-only to the agent — the wall (§2/§8).
func (s *PgGoalCheckSource) readDeclaredFloor(ctx context.Context) (float64, bool, error) {
	const q = `
SELECT body
FROM fitness.mutation_threshold
WHERE id = 'mutation_threshold' AND superseded_by IS NULL
ORDER BY created_at DESC
LIMIT 1`
	var body []byte
	switch err := s.Pool.QueryRow(ctx, q).Scan(&body); err {
	case nil:
		// got the head threshold row
	case pgx.ErrNoRows:
		return 0, false, nil
	default:
		return 0, false, fmt.Errorf("stop: read fitness mutation floor: %w", err)
	}
	var bars map[string]float64
	if err := json.Unmarshal(body, &bars); err != nil {
		return 0, false, fmt.Errorf("stop: decode fitness mutation floor: %w", err)
	}
	bar, ok := bars[s.MutationScope]
	return bar, ok, nil
}

// loadMonsters reads the monster set of the LATEST completeness run (S12): any monster
// (an orphan mirror or a mirror-less truth) blocks the close (§8). It returns the per-
// finding refs so the goal engine sees a non-empty slice when monsters exist. No
// completeness run yet ⇒ no monster row ⇒ empty (the completeness HALF of the Stop runs
// independently and will itself block on a real monster in the head cut).
func (s *PgGoalCheckSource) loadMonsters(ctx context.Context) ([]string, error) {
	const qLatest = `
SELECT run_id
FROM runtime.completeness_runs
ORDER BY id DESC
LIMIT 1`
	var runID string
	switch err := s.Pool.QueryRow(ctx, qLatest).Scan(&runID); err {
	case nil:
		// got the latest completeness run
	case pgx.ErrNoRows:
		return nil, nil
	default:
		return nil, fmt.Errorf("stop: query latest completeness run: %w", err)
	}

	const qFindings = `
SELECT ref
FROM runtime.completeness_monster_findings
WHERE run_id = $1
ORDER BY id ASC`
	rows, err := s.Pool.Query(ctx, qFindings, runID)
	if err != nil {
		return nil, fmt.Errorf("stop: query monster findings: %w", err)
	}
	defer rows.Close()
	var monsters []string
	for rows.Next() {
		var ref string
		if err := rows.Scan(&ref); err != nil {
			return nil, fmt.Errorf("stop: scan monster finding: %w", err)
		}
		monsters = append(monsters, ref)
	}
	return monsters, rows.Err()
}
