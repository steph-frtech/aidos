package besoinintakesrv

// besoinintakesrv_test.go — the EL15 capability-door mirror: reflects=mcp.besoin-intake, test_kind=integration,
// liveness=live. It spins up a throwaway Postgres (Testcontainers), applies the kernel-records + ideas +
// besoin migrations, and drives the besoin-intake door end-to-end through the REAL stores, proving every
// done-criterion of the ROADMAP EL15 row:
//
//   - round-trip JSONB sans perte (a captured graph reloads byte-equivalent);
//   - append-only (each capture is a row; the count grows, never shrinks);
//   - projets isolés RLS (S55): project A's graph is invisible to a B-scoped session;
//   - Pact-per-tool (every tool is exercised through its handler);
//   - écriture kernel refusée côté GRANT (WroteKernel is ALWAYS false — the agent role has no grant);
//   - journey = NoEmit (a besoin_capture_journey emits NO Idea — no silent cast);
//   - fail-closed BlockReason (an off-altitude capture is refused, the graph unchanged).
//
// THE WALL: the only schemas this server writes are `besoin` (the need store) and `ideas` (the EL05
// emission door). No kernel/mirrors/fitness write exists on any path (there is no grant on this server).

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// appendResolved adds a RESOLVED LevelNode (provenance human, the verbatim utterance) to a graph — the
// "already-decided" graph shape the EL16 emitter projects. Helper for the EL16 integration test.
func appendResolved(t *testing.T, g besoin.BesoinGraph, level, utterance string) besoin.BesoinGraph {
	t.Helper()
	lvl, err := besoin.ParseLevel(level)
	if err != nil {
		t.Fatalf("parse level %q: %v", level, err)
	}
	body, _ := json.Marshal(map[string]any{"marker": level, "intent": utterance})
	out, err := g.AddNode(besoin.LevelNode{
		Level: lvl, Body: body, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: utterance},
	})
	if err != nil {
		t.Fatalf("add resolved node %q: %v", level, err)
	}
	return out
}

// harness holds the owner pool (applies migrations, bypasses RLS) and the AGENT pool (LOGIN role
// subject to the GRANT + RLS — the role the MCP actually runs as in production).
type harness struct {
	owner    *pgxpool.Pool
	agentDSN string
}

func startPostgres(t *testing.T) harness {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	ownerDSN, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	owner, err := pgxpool.New(ctx, ownerDSN)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(owner.Close)

	for _, f := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/ideas_lifecycle_baseline.sql",
		"../../../migrations/besoin_graph_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := owner.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}

	// Make the agent role a LOGIN role so a second pool connects AS the agent — the role the GRANT +
	// RLS actually gate. The migration created it NOLOGIN; grant it login + a password here (test-only).
	if _, err := owner.Exec(ctx, "ALTER ROLE aidos_agent WITH LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter agent role: %v", err)
	}
	// The agent needs USAGE on the schemas + connect privilege (granted by migration for besoin/ideas).
	if _, err := owner.Exec(ctx, "GRANT CONNECT ON DATABASE aidos TO aidos_agent"); err != nil {
		t.Fatalf("grant connect: %v", err)
	}

	// Build the agent DSN by swapping the user/password in the owner DSN.
	cfg, err := pgxpool.ParseConfig(ownerDSN)
	if err != nil {
		t.Fatalf("parse owner dsn: %v", err)
	}
	agentDSN := fmt.Sprintf("postgres://aidos_agent:agentpw@%s:%d/%s?sslmode=disable",
		cfg.ConnConfig.Host, cfg.ConnConfig.Port, cfg.ConnConfig.Database)

	return harness{owner: owner, agentDSN: agentDSN}
}

// newAgentServer builds a server backed by the AGENT-role pool (subject to GRANT + RLS).
func newAgentServer(t *testing.T, h harness) *server {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, h.agentDSN)
	if err != nil {
		t.Fatalf("agent pgxpool: %v", err)
	}
	t.Cleanup(pool.Close)
	return &server{store: NewStoreFromPool(pool), ideas: NewIdeaStoreFromPool(pool)}
}

// completeMeta is the metaInput that makes a node verifiable (records rather than routing to /spike).
func completeMeta() metaInput {
	return metaInput{TruthKind: "behavioral", Verifiability: "deterministic", GlobalScope: true}
}

