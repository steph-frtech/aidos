// Package techspec implements FK15 part (b) (ROADMAP-fke FK15, KRD FKE-20.1): the TWO
// ASSEMBLED PROJECTIONS per kernel — the Fiche de Spécification Technique and the Suite
// de Tests Techniques — generated, content-addressed, byte-stable, NEVER hand-edited,
// NEVER the truth (assembled VIEWS, zero double-typing).
//
// THE CONCEPT (FKE-20.1 · « DEUX PROJECTIONS, pas deux lignes »). The functional↔technical
// split adds NO row to the 6-pair skeleton: it is already carried by the waterline (lower
// half = technical) and the facets (S/B/R/V/M = the non-functional specs). So a "technical
// specification" is not a slot; it is a VIEW that assembles declarations that already
// exist. Rendering it "à chaque fois" = two deterministic projections per kernel:
//
//   - Fiche de Spécification Technique = Contrat (F5↑) + Modèle (F4↑) + the OSI stack
//     (if networked) + the facet specs S1/B1/R1/V1/M1 + the linked ADRs.
//   - Suite de Tests Techniques = unit/integration (N4) + infra (N5) + per-OSI-layer
//     tests (interface-contract, allowlist, auth, schema) + facet tests (S3/B3/R3/M3) —
//     distinct from the business acceptance scenarios (N0).
//
// Two axes range the assembly: the OSI communication stack (L7 application · L6
// presentation · L5 session · L4 transport — for NETWORKED kernels only; a pure function
// has NO OSI layer) and the quality facets (S/B/R/V/M, orthogonal to OSI).
//
// ZERO NEW TRUTH (the load-bearing FK15 done-criterion « la fiche technique assemble
// exactement les déclarations techniques existantes »). The assembler is a PURE
// PROJECTION: every element it renders is an input declaration carried VERBATIM; it
// fabricates NOTHING. AssembledRefs returns the exact multiset of source declaration
// refs the projection assembled, and Assemble guarantees it equals the input's declared
// refs — a projection that named an element absent from the input would be a monster
// (a truth the kernel never declared). The mirror pins refsOut ⊆ refsIn ∧ refsIn ⊆
// refsOut (set equality): no loss, no fabrication.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8, the done-criterion « mêmes kernels → mêmes
// fichiers byte-identiques »). Assemble is a PURE TOTAL function of the TechKernel — no
// clock, no rng, no map iteration leaking into output, NO LLM. Each section is built into
// a STABLE sorted order (OSI layer order, facet canonical order, then ref id) so the
// bytes are independent of caller slice order. The reproducibility mirror
// (techspec_property_test.go, rapid) pins: same kernel → byte-identical files AND
// invariant under input ordering, plus the zero-new-truth set-equality.
//
// THE WALL (CLAUDE.md §2). This package READS already-declared technical elements and
// writes NOTHING to the truth-store. The two projections ride below the waterline
// (regenerable, content-addressed, hash-protected). Like FK15 part (a) and FK14
// (lexicon), an assembled spec rides inside a content-addressed kernel.link body
// (link_kind:"techspec") — REUSING records.NewRecord, the seven KRDCore kinds stay
// closed. A changed source yields a NEW version (KRD §12); freezing flows through
// idea → mirror → /goal → human approval (the agent has no GRANT).
//
// REUSE, DON'T REINVENT (ADR 0007). Canonical JSON + hash reuse kernel/records (parity
// with the truth-store); the hash-protection footer mirrors FK15 part (a) (toolproject).
// Only the kernel→two-projection assembly (the OSI/facet ranging) is ours.
package techspec

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// OSILayer is one of the four CLOSED communication-stack layers a NETWORKED kernel
// declares (FKE-20.1). L1-L3 are infra-provisioned (not kernel-specified). A pure
// function declares no OSI layer at all.
type OSILayer string

