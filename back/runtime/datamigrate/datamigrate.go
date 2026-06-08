// Package datamigrate is the AIDOS Runtime DATA-MIGRATION-OF-THE-EMITTED-APP planner
// (S95; app-builder EPIC 10, DP15/DP26). It is DISTINCT from the truth-store migration
// (back/migrations, the OS's own Postgres): this plans the migration of the DATA OF A
// DEPLOYED EMITTED APP — an app that is already running with REAL ROWS — when its entity
// schema changes in a BREAKING way.
//
// THE CAPABILITY (S95 done-criteria). On a deployed app with real rows, prove the HARD
// cases of a breaking schema change, each via Atlas expand-contract + backfill, gated by
// the change's DataTruthScope (§44.3):
//
//   - RENAME-WITH-BACKFILL — a column is renamed: the old column's values are recopied
//     (backfilled) into the new column so NO ROW LOSES ITS VALUE. Expand (add new col) →
//     backfill (copy old→new) → contract (drop old, a separate forward step).
//   - ENTITY SPLIT — one entity is split into two (a column moves to a new table): the
//     existing rows are ventilated into the new table, every row preserved.
//   - CARDINALITY CHANGE 1-N→N-N — a relation's cardinality widens from one-to-many to
//     many-to-many: the FK column becomes a join table backfilled from the existing FK
//     values, migrating WITHOUT LOSS.
//
// THE GATE (S95 / §44.3). A migration that is BREAKING (drops/narrows a column the real
// rows depend on, splits an entity, or widens a relation) and declares NO BACKFILL is
// REFUSED with BREAKING_MIGRATION_NO_BACKFILL (the S13 BlockReason shape) — never run with
// a silent DROP that loses data (KRD §44.3 « changer la vérité du code ne change pas
// automatiquement la vérité des données déjà produites » ; CLAUDE.md §9 anti-overwrite).
// The breaking-ness is COMPUTED — a deterministic structural diff crossed with the declared
// DataTruthScope — never an LLM judgment (determinism-first, §6/§8). This planner reuses
// db.RequireMigration (S37/§44.3, the closed strategy/applies_to sets) for the scope gate
// and db.EmitMigration (the expand-contract DDL projection) for the schema steps; it adds
// the DATA-MOVE (backfill) plan the deployed app needs, which the truth-store migration
// never had (the OS has no "real rows of a user app").
//
// DETERMINISM-FIRST (CLAUDE.md §6). Plan is a PURE, TOTAL function of its canonicalised
// input — no clock, no RNG, no map-order leak, no absolute path. Same change for the same
// app → byte-identical Plan (same ID, same steps, same backfill SQL). The reproducibility
// mirror pins it. DRIVER-NEUTRAL: the plan is emitted SQL + a content address; the client
// that applies it is a thin TS twin (front/web/lib/datamigrate.ts), no driver baked in.
//
// THE WALL (CLAUDE.md §2). datamigrate READS the entity change (already-pinned AST, below
// the line) and the DataTruthScope declaration; it PLANS the data migration. It writes
// NOTHING to the kernel/mirrors/fitness. A breaking change with no backfill, a malformed
// entity, an unknown strategy — each is a typed BlockReason, never a panic, never an
// invented column, never a silent DROP.
package datamigrate

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// ChangeKind is one member of the CLOSED S95 set of breaking-change kinds the planner
// understands. The set is declared, never discovered — an unknown kind is a BlockReason,
// never coerced.
type ChangeKind string

const (
	// KindRename — a column is renamed (old → new). Breaking: the old column is dropped;
	// its values MUST be backfilled into the new column or every row loses its value.
	KindRename ChangeKind = "rename"
	// KindSplit — one entity is split into two (a column moves to a new entity/table).
	// Breaking: the moved column is dropped from the source; its values MUST be ventilated
	// into the new table or the data is lost.
	KindSplit ChangeKind = "split"
	// KindCardinality — a relation's cardinality changes (here 1-N → N-N). Breaking: the
	// inline FK column is dropped in favour of a join table; the existing FK values MUST be
	// backfilled into the join table or the relation's data is lost.
	KindCardinality ChangeKind = "cardinality"
)

var changeKindOrder = []ChangeKind{KindRename, KindSplit, KindCardinality}