// TestBesoinIntake_EndToEnd drives the whole capability door, asserting every EL15 done-criterion.
func TestBesoinIntake_EndToEnd(t *testing.T) {
	h := startPostgres(t)
	s := newAgentServer(t, h)
	ctx := context.Background()
	const projA = "shop-a"

	// ── écriture kernel refusée côté GRANT (the wall) ──
	if s.store.CanWriteKernel(ctx) {
		t.Fatal("WALL BREACH: the agent role wrote the kernel — it must have NO kernel grant")
	}

	// ── empty state: product is the enterable level (EL07) ──
	_, st0, err := s.graphState(ctx, nil, stateInput{Project: projA})
	if err != nil {
		t.Fatalf("graph_state empty: %v", err)
	}
	if st0.EnterableLevel != "product" {
		t.Fatalf("empty graph enterable = %q, want product", st0.EnterableLevel)
	}
	if st0.NodeRowCount != 0 {
		t.Fatalf("empty graph row count = %d, want 0", st0.NodeRowCount)
	}

	// ── besoin_level_schema: a client reads the required fields, invents no field ──
	_, sch, err := s.levelSchema(ctx, nil, schemaInput{Level: "product"})
	if err != nil {
		t.Fatalf("level_schema: %v", err)
	}
	if sch.Mapping != "emit:product" || len(sch.RequiredFields) == 0 {
		t.Fatalf("product schema unexpected: %+v", sch)
	}

	// ── fail-closed BlockReason: an off-altitude capture is REFUSED, the graph unchanged ──
	_, off, err := s.captureProduct(ctx, nil, captureInput{
		Project: projA, Utterance: "je veux un attribut",
		Body: map[string]any{"attributes": []any{"name"}}, // an entity body at product — off-altitude.
		Meta: completeMeta(),
	})
	if err != nil {
		t.Fatalf("off-altitude capture errored instead of refusing: %v", err)
	}
	if off.Routing != "off_altitude" || off.BlockReason == nil {
		t.Fatalf("off-altitude not refused with BlockReason: %+v", off)
	}
	if off.GraphHash != "" || off.NodeID != "" {
		t.Fatal("a refused capture must not persist (graph unchanged)")
	}
	_, stAfterOff, _ := s.graphState(ctx, nil, stateInput{Project: projA})
	if stAfterOff.NodeRowCount != 0 {
		t.Fatalf("refused capture appended a row (count=%d)", stAfterOff.NodeRowCount)
	}

	// ── besoin_capture_product: a MAPPING rung — appends a node AND emits an Idea (EL05) ──
	_, capP, err := s.captureProduct(ctx, nil, captureInput{
		Project: projA, Utterance: "je veux une boutique qui vende des livres",
		Body: map[string]any{
			"intent":    "vendre des livres en ligne",
			"scenarios": []any{"acheter un livre"},
			"selects":   []any{"checkout-journey"},
		},
		Meta: completeMeta(),
	})
	if err != nil {
		t.Fatalf("capture_product: %v", err)
	}
	if capP.Routing != "record" {
		t.Fatalf("capture_product routing = %q, want record (block: %+v)", capP.Routing, capP.BlockReason)
	}
	if !capP.Emitted || capP.Idea == nil || capP.Idea.Proposes != "product" {
		t.Fatalf("product rung must emit an Idea{Proposes:product}: %+v", capP)
	}
	if capP.Idea.Source != "human" || capP.Idea.Detail != "je veux une boutique qui vende des livres" {
		t.Fatalf("emitted Idea provenance not verbatim human: %+v", capP.Idea)
	}

	// ── append-only: the capture is a row; the count grew ──
	_, st1, _ := s.graphState(ctx, nil, stateInput{Project: projA})
	if st1.NodeRowCount != 1 {
		t.Fatalf("after product capture row count = %d, want 1", st1.NodeRowCount)
	}
	if st1.GraphHash == "" {
		t.Fatal("graph has no hash after a capture")
	}

	// ── round-trip JSONB sans perte: reload the graph; the product node body survives ──
	g, found, err := s.store.LoadGraph(ctx, projA)
	if err != nil || !found {
		t.Fatalf("LoadGraph: %v found=%v", err, found)
	}
	if _, ok := g.Node("product"); !ok {
		t.Fatal("round-trip lost the product node")
	}
	rh, _ := g.Hash()
	if rh != st1.GraphHash {
		t.Fatalf("round-trip hash drift: %q != %q", rh, st1.GraphHash)
	}

	// ── journey = NoEmit: a besoin_capture_journey appends a node but emits NO Idea ──
	ideasBefore, _ := s.ideas.Count(ctx)
	_, capJ, err := s.captureJourney(ctx, nil, captureInput{
		Project: projA, Utterance: "le parcours d'achat",
		Body: map[string]any{
			"gherkin": "Feature: achat\n  Scenario: acheter\n    Given un panier\n    When je paie\n    Then j'ai le livre",
			"selects": []any{"checkout-view"},
		},
		Meta: completeMeta(),
	})
	if err != nil {
		t.Fatalf("capture_journey: %v", err)
	}
	if capJ.Routing != "record" {
		t.Fatalf("capture_journey routing = %q, want record (block: %+v)", capJ.Routing, capJ.BlockReason)
	}
	if capJ.Emitted || capJ.Idea != nil {
		t.Fatalf("journey is NoEmit — it must NOT emit an Idea: %+v", capJ)
	}
	ideasAfter, _ := s.ideas.Count(ctx)
	if ideasAfter != ideasBefore {
		t.Fatalf("journey emitted %d Idea(s) (NoEmit breach)", ideasAfter-ideasBefore)
	}

	// ── besoin_validate_level: pure pre-flight, no write ──
	rowsBeforeValidate := st1.NodeRowCount + 1 // product + journey
	_, vres, err := s.validateLevel(ctx, nil, validateInput{
		Project: projA, Level: "view",
		Body: map[string]any{"goal": "voir le panier"}, // incomplete view — not enough.
		Meta: completeMeta(),
	})
	if err != nil {
		t.Fatalf("validate_level: %v", err)
	}
	if vres.Enough {
		t.Fatal("an incomplete view must not be 'enough'")
	}
	_, stV, _ := s.graphState(ctx, nil, stateInput{Project: projA})
	if stV.NodeRowCount != rowsBeforeValidate {
		t.Fatalf("validate_level wrote a row (count drifted to %d)", stV.NodeRowCount)
	}

	// ── besoin_classify: the four metadata ──
	_, cls, err := s.classify(ctx, nil, validateInput{Project: projA, Level: "product", Meta: completeMeta()})
	if err != nil {
		t.Fatalf("classify: %v", err)
	}
	if !cls.Complete {
		t.Fatalf("complete metadata classified incomplete: %+v", cls)
	}

	// ── besoin_capture_invariant: a transversal ∀ band — recorded, crosses levels, emits NO Idea ──
	ideasPreInv, _ := s.ideas.Count(ctx)
	_, capInv, err := s.captureInvariant(ctx, nil, invariantCaptureInput{
		Project: projA, Utterance: "pour tout achat le total est strictement positif",
		Body: map[string]any{
			"statement":       "pour tout achat, le total est strictement positif",
			"attached_levels": []any{"operation"},
			"kind":            "path_independent",
		},
		SelfAuthored: false,
		Meta:         completeMeta(),
	})
	if err != nil {
		t.Fatalf("capture_invariant: %v", err)
	}
	if capInv.Routing != "record" {
		t.Fatalf("invariant routing = %q, want record (block: %+v)", capInv.Routing, capInv.BlockReason)
	}
	if len(capInv.CrossedLevels) == 0 {
		t.Fatal("an invariant must cross at least its attached rung (lateral cross-product)")
	}
	ideasPostInv, _ := s.ideas.Count(ctx)
	if ideasPostInv != ideasPreInv {
		t.Fatalf("an ∀ invariant emitted %d Idea(s) (NoEmit breach)", ideasPostInv-ideasPreInv)
	}

	// ── circularity ban (§8): a self-authored invariant is REFUSED ──
	_, circ, err := s.captureInvariant(ctx, nil, invariantCaptureInput{
		Project: projA, Utterance: "auto", Body: map[string]any{"statement": "pour tout x, P"},
		SelfAuthored: true, Meta: completeMeta(),
	})
	if err != nil {
		t.Fatalf("self-authored invariant errored: %v", err)
	}
	if circ.Routing == "record" || circ.BlockReason == nil {
		t.Fatalf("self-authored invariant must be refused: %+v", circ)
	}

	// ── besoin_list ──
	_, lst, err := s.list(ctx, nil, listInput{Project: projA})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if lst.NodeRowCount < 3 {
		t.Fatalf("list count = %d, want >= 3 (product+journey+invariant)", lst.NodeRowCount)
	}
}