const (
	// OSIApplication (L7) — the API schema / MCP tool schema / the protocol.
	OSIApplication OSILayer = "L7-application"
	// OSIPresentation (L6) — serialization/encoding, redaction, field-allowlist.
	OSIPresentation OSILayer = "L6-presentation"
	// OSISession (L5) — auth / OAuth / capability lease.
	OSISession OSILayer = "L5-session"
	// OSITransport (L4) — HTTP/gRPC; MCP transports stdio/http/sse/streamable.
	OSITransport OSILayer = "L4-transport"
)

// osiOrder is the canonical top-down OSI ordering (L7→L4) the Fiche ranges by. A layer
// outside this set is rejected (ErrUnknownOSILayer).
var osiOrder = []OSILayer{OSIApplication, OSIPresentation, OSISession, OSITransport}

// osiRank maps each layer to its position so sections sort deterministically.
var osiRank = func() map[OSILayer]int {
	m := make(map[OSILayer]int, len(osiOrder))
	for i, l := range osiOrder {
		m[l] = i
	}
	return m
}()

// OSILayers returns the four closed OSI layers in canonical (L7→L4) order.
func OSILayers() []OSILayer { return append([]OSILayer(nil), osiOrder...) }

// isKnownOSILayer reports whether l is one of the four closed OSI layers.
func isKnownOSILayer(l OSILayer) bool {
	_, ok := osiRank[l]
	return ok
}

// SpecFacet is one of the FIVE technical (non-functional) quality facets a Fiche
// assembles specs for: S/B/R/V/M (FKE-20.1). F (functional) lives above the waterline,
// X (experience) is soft (§13.6) — neither is a technical-spec facet.
type SpecFacet string

const (
	// FacetSecurity (S) — sûr: security specs (S1) + security tests (S3).
	FacetSecurity SpecFacet = "S"
	// FacetBudgets (B) — viable: performance/cost budget specs (B1) + perf tests (B3).
	FacetBudgets SpecFacet = "B"
	// FacetReliability (R) — résilient: reliability specs (R1) + chaos tests (R3).
	FacetReliability SpecFacet = "R"
	// FacetEvolvability (V) — durable: evolvability/migration specs (V1).
	FacetEvolvability SpecFacet = "V"
	// FacetMaintainability (M) — sain: architecture specs (M1) + arch tests (M3).
	FacetMaintainability SpecFacet = "M"
)

// specFacetOrder is the canonical order the Fiche/Suite range facet specs by.
var specFacetOrder = []SpecFacet{FacetSecurity, FacetBudgets, FacetReliability, FacetEvolvability, FacetMaintainability}

var specFacetRank = func() map[SpecFacet]int {
	m := make(map[SpecFacet]int, len(specFacetOrder))
	for i, f := range specFacetOrder {
		m[f] = i
	}
	return m
}()

// specFacetLabel renders the bilingual heading (français d'abord) for a facet.
var specFacetLabel = map[SpecFacet]string{
	FacetSecurity:        "Sécurité (S)",
	FacetBudgets:         "Budgets / Performance (B)",
	FacetReliability:     "Fiabilité / Résilience (R)",
	FacetEvolvability:    "Évolutivité / Migration (V)",
	FacetMaintainability: "Maintenabilité & Architecture (M)",
}

// SpecFacets returns the five technical facets in canonical order.
func SpecFacets() []SpecFacet { return append([]SpecFacet(nil), specFacetOrder...) }

func isKnownSpecFacet(f SpecFacet) bool {
	_, ok := specFacetRank[f]
	return ok
}

// TestKind is one of the CLOSED technical-test kinds the Suite assembles (FKE-20.1).
type TestKind string

const (
	// TestUnit (N4) — unit/code tests.
	TestUnit TestKind = "N4-unit"
	// TestIntegration (N4) — integration tests.
	TestIntegration TestKind = "N4-integration"
	// TestInfra (N5) — infra/adapter tests (Pact provider, Testcontainers).
	TestInfra TestKind = "N5-infra"
	// TestSecurity (S3) — security tests (scans, injection evals).
	TestSecurity TestKind = "S3-security"
	// TestPerf (B3) — performance/budget tests (k6).
	TestPerf TestKind = "B3-perf"
	// TestChaos (R3) — chaos/resilience tests (fault injection).
	TestChaos TestKind = "R3-chaos"
	// TestArch (M3) — architecture-fitness tests (go-arch-lint/depguard).
	TestArch TestKind = "M3-arch"
)