func isKnownChangeKind(k ChangeKind) bool {
	for _, kk := range changeKindOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// ChangeKinds returns every ChangeKind in the closed set, in canonical order (the
// Workbench legend + the property mirror read this single source).
func ChangeKinds() []ChangeKind {
	out := make([]ChangeKind, len(changeKindOrder))
	copy(out, changeKindOrder)
	return out
}

// RenameChange describes a column rename on an entity carrying real rows.
type RenameChange struct {
	Entity string `json:"entity"` // the table holding the rows
	From   string `json:"from"`   // the old column name
	To     string `json:"to"`     // the new column name
	Type   string `json:"type"`   // the canonical column type (closed set, generators)
}

// SplitChange describes splitting an entity: a column moves from Source to NewEntity.
type SplitChange struct {
	Source    string `json:"source"`     // the entity the column leaves
	NewEntity string `json:"new_entity"` // the entity it moves into
	Column    string `json:"column"`     // the moved column
	Type      string `json:"type"`       // the canonical column type
}

// CardinalityChange describes widening a relation from 1-N to N-N.
type CardinalityChange struct {
	Source   string          `json:"source"`   // the source entity (held the inline FK)
	Target   string          `json:"target"`   // the target entity
	Relation string          `json:"relation"` // the relation/FK name
	From     ref.Cardinality `json:"from"`     // must be 1-N
	To       ref.Cardinality `json:"to"`       // must be N-N
}

// Change is the whole migration request. EXACTLY ONE of Rename/Split/Cardinality is set
// (the Kind selects which). It carries the DEPLOYED app's project (the migration is per
// app), the change kind, and the OPTIONAL declared DataTruthScope (the backfill gate).
type Change struct {
	Project     string             `json:"project"` // the deployed app
	Kind        ChangeKind         `json:"kind"`    // which breaking change
	Rename      *RenameChange      `json:"rename,omitempty"`
	Split       *SplitChange       `json:"split,omitempty"`
	Cardinality *CardinalityChange `json:"cardinality,omitempty"`
	// Scope is the OPTIONAL declared DataTruthScope (§44.3). nil ⇒ no backfill declared ⇒
	// a breaking change is refused (BREAKING_MIGRATION_NO_BACKFILL).
	Scope *db.DataTruthScope `json:"scope,omitempty"`
}

// Step is one forward-only stage of the plan: an EXPAND (additive DDL), a BACKFILL (the
// declared data move — the key novelty over the truth-store migration), or a CONTRACT
// (the destructive drop, a SEPARATE forward step after backfill).
type Step struct {
	Stage string `json:"stage"` // "expand" | "backfill" | "contract"
	SQL   string `json:"sql"`   // the forward-only SQL for this stage (driver-neutral text)
	Note  string `json:"note"`  // human note (what this stage preserves)
}

// Plan is the DETERMINISTIC, content-addressed data-migration plan for the deployed app.
// Same Change → byte-identical Plan (same ID, same steps). It carries the THREE staged
// steps (expand → backfill → contract), forward-only and non-destructive until contract.
type Plan struct {
	ID          string     `json:"id"`          // content address (idempotency key)
	Project     string     `json:"project"`     // the deployed app
	Kind        ChangeKind `json:"kind"`        // the breaking change kind
	Description string     `json:"description"` // the human one-liner
	Steps       []Step     `json:"steps"`       // expand → backfill → contract (forward-only)
	// MigrationRequired echoes the §44.3 gate verdict (always true for a breaking change).
	MigrationRequired bool `json:"migration_required"`
	// PreservesAllData is the COMPUTED guarantee: the plan backfills before it contracts, so
	// no row loses its value. The reproducibility/no-loss mirror asserts it.
	PreservesAllData bool `json:"preserves_all_data"`
}

// Typed causes — every refusal is one of these (honesty: never invent a column/rule).
var (
	ErrNoProject       = errors.New("datamigrate: change has no project (the migration is per deployed app)")
	ErrUnknownKind     = errors.New("datamigrate: unknown change kind (the set is closed)")
	ErrMissingRename   = errors.New("datamigrate: rename change has no rename body (entity/from/to)")
	ErrMissingSplit    = errors.New("datamigrate: split change has no split body (source/new_entity/column)")
	ErrMissingCard     = errors.New("datamigrate: cardinality change has no cardinality body")
	ErrIncompleteName  = errors.New("datamigrate: a required name (entity/column/relation) is empty")
	ErrUnknownType     = errors.New("datamigrate: column type is outside the closed scalar set")
	ErrCardNotWidening = errors.New("datamigrate: cardinality change must be 1-N → N-N (the planned widening)")
)

// breakingBlock is the BREAKING_MIGRATION_NO_BACKFILL refusal (the S95 gate). It is the
// canonical registry reason — datamigrate never re-coins it.
func breakingBlock() blockreason.BlockReason {
	return blockreason.For(blockreason.CodeBreakingMigrationNoBackfill)
}

// inputBlock wraps a malformed-input cause into the OUT_OF_SCOPE shape (the same code the
// emitters use for a malformed source — a malformed change is an out-of-scope source).
func inputBlock(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Data-migration refused: " + cause.Error(),
		HowToFix: []string{
			"Provide a project, a known change kind, and the matching change body",
			"Use only the closed scalar type set for renamed/moved columns",
			"A cardinality change must widen 1-N → N-N",
		},
	}
}