// TestBesoinIntake_EmitIdeasEL16 proves the EL16 batch emitter through the REAL stores (agent role,
// GRANT + RLS): besoin_emit_ideas projects the whole persisted BesoinGraph into the backlog of draft
// Ideas, governed by LevelToProposes (EL05) — a MAPPING rung (product) emits one draft Idea, a NoEmit
// rung (journey) emits none, re-emission is idempotent (no duplicate), dry_run previews without
// persisting, and NO kernel truth is ever written (the wall).
func TestBesoinIntake_EmitIdeasEL16(t *testing.T) {
	h := startPostgres(t)
	s := newAgentServer(t, h)
	ctx := context.Background()
	const proj = "emit-shop"

	// the wall: the agent role cannot write the kernel — true throughout the emission.
	if s.store.CanWriteKernel(ctx) {
		t.Fatal("WALL BREACH: agent role wrote the kernel")
	}

	// Persist an already-decided graph (the spec: the MCP persists an already-decided, already-hashed
	// graph) carrying a RESOLVED MAPPING rung (product) and a RESOLVED NoEmit rung (journey). The
	// EL16 door projects it: product → one draft Idea, journey → none.
	g := besoin.NewGraph(proj)
	g = appendResolved(t, g, "product", "je veux une boutique")
	g = appendResolved(t, g, "journey", "le parcours d'achat")
	if _, err := s.store.AppendGraph(ctx, g, "product"); err != nil {
		t.Fatalf("append resolved graph: %v", err)
	}

	// dry_run: PREVIEW the backlog without persisting. Only the product rung maps (journey is NoEmit).
	ideasBefore, _ := s.ideas.Count(ctx)
	_, preview, err := s.emitIdeas(ctx, nil, emitInput{Project: proj, DryRun: true, Meta: completeMeta()})
	if err != nil {
		t.Fatalf("emit dry_run: %v", err)
	}
	if preview.Count != 1 || len(preview.Ideas) != 1 {
		t.Fatalf("dry_run preview count = %d, want 1 (product maps, journey NoEmit)", preview.Count)
	}
	if preview.Ideas[0].Proposes != "product" {
		t.Fatalf("preview idea proposes %q, want product", preview.Ideas[0].Proposes)
	}
	if preview.Persisted {
		t.Fatal("dry_run must not persist")
	}
	if n, _ := s.ideas.Count(ctx); n != ideasBefore {
		t.Fatalf("dry_run persisted %d ideas (must preview only)", n-ideasBefore)
	}

	// real emit: persist the backlog via the legal idea_capture door.
	_, emit1, err := s.emitIdeas(ctx, nil, emitInput{Project: proj, Meta: completeMeta()})
	if err != nil {
		t.Fatalf("emit: %v", err)
	}
	if emit1.Count != 1 || !emit1.Persisted {
		t.Fatalf("emit count = %d persisted=%v, want 1/true", emit1.Count, emit1.Persisted)
	}
	if emit1.Ideas[0].Status != "draft" || emit1.Ideas[0].Source != "human" {
		t.Fatalf("emitted idea not a human draft: %+v", emit1.Ideas[0])
	}

	// idempotence: re-emitting the SAME graph is a NO-OP (ON CONFLICT DO NOTHING) — same id, no dup.
	countAfter1, _ := s.ideas.Count(ctx)
	_, emit2, err := s.emitIdeas(ctx, nil, emitInput{Project: proj, Meta: completeMeta()})
	if err != nil {
		t.Fatalf("re-emit: %v", err)
	}
	if emit2.Ideas[0].ID != emit1.Ideas[0].ID {
		t.Fatalf("re-emission id drift: %q != %q (not content-addressed)", emit2.Ideas[0].ID, emit1.Ideas[0].ID)
	}
	countAfter2, _ := s.ideas.Count(ctx)
	if countAfter2 != countAfter1 {
		t.Fatalf("re-emission created %d duplicate idea(s) (idempotence breach)", countAfter2-countAfter1)
	}

	// the wall still holds after emission.
	if s.store.CanWriteKernel(ctx) {
		t.Fatal("WALL BREACH after emit: agent role wrote the kernel")
	}
}