var testKindOrder = []TestKind{TestUnit, TestIntegration, TestInfra, TestSecurity, TestPerf, TestChaos, TestArch}

var testKindRank = func() map[TestKind]int {
	m := make(map[TestKind]int, len(testKindOrder))
	for i, t := range testKindOrder {
		m[t] = i
	}
	return m
}()

// testKindLabel renders the bilingual heading (français d'abord) for a test kind.
var testKindLabel = map[TestKind]string{
	TestUnit:        "Tests unitaires (N4)",
	TestIntegration: "Tests d'intégration (N4)",
	TestInfra:       "Tests d'infra (N5)",
	TestSecurity:    "Tests de sécurité (S3)",
	TestPerf:        "Tests de performance (B3)",
	TestChaos:       "Tests de chaos / résilience (R3)",
	TestArch:        "Tests d'architecture (M3)",
}

// TestKinds returns the seven closed test kinds in canonical order.
func TestKinds() []TestKind { return append([]TestKind(nil), testKindOrder...) }

func isKnownTestKind(t TestKind) bool {
	_, ok := testKindRank[t]
	return ok
}

// Decl is one ALREADY-DECLARED technical element the projection assembles VERBATIM. It is
// a pure reference into the kernel: Ref is the stable declaration id (its lexicon name),
// Title the human heading, Body the rendered prose (français d'abord). The assembler
// NEVER invents a Decl — it only ranges the input ones (zero new truth).
type Decl struct {
	// Ref is the stable declaration id (e.g. "contract:CheckoutAPI", "adr:0010",
	// "facet:S1:input-allowlist"). The unit of the zero-new-truth set-equality.
	Ref   string `json:"ref"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

// FacetSpec bundles a technical facet (S/B/R/V/M) with its already-declared specs (S1…)
// and its already-declared tests (S3…). Both are assembled VERBATIM into the two views.
type FacetSpec struct {
	Facet SpecFacet `json:"facet"`
	// Specs are the facet's declared specs (S1/B1/R1/V1/M1) — rendered in the Fiche.
	Specs []Decl `json:"specs"`
	// Tests are the facet's declared tests (S3/B3/R3/M3) — rendered in the Suite.
	Tests []Decl `json:"tests"`
}

// OSISpec bundles one OSI layer with its already-declared specs and per-layer tests
// (interface-contract, allowlist, auth, schema). Present only for NETWORKED kernels.
type OSISpec struct {
	Layer OSILayer `json:"layer"`
	Specs []Decl   `json:"specs"`
	Tests []Decl   `json:"tests"`
}

// TestGroup bundles one technical-test kind (N4/N5) with its already-declared tests.
// The facet/OSI tests live on FacetSpec/OSISpec; TestGroups carry the N4/N5 ones.
type TestGroup struct {
	Kind  TestKind `json:"kind"`
	Tests []Decl   `json:"tests"`
}

// TechKernel is the input bundle the two projections are assembled FROM. Every field is
// an ALREADY-DECLARED technical element (Contrat, Modèle, facet specs, ADRs, tests). The
// assembler reads it READ-ONLY and projects it; it declares nothing new.
type TechKernel struct {
	// KernelID identifies the cell (carried into both projections + their address).
	KernelID string `json:"kernel_id"`
	// Networked declares whether the kernel is a communication boundary (API/MCP/
	// connector). A pure function (false) has NO OSI section (FKE-20.1).
	Networked bool `json:"networked"`
	// Contract is the F5↑ interface declaration (the Contrat). Empty Ref ⇒ absent.
	Contract Decl `json:"contract"`
	// Model is the F4↑ data declaration (the Modèle). Empty Ref ⇒ absent.
	Model Decl `json:"model"`
	// OSI are the per-layer declarations — assembled only when Networked.
	OSI []OSISpec `json:"osi,omitempty"`
	// Facets are the technical facet (S/B/R/V/M) spec+test declarations.
	Facets []FacetSpec `json:"facets,omitempty"`
	// ADRs are the linked architecture-decision declarations.
	ADRs []Decl `json:"adrs,omitempty"`
	// TestGroups are the N4/N5 technical-test declarations.
	TestGroups []TestGroup `json:"test_groups,omitempty"`
}

// Projection is one of the two CLOSED assembled views (FKE-20.1).
type Projection string

const (
	// ProjFiche — the Fiche de Spécification Technique.
	ProjFiche Projection = "fiche-specification-technique"
	// ProjSuite — the Suite de Tests Techniques.
	ProjSuite Projection = "suite-tests-techniques"
)

// Projections returns the two closed projections in canonical order.
func Projections() []Projection { return []Projection{ProjFiche, ProjSuite} }

// Assembly errors. Each maps 1:1 to a closed BlockReason code surfaced by the MCP + the
// Workbench.
var (
	// ErrNoKernelID — a kernel with no id is rejected (a nameless projection).
	ErrNoKernelID = errors.New("techspec: empty kernel_id (NO_KERNEL_ID)")
	// ErrUnknownOSILayer — an OSI spec for a layer outside the four closed layers.
	ErrUnknownOSILayer = errors.New("techspec: unknown OSI layer (UNKNOWN_OSI_LAYER)")
	// ErrUnknownFacet — a facet spec for a facet outside S/B/R/V/M.
	ErrUnknownFacet = errors.New("techspec: unknown spec facet (UNKNOWN_FACET)")
	// ErrUnknownTestKind — a test group of a kind outside the seven closed kinds.
	ErrUnknownTestKind = errors.New("techspec: unknown test kind (UNKNOWN_TEST_KIND)")
	// ErrEmptyRef — a declaration with an empty ref (an unnamed element cannot be assembled).
	ErrEmptyRef = errors.New("techspec: declaration with an empty ref (EMPTY_REF)")
	// ErrOSIOnPureFunction — OSI specs declared on a non-networked kernel (a pure function
	// has no OSI layer, FKE-20.1).
	ErrOSIOnPureFunction = errors.New("techspec: OSI specs on a non-networked kernel (OSI_ON_PURE_FUNCTION)")
	// ErrUnknownProjection — Assemble was asked for a projection outside the two.
	ErrUnknownProjection = errors.New("techspec: unknown projection (UNKNOWN_PROJECTION)")
)

// Validate checks a TechKernel's shape (pure): a non-empty id, every OSI layer / facet /
// test kind is known, every declaration has a non-empty ref, and OSI specs appear only
// on a networked kernel. It does NOT require all sections (a kernel may be a pure
// function with only a Model + a unit test). Writes nothing.
func Validate(k TechKernel) error {
	if strings.TrimSpace(k.KernelID) == "" {
		return ErrNoKernelID
	}
	if !k.Networked && len(k.OSI) > 0 {
		return ErrOSIOnPureFunction
	}
	checkDecls := func(ds []Decl) error {
		for _, d := range ds {
			if strings.TrimSpace(d.Ref) == "" {
				return ErrEmptyRef
			}
		}
		return nil
	}
	if k.Contract.Ref != "" || k.Contract.Title != "" || k.Contract.Body != "" {
		if strings.TrimSpace(k.Contract.Ref) == "" {
			return fmt.Errorf("%w: contract", ErrEmptyRef)
		}
	}
	if k.Model.Ref != "" || k.Model.Title != "" || k.Model.Body != "" {
		if strings.TrimSpace(k.Model.Ref) == "" {
			return fmt.Errorf("%w: model", ErrEmptyRef)
		}
	}
	for _, o := range k.OSI {
		if !isKnownOSILayer(o.Layer) {
			return fmt.Errorf("%w: %q", ErrUnknownOSILayer, o.Layer)
		}
		if err := checkDecls(o.Specs); err != nil {
			return err
		}
		if err := checkDecls(o.Tests); err != nil {
			return err
		}
	}
	for _, f := range k.Facets {
		if !isKnownSpecFacet(f.Facet) {
			return fmt.Errorf("%w: %q", ErrUnknownFacet, f.Facet)
		}
		if err := checkDecls(f.Specs); err != nil {
			return err
		}
		if err := checkDecls(f.Tests); err != nil {
			return err
		}
	}
	if err := checkDecls(k.ADRs); err != nil {
		return err
	}
	for _, g := range k.TestGroups {
		if !isKnownTestKind(g.Kind) {
			return fmt.Errorf("%w: %q", ErrUnknownTestKind, g.Kind)
		}
		if err := checkDecls(g.Tests); err != nil {
			return err
		}
	}
	return nil
}

// declLess is the TOTAL order over declarations: by Ref, then Title, then Body. Sorting
// by Ref ALONE is not order-independent when two decls collide on Ref with differing
// bodies (sort.SliceStable would keep the caller's order, leaking it into the bytes). The
// full triple makes the order total, so the rendered bytes are independent of caller order.
func declLess(a, b Decl) bool {
	if a.Ref != b.Ref {
		return a.Ref < b.Ref
	}
	if a.Title != b.Title {
		return a.Title < b.Title
	}
	return a.Body < b.Body
}

// sortedDecls returns a copy of decls in the TOTAL declLess order, so the rendered bytes
// are independent of the caller's slice order even under Ref collisions.
func sortedDecls(ds []Decl) []Decl {
	out := append([]Decl(nil), ds...)
	sort.SliceStable(out, func(i, j int) bool { return declLess(out[i], out[j]) })
	return out
}

// sortedOSI returns the OSI specs in canonical layer order (L7→L4).
func sortedOSI(os []OSISpec) []OSISpec {
	out := append([]OSISpec(nil), os...)
	sort.SliceStable(out, func(i, j int) bool { return osiRank[out[i].Layer] < osiRank[out[j].Layer] })
	return out
}

// sortedFacets returns the facet specs in canonical facet order (S/B/R/V/M).
func sortedFacets(fs []FacetSpec) []FacetSpec {
	out := append([]FacetSpec(nil), fs...)
	sort.SliceStable(out, func(i, j int) bool { return specFacetRank[out[i].Facet] < specFacetRank[out[j].Facet] })
	return out
}

// sortedGroups returns the test groups in canonical kind order (N4→M3).
func sortedGroups(gs []TestGroup) []TestGroup {
	out := append([]TestGroup(nil), gs...)
	sort.SliceStable(out, func(i, j int) bool { return testKindRank[out[i].Kind] < testKindRank[out[j].Kind] })
	return out
}

// renderDecls renders a titled list of declarations as markdown bullets. No-op when empty
// (a section appears only when the kernel declares truth for it).
func renderDecls(b *strings.Builder, heading string, ds []Decl) {
	ds = sortedDecls(ds)
	if len(ds) == 0 {
		return
	}
	fmt.Fprintf(b, "\n### %s\n\n", heading)
	for _, d := range ds {
		fmt.Fprintf(b, "- **%s** (`%s`): %s\n", d.Title, d.Ref, d.Body)
	}
}

// SourceHash is the SHA-256 hex digest of the TechKernel a projection is assembled from —
// the projection's source-hash. Computed over the CANONICAL serialization (records.
// Canonicalize of the link body), so it is independent of caller slice order: the SAME
// logical kernel always yields the SAME source-hash. A hand-edit changes the FILE bytes
// but not the source-hash, so DetectDrift catches it.
func SourceHash(k TechKernel) (string, error) {
	body, err := SerializeBody(k)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canon)
	return hex.EncodeToString(sum[:]), nil
}

// assembleBody renders the markdown BODY of a projection (without the protection footer)
// from the kernel's already-declared elements, deterministically and ranged by axis.
func assembleBody(k TechKernel, p Projection) (string, error) {
	var b strings.Builder
	switch p {
	case ProjFiche:
		fmt.Fprintf(&b, "# Fiche de Spécification Technique — %s\n", k.KernelID)
		fmt.Fprintf(&b, "\n> Projection assemblée depuis le kernel (FKE-20.1). Zéro nouvelle vérité ; ne pas hand-éditer (hash-protégée, FK15).\n")
		if k.Contract.Ref != "" {
			renderDecls(&b, "Contrat (F5)", []Decl{k.Contract})
		}
		if k.Model.Ref != "" {
			renderDecls(&b, "Modèle (F4)", []Decl{k.Model})
		}
		if k.Networked {
			fmt.Fprintf(&b, "\n## Pile de communication (OSI)\n")
			for _, o := range sortedOSI(k.OSI) {
				renderDecls(&b, "Couche "+string(o.Layer), o.Specs)
			}
		}
		fmt.Fprintf(&b, "\n## Specs des facettes (qualité)\n")
		for _, f := range sortedFacets(k.Facets) {
			renderDecls(&b, specFacetLabel[f.Facet], f.Specs)
		}
		renderDecls(&b, "ADR liés", k.ADRs)
	case ProjSuite:
		fmt.Fprintf(&b, "# Suite de Tests Techniques — %s\n", k.KernelID)
		fmt.Fprintf(&b, "\n> Projection assemblée depuis le kernel (FKE-20.1). Distincte des scénarios d'acceptance métier (N0). Ne pas hand-éditer (hash-protégée, FK15).\n")
		fmt.Fprintf(&b, "\n## Tests unitaires / intégration / infra (N4/N5)\n")
		for _, g := range sortedGroups(k.TestGroups) {
			renderDecls(&b, testKindLabel[g.Kind], g.Tests)
		}
		if k.Networked {
			fmt.Fprintf(&b, "\n## Tests par couche OSI\n")
			for _, o := range sortedOSI(k.OSI) {
				renderDecls(&b, "Couche "+string(o.Layer), o.Tests)
			}
		}
		fmt.Fprintf(&b, "\n## Tests des facettes (sécu/perf/chaos/arch)\n")
		for _, f := range sortedFacets(k.Facets) {
			renderDecls(&b, specFacetLabel[f.Facet], f.Tests)
		}
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownProjection, p)
	}
	return b.String(), nil
}

// protectionFooter is the hash-protection marker appended to every assembled projection.
const protectionFooter = "\n<!-- AIDOS-TECHSPEC-SOURCE-HASH: %s — DO NOT EDIT; regenerate via /tech-spec (FK15) -->\n"

const markerPrefix = "<!-- AIDOS-TECHSPEC-SOURCE-HASH: "

// Assemble renders ONE projection from the kernel's already-declared elements,
// deterministically, with the hash-protection footer. Same kernel ⇒ byte-identical file
// (the FK15 done-criterion). Validates first (zero-new-truth precondition: a malformed or
// fabricated declaration is rejected, never silently rendered).
func Assemble(k TechKernel, p Projection) (string, error) {
	if err := Validate(k); err != nil {
		return "", err
	}
	body, err := assembleBody(k, p)
	if err != nil {
		return "", err
	}
	h, err := SourceHash(k)
	if err != nil {
		return "", err
	}
	return body + fmt.Sprintf(protectionFooter, h), nil
}

// AssembleAll renders BOTH projections from the kernel, keyed by projection, in canonical
// order. Same kernel ⇒ byte-identical map (the property mirror's witness).
func AssembleAll(k TechKernel) (map[Projection]string, error) {
	if err := Validate(k); err != nil {
		return nil, err
	}
	out := make(map[Projection]string, len(Projections()))
	for _, p := range Projections() {
		f, err := Assemble(k, p)
		if err != nil {
			return nil, err
		}
		out[p] = f
	}
	return out, nil
}

// DeclaredRefs returns the SORTED set of every declaration ref the kernel declares (the
// Contrat, the Modèle, every OSI/facet spec+test, the ADRs, the N4/N5 tests). This is the
// "existing truth" the projections may assemble — and NOTHING beyond it.
func DeclaredRefs(k TechKernel) []string {
	s := newSet()
	if k.Contract.Ref != "" {
		s.add(k.Contract.Ref)
	}
	if k.Model.Ref != "" {
		s.add(k.Model.Ref)
	}
	for _, o := range k.OSI {
		for _, d := range o.Specs {
			s.add(d.Ref)
		}
		for _, d := range o.Tests {
			s.add(d.Ref)
		}
	}
	for _, f := range k.Facets {
		for _, d := range f.Specs {
			s.add(d.Ref)
		}
		for _, d := range f.Tests {
			s.add(d.Ref)
		}
	}
	for _, d := range k.ADRs {
		s.add(d.Ref)
	}
	for _, g := range k.TestGroups {
		for _, d := range g.Tests {
			s.add(d.Ref)
		}
	}
	return s.sorted()
}

// AssembledRefs returns the SORTED set of declaration refs that ACTUALLY APPEAR in the
// rendered projection bytes (extracted from the rendered `(`ref`)` markers). The
// zero-new-truth property is AssembledRefs(across both projections) == DeclaredRefs(k):
// every assembled ref traces to an input declaration (no fabrication), and every declared
// ref is assembled (no loss). This is computed FROM the rendered output — not re-derived
// from the input — so it genuinely witnesses the bytes.
func AssembledRefs(k TechKernel) ([]string, error) {
	s := newSet()
	for _, p := range Projections() {
		body, err := assembleBody(k, p)
		if err != nil {
			return nil, err
		}
		for _, ref := range extractRefs(body) {
			s.add(ref)
		}
	}
	return s.sorted(), nil
}

// extractRefs pulls every "(`ref`)" token from rendered markdown (the form renderDecls
// emits). A pure parse — no LLM.
func extractRefs(body string) []string {
	out := make([]string, 0)
	rest := body
	for {
		i := strings.Index(rest, "(`")
		if i < 0 {
			break
		}
		rest = rest[i+2:]
		j := strings.Index(rest, "`)")
		if j < 0 {
			break
		}
		out = append(out, rest[:j])
		rest = rest[j+2:]
	}
	return out
}