// hasValidBackfill reports whether the declared DataTruthScope is a valid backfill for a
// breaking change: required:true, a KNOWN strategy, and preserve_old_truth:true. It REUSES
// db.RequireMigration's gate logic by feeding it a historical-impact change — the same
// closed sets, never a forked rule. Returns (ok, scopeBlock?) where scopeBlock is the
// §44.3 BlockReason (e.g. UNKNOWN_MIGRATION_STRATEGY) when the declaration is malformed.
func hasValidBackfill(scope *db.DataTruthScope) (bool, *blockreason.BlockReason) {
	// A breaking change always touches existing rows — feed RequireMigration a historical
	// impact descriptor so its closed-set gate validates the declaration the same way the
	// truth-store path does. required is always true here; we only care whether the gate
	// blocks (no/invalid declaration) or allows (valid backfill).
	c := db.Change{
		ChangeType: "breaking",
		Entity:     "deployed_app",
		AppliesTo:  []db.AppliesTo{db.AppliesExistingRecords},
		Scope:      scope,
	}
	_, br := db.RequireMigration(c)
	if br == nil {
		return true, nil
	}
	// A malformed declaration (unknown strategy) surfaces its own §44.3 code; a
	// missing/insufficient declaration surfaces HISTORICAL_IMPACT_REQUIRES_MIGRATION, which
	// the S95 planner re-frames as BREAKING_MIGRATION_NO_BACKFILL (the deployed-app code).
	if br.Code == blockreason.CodeUnknownMigrationStrategy {
		return false, br
	}
	return false, nil
}