// TestBesoinIntake_RedBacklogEL17 proves the EL17 door: besoin_red_backlog topo-sorts the persisted
// graph's emitted Ideas into the architectural promotion order — READ-ONLY (it persists no Idea, writes
// no kernel), NoEmit rungs excluded from the list but present in anchors_above, each item carrying its
// expected mirror form, and the order respecting the descent (product before entity).
func TestBesoinIntake_RedBacklogEL17(t *testing.T) {
	h := startPostgres(t)
	s := newAgentServer(t, h)
	ctx := context.Background()
	const proj = "rb-shop"

	if s.store.CanWriteKernel(ctx) {
		t.Fatal("WALL BREACH: agent role wrote the kernel")
	}

	// Persist a graph with two MAPPING rungs (product, entity) and a NoEmit rung (journey) between them.
	g := besoin.NewGraph(proj)
	g = appendResolved(t, g, "product", "je veux une boutique")
	g = appendResolved(t, g, "journey", "le parcours d'achat")
	g = appendResolved(t, g, "entity", "le panier")
	if _, err := s.store.AppendGraph(ctx, g, "product"); err != nil {
		t.Fatalf("append resolved graph: %v", err)
	}

	ideasBefore, _ := s.ideas.Count(ctx)
	_, bl, err := s.redBacklog(ctx, nil, backlogInput{Project: proj, Meta: completeMeta()})
	if err != nil {
		t.Fatalf("red_backlog: %v", err)
	}
	// product + entity map (2), journey is NoEmit (excluded from the list).
	if bl.Cycle {
		t.Fatalf("unexpected cycle: %s", bl.CycleCode)
	}
	if bl.Count != 2 || len(bl.Backlog) != 2 {
		t.Fatalf("backlog count = %d, want 2 (product+entity map, journey NoEmit)", bl.Count)
	}
	// Topological order: product before entity (the descent IS the architecture).
	if bl.Backlog[0].FromLevel != "product" || bl.Backlog[1].FromLevel != "entity" {
		t.Fatalf("order = %s,%s ; want product,entity", bl.Backlog[0].FromLevel, bl.Backlog[1].FromLevel)
	}
	// The mirror form is ANNEXED (product → gherkin_n0, entity → property_n1) — never written.
	if bl.Backlog[0].MirrorForm == "" || bl.Backlog[1].MirrorForm == "" {
		t.Fatalf("mirror form not annexed: %+v", bl.Backlog)
	}
	// journey (NoEmit) appears in entity's anchors_above (the compound made visible), never in the list.
	for _, it := range bl.Backlog {
		if it.FromLevel == "journey" {
			t.Fatal("journey (NoEmit) appeared as a backlog item")
		}
	}
	seenAnchorJourney := false
	for _, it := range bl.Backlog {
		for _, a := range it.AnchorsAbove {
			if a == "journey" {
				seenAnchorJourney = true
			}
		}
	}
	if !seenAnchorJourney {
		t.Fatal("journey (NoEmit) must appear in anchors_above of a deeper item")
	}
	// READ-ONLY: no Idea was persisted (the backlog annexes the form, never writes).
	if n, _ := s.ideas.Count(ctx); n != ideasBefore {
		t.Fatalf("red_backlog persisted %d idea(s) — it must be read-only", n-ideasBefore)
	}
	// the wall still holds.
	if s.store.CanWriteKernel(ctx) {
		t.Fatal("WALL BREACH after red_backlog: agent role wrote the kernel")
	}
}