// DriftKind is the closed reason an on-disk projection is out of assembly.
type DriftKind string

const (
	// DriftHandEdited — the file bytes do not equal the assembly of its declared kernel.
	DriftHandEdited DriftKind = "HAND_EDITED"
	// DriftMissingMarker — the file carries no AIDOS source-hash marker.
	DriftMissingMarker DriftKind = "MISSING_MARKER"
	// DriftStaleHash — the marker's hash differs from the kernel's current source-hash.
	DriftStaleHash DriftKind = "STALE_HASH"
)

// Drift is one out-of-assembly projection: the projection, the closed reason, the
// expected (current) source-hash. Nil ⇔ the file is the exact assembly.
type Drift struct {
	Projection Projection `json:"projection"`
	Kind       DriftKind  `json:"kind"`
	Expected   string     `json:"expected,omitempty"`
}

// markerHash extracts the source-hash recorded in a file's protection marker.
func markerHash(file string) (hash string, ok bool) {
	i := strings.LastIndex(file, markerPrefix)
	if i < 0 {
		return "", false
	}
	rest := file[i+len(markerPrefix):]
	end := strings.IndexAny(rest, " \n")
	if end < 0 {
		return "", false
	}
	return rest[:end], true
}

// DetectDrift is the PURE hash-protection check (the FK15 done-criterion « un hand-edit
// détecté »). Given the kernel and the on-disk content of a projection, it reports nil
// (exact assembly), MISSING_MARKER, STALE_HASH, or HAND_EDITED — a byte comparison and a
// string-equality on hashes, no LLM.
func DetectDrift(k TechKernel, p Projection, onDisk string) (*Drift, error) {
	want, err := Assemble(k, p)
	if err != nil {
		return nil, err
	}
	if onDisk == want {
		return nil, nil
	}
	cur, err := SourceHash(k)
	if err != nil {
		return nil, err
	}
	mh, ok := markerHash(onDisk)
	if !ok {
		return &Drift{Projection: p, Kind: DriftMissingMarker, Expected: cur}, nil
	}
	if mh != cur {
		return &Drift{Projection: p, Kind: DriftStaleHash, Expected: cur}, nil
	}
	return &Drift{Projection: p, Kind: DriftHandEdited, Expected: cur}, nil
}