// Build is the pure S95 planner: validate → gate (DataTruthScope backfill) → stage the
// expand/backfill/contract steps → content-address. Same Change → byte-identical Plan.
// Writes nothing (the wall). A breaking change with no/invalid backfill is REFUSED.
func Build(c Change) (Plan, *blockreason.BlockReason) {
	if c.Project == "" {
		br := inputBlock(ErrNoProject)
		return Plan{}, &br
	}
	if !isKnownChangeKind(c.Kind) {
		br := inputBlock(ErrUnknownKind)
		return Plan{}, &br
	}
	if err := validateBody(c); err != nil {
		br := inputBlock(err)
		return Plan{}, &br
	}

	// THE GATE. Every S95 change is breaking (rename/split/cardinality each drop or narrow a
	// column the real rows depend on). A breaking change REQUIRES a declared backfill.
	ok, scopeBlock := hasValidBackfill(c.Scope)
	if !ok {
		if scopeBlock != nil {
			// A malformed declaration (unknown strategy) surfaces its own §44.3 code verbatim.
			return Plan{}, scopeBlock
		}
		// No/insufficient backfill on a breaking change → the S95 refusal.
		br := breakingBlock()
		return Plan{}, &br
	}

	steps, desc := stage(c)
	plan := Plan{
		Project:           c.Project,
		Kind:              c.Kind,
		Description:       desc,
		Steps:             steps,
		MigrationRequired: true,
		PreservesAllData:  preservesAllData(steps),
	}
	id, err := plan.contentAddress()
	if err != nil {
		br := inputBlock(err)
		return Plan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// validateBody checks the kind-matched body is present, complete, and typed inside the
// closed sets. It invents nothing — a missing field is a typed cause.
func validateBody(c Change) error {
	switch c.Kind {
	case KindRename:
		r := c.Rename
		if r == nil {
			return ErrMissingRename
		}
		if r.Entity == "" || r.From == "" || r.To == "" {
			return ErrIncompleteName
		}
		if !knownScalar(r.Type) {
			return ErrUnknownType
		}
	case KindSplit:
		s := c.Split
		if s == nil {
			return ErrMissingSplit
		}
		if s.Source == "" || s.NewEntity == "" || s.Column == "" {
			return ErrIncompleteName
		}
		if !knownScalar(s.Type) {
			return ErrUnknownType
		}
	case KindCardinality:
		cc := c.Cardinality
		if cc == nil {
			return ErrMissingCard
		}
		if cc.Source == "" || cc.Target == "" || cc.Relation == "" {
			return ErrIncompleteName
		}
		if cc.From != ref.OneToMany || cc.To != ref.ManyToMany {
			return ErrCardNotWidening
		}
	}
	return nil
}

// knownScalar reports whether a type token is a renderable column type. It REUSES the
// db.EmitMigration emitter's closed scalar set by probing a minimal EntitySource: if the
// emitter accepts a one-field entity of that type, the type is known. Deterministic, no
// forked map (determinism-first / honesty: one source of truth for the type set).
func knownScalar(t string) bool {
	probe := generators.EntitySource{
		Kind:   generators.KindEntity,
		Name:   "probe",
		Fields: []generators.Field{{Name: "id", Type: "text"}, {Name: "v", Type: t}},
	}
	_, br := db.EmitMigration(probe, nil)
	return br == nil
}

// stage produces the THREE forward-only steps (expand → backfill → contract) for the
// change, plus the human description. The backfill SQL is the NOVELTY over the truth-store
// migration: it MOVES the real rows' data so nothing is lost before the contract drop.
func stage(c Change) ([]Step, string) {
	switch c.Kind {
	case KindRename:
		return stageRename(*c.Rename)
	case KindSplit:
		return stageSplit(*c.Split)
	case KindCardinality:
		return stageCardinality(*c.Cardinality)
	}
	return nil, ""
}

// q quotes a Postgres identifier (reserved-word safe). Deterministic — names come verbatim
// from the pinned change.
func q(s string) string { return fmt.Sprintf("%q", strings.ToLower(s)) }

// stageRename: EXPAND add new col → BACKFILL copy old→new → CONTRACT drop old.
func stageRename(r RenameChange) ([]Step, string) {
	t := q(r.Entity)
	from := q(r.From)
	to := q(r.To)
	col := ddlType(r.Type)
	return []Step{
		{
			Stage: "expand",
			SQL:   fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS %s %s;", t, to, col),
			Note:  "additive: the new column is added NULLable, no historical row rewritten",
		},
		{
			Stage: "backfill",
			SQL:   fmt.Sprintf("UPDATE %s SET %s = %s WHERE %s IS NULL;", t, to, from, to),
			Note:  "recopy every existing row's value old→new — no value lost (preserve_old_truth)",
		},
		{
			Stage: "contract",
			SQL:   fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s;", t, from),
			Note:  "drop the old column in a SEPARATE forward step, AFTER backfill (forward-only)",
		},
	}, fmt.Sprintf("rename %s.%s → %s.%s with backfill", strings.ToLower(r.Entity), strings.ToLower(r.From), strings.ToLower(r.Entity), strings.ToLower(r.To))
}

// stageSplit: EXPAND create new table → BACKFILL ventilate column into it → CONTRACT drop
// the column from the source.
func stageSplit(s SplitChange) ([]Step, string) {
	src := q(s.Source)
	ne := q(s.NewEntity)
	col := q(s.Column)
	col2 := ddlType(s.Type)
	return []Step{
		{
			Stage: "expand",
			SQL: fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (id TEXT PRIMARY KEY, %s %s);",
				ne, col, col2),
			Note: "additive: the new entity's table is created, the source table untouched",
		},
		{
			Stage: "backfill",
			SQL: fmt.Sprintf("INSERT INTO %s (id, %s) SELECT id, %s FROM %s ON CONFLICT (id) DO NOTHING;",
				ne, col, col, src),
			Note: "ventilate every source row's column into the new table — every row preserved",
		},
		{
			Stage: "contract",
			SQL:   fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s;", src, col),
			Note:  "drop the moved column from the source in a SEPARATE forward step, AFTER backfill",
		},
	}, fmt.Sprintf("split %s → %s (move column %s) with backfill", strings.ToLower(s.Source), strings.ToLower(s.NewEntity), strings.ToLower(s.Column))
}

// stageCardinality: EXPAND create join table → BACKFILL fill it from the inline FK →
// CONTRACT drop the inline FK column.
func stageCardinality(c CardinalityChange) ([]Step, string) {
	src := strings.ToLower(c.Source)
	tgt := strings.ToLower(c.Target)
	rel := strings.ToLower(c.Relation)
	join := q(src + "_" + tgt)
	srcID := q(src + "_id")
	tgtID := q(tgt + "_id")
	srcTable := q(src)
	fkCol := q(rel + "_id")
	return []Step{
		{
			Stage: "expand",
			SQL: fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (%s TEXT, %s TEXT, PRIMARY KEY (%s, %s));",
				join, srcID, tgtID, srcID, tgtID),
			Note: "additive: the N-N join table is created, the source FK column untouched",
		},
		{
			Stage: "backfill",
			SQL: fmt.Sprintf("INSERT INTO %s (%s, %s) SELECT id, %s FROM %s WHERE %s IS NOT NULL ON CONFLICT DO NOTHING;",
				join, srcID, tgtID, fkCol, srcTable, fkCol),
			Note: "backfill the join table from every existing 1-N FK value — no relation lost",
		},
		{
			Stage: "contract",
			SQL:   fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s;", srcTable, fkCol),
			Note:  "drop the inline FK column in a SEPARATE forward step, AFTER backfill",
		},
	}, fmt.Sprintf("cardinality %s→%s relation %s: 1-N → N-N with backfill", src, tgt, rel)
}