// TestBesoinIntake_ProjectIsolationRLS proves the S55 row-level isolation: a B-scoped session never
// sees A's BesoinGraph. Each project's captures land in its own scope; cross-project reads return the
// fresh (empty) graph, NOT the other project's rows.
func TestBesoinIntake_ProjectIsolationRLS(t *testing.T) {
	h := startPostgres(t)
	s := newAgentServer(t, h)
	ctx := context.Background()
	const projA, projB = "tenant-a", "tenant-b"

	body := map[string]any{
		"intent": "app A", "scenarios": []any{"s1"}, "selects": []any{"journey-a"},
	}
	if _, capA, err := s.captureProduct(ctx, nil, captureInput{
		Project: projA, Utterance: "app de A", Body: body, Meta: completeMeta(),
	}); err != nil || capA.Routing != "record" {
		t.Fatalf("capture A: %v routing=%v", err, capA.Routing)
	}

	// B sees NOTHING of A (RLS): B's graph is empty, product still enterable.
	_, stB, err := s.graphState(ctx, nil, stateInput{Project: projB})
	if err != nil {
		t.Fatalf("graph_state B: %v", err)
	}
	if stB.NodeRowCount != 0 {
		t.Fatalf("RLS BREACH: B sees %d of A's rows", stB.NodeRowCount)
	}
	if stB.EnterableLevel != "product" {
		t.Fatalf("B's enterable level = %q, want product (B is empty)", stB.EnterableLevel)
	}

	// A still sees its own row.
	_, stA, err := s.graphState(ctx, nil, stateInput{Project: projA})
	if err != nil {
		t.Fatalf("graph_state A: %v", err)
	}
	if stA.NodeRowCount != 1 {
		t.Fatalf("A lost its own row under RLS (count=%d)", stA.NodeRowCount)
	}
}