// SerializeBody renders the content-addressed kernel.link body carrying the TechKernel —
// the SAME storage fork FK14 (lexicon) + FK15 part (a) decided: a techspec rides inside a
// kernel.link body (link_kind:"techspec"), NOT a new record kind. NewRecord(KindLink,
// body) yields id == version == Hash(Canonicalize(body)). All declaration lists are
// emitted in a STABLE order so the address is independent of caller slice order.
func SerializeBody(k TechKernel) ([]byte, error) {
	if err := Validate(k); err != nil {
		return nil, err
	}
	osi := sortedOSI(k.OSI)
	for i := range osi {
		osi[i].Specs = sortedDecls(osi[i].Specs)
		osi[i].Tests = sortedDecls(osi[i].Tests)
	}
	facets := sortedFacets(k.Facets)
	for i := range facets {
		facets[i].Specs = sortedDecls(facets[i].Specs)
		facets[i].Tests = sortedDecls(facets[i].Tests)
	}
	groups := sortedGroups(k.TestGroups)
	for i := range groups {
		groups[i].Tests = sortedDecls(groups[i].Tests)
	}
	body := map[string]any{
		"kind":        string(records.KindLink),
		"link_kind":   "techspec",
		"kernel_id":   k.KernelID,
		"networked":   k.Networked,
		"contract":    k.Contract,
		"model":       k.Model,
		"osi":         osi,
		"facets":      facets,
		"adrs":        sortedDecls(k.ADRs),
		"test_groups": groups,
	}
	return json.Marshal(body)
}