// preservesAllData is the COMPUTED no-loss guarantee: the plan is non-destructive iff every
// destructive (contract) step is PRECEDED by a backfill step. A pure check over the staged
// steps — CODE judges no-loss, never an agent (determinism-first).
func preservesAllData(steps []Step) bool {
	seenBackfill := false
	for _, s := range steps {
		switch s.Stage {
		case "backfill":
			seenBackfill = true
		case "contract":
			if !seenBackfill {
				return false // a drop before any backfill would lose data
			}
		}
	}
	return seenBackfill
}

// ddlType maps a canonical scalar to its Postgres column type. It mirrors the db emitter's
// closed map (validated upstream by knownScalar, so the default is an unreachable floor).
func ddlType(t string) string {
	switch t {
	case "text":
		return "TEXT"
	case "numeric":
		return "NUMERIC"
	case "int":
		return "BIGINT"
	case "bool":
		return "BOOLEAN"
	case "timestamptz":
		return "TIMESTAMPTZ"
	default:
		return "TEXT"
	}
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID.
// S02 reused (Canonicalize+Hash), never a forked scheme — same Change → same ID.
func (p Plan) contentAddress() (string, error) {
	stepBodies := make([]map[string]any, len(p.Steps))
	for i, s := range p.Steps {
		stepBodies[i] = map[string]any{"stage": s.Stage, "sql": s.SQL, "note": s.Note}
	}
	body := map[string]any{
		"project":            p.Project,
		"kind":               string(p.Kind),
		"description":        p.Description,
		"steps":              stepBodies,
		"migration_required": p.MigrationRequired,
		"preserves_all_data": p.PreservesAllData,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// SortedKinds is a small helper for callers that want the kinds in a stable order (the
// Workbench legend). It de-duplicates and orders by the declared canonical order.
func SortedKinds(ks []ChangeKind) []ChangeKind {
	seen := map[ChangeKind]bool{}
	for _, k := range ks {
		seen[k] = true
	}
	out := []ChangeKind{}
	for _, k := range changeKindOrder {
		if seen[k] {
			out = append(out, k)
		}
	}
	var unknown []ChangeKind
	for k := range seen {
		if !isKnownChangeKind(k) {
			unknown = append(unknown, k)
		}
	}
	sort.Slice(unknown, func(i, j int) bool { return unknown[i] < unknown[j] })
	return append(out, unknown...)
}