// ParseBody is the inverse of SerializeBody: it recovers a TechKernel from a kernel.link
// body (the round-trip half). It errors if the body is not a techspec link.
func ParseBody(body []byte) (TechKernel, error) {
	var probe struct {
		Kind     string `json:"kind"`
		LinkKind string `json:"link_kind"`
		TechKernel
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return TechKernel{}, fmt.Errorf("techspec: invalid link body: %w", err)
	}
	if probe.Kind != string(records.KindLink) {
		return TechKernel{}, fmt.Errorf("techspec: body kind %q is not a kernel.link", probe.Kind)
	}
	if probe.LinkKind != "techspec" {
		return TechKernel{}, fmt.Errorf("techspec: body link_kind %q is not techspec", probe.LinkKind)
	}
	return probe.TechKernel, nil
}

// Record builds the content-addressed kernel.link Record for a TechKernel (the
// materialized, replayable techspec source). It REUSES records.NewRecord — id == version
// == Hash(Canonicalize(body)). Writes nothing (the wall): the caller hands this Record to
// the aidos CLI writer role via a ChangeSet, never the agent.
func Record(k TechKernel) (records.Record, error) {
	body, err := SerializeBody(k)
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindLink, body)
}

// set is a small string set with a sorted accessor — the canonicalizing primitive that
// makes every section order-invariant.
type set map[string]struct{}

func newSet() set { return set{} }

func (s set) add(v string) { s[v] = struct{}{} }

func (s set) sorted() []string {
	out := make([]string, 0, len(s))
	for v := range s {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}
