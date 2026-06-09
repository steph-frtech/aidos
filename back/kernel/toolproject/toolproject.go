// Package toolproject implements FK15 part (a) (ROADMAP-fke, KRD FKE-20): the
// TOOLING PROJECTIONS — CLAUDE.md / AGENTS.md / .cursorrules / memory-bank EMITTED
// from the kernels (policy / memory / style / architecture / agent-profile), never
// hand-edited (hash-protected, drift detected by source-hash).
//
// THE CONCEPT (FKE-20 · projections d'outillage). The files an AI agent reads to
// know how to behave in this repo — CLAUDE.md, AGENTS.md, .cursorrules, the
// memory-bank — are NOT source of truth. They are DERIVED VIEWS, assembled from
// kernel sources (the same way Go structs / DDL / TS types are projected from the
// entity AST). The truth is the kernel sources:
//
//   - PolicySource       — a rule the agent must obey (the wall, anti-overwrite…).
//   - MemorySource       — a durable fact the agent must remember (a scar, a decision).
//   - StyleSource        — a coding/formatting convention (biome tabs, gofmt…).
//   - ArchitectureSource — an architecture invariant (subsystem boundaries, the line).
//   - AgentProfileSource — an agent persona/role declaration (model, effort, scope).
//
// A ToolingKernel bundles these sources; the EMITTERS (one per target file) render
// them DETERMINISTICALLY into the tooling files. Because the files are derived, they
// are HASH-PROTECTED: each emitted file carries the SHA-256 of the kernel sources it
// was projected from (its source-hash). A hand-edit changes the file bytes without
// changing the source-hash — DetectDrift catches it (the file no longer equals the
// projection of its declared sources). Re-emission from the SAME kernel sources
// yields BYTE-IDENTICAL files (the FK15 done-criterion).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Emission is a PURE TOTAL function of the
// kernel sources — no clock, no rng, no I/O, NO LLM. Sources are rendered in a
// declared, sorted order so the bytes are independent of caller map/slice order
// (same kernel ⇒ same files). The reproducibility mirror (rapid property test)
// pins: same kernels → byte-identical files, and DetectDrift ⇔ a hand-edit.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING to the truth-store. A
// ToolingKernel rides inside a content-addressed kernel.link body
// (link_kind:"tooling") — REUSING records.NewRecord, the SAME storage fork FK14
// (lexicon) decided: no new record kind, the seven KRDCore kinds stay closed. A
// changed source yields a NEW version, never an in-place mutation (KRD §12).
// Freezing/updating a ToolingKernel flows through idea → mirror → /goal → human
// approval (the aidos CLI writer role; the agent has no GRANT).
package toolproject

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

// SourceKind is one of the five CLOSED kernel-source kinds a ToolingKernel is
// assembled from (FKE-20). The set is closed: a source of any other kind is rejected.
type SourceKind string

const (
	// KindPolicy — a rule the agent must obey (renders as a "Policies" section).
	KindPolicy SourceKind = "policy"
	// KindMemory — a durable fact the agent must remember (renders to the memory-bank).
	KindMemory SourceKind = "memory"
	// KindStyle — a coding/formatting convention (renders as a "Style" section).
	KindStyle SourceKind = "style"
	// KindArchitecture — an architecture invariant (renders as an "Architecture" section).
	KindArchitecture SourceKind = "architecture"
	// KindAgentProfile — an agent persona/role (renders to AGENTS.md).
	KindAgentProfile SourceKind = "agent-profile"
)

// SourceKinds returns the five closed source kinds in canonical order. The emitters
// and the Workbench iterate this so the set is never invented per call.
func SourceKinds() []SourceKind {
	return []SourceKind{KindPolicy, KindMemory, KindStyle, KindArchitecture, KindAgentProfile}
}

// IsKnownKind reports whether k is one of the five closed source kinds.
func IsKnownKind(k SourceKind) bool {
	for _, kk := range SourceKinds() {
		if kk == k {
			return true
		}
	}
	return false
}

// Source is one kernel-source the tooling files are projected from. ID is a stable
// slug (the lexicon name of the rule/fact); Title is the human heading; Body is the
// rendered prose (français d'abord). Sources are the TRUTH; the files are the view.
type Source struct {
	Kind  SourceKind `json:"kind"`
	ID    string     `json:"id"`
	Title string     `json:"title"`
	Body  string     `json:"body"`
}

// ToolingKernel bundles the kernel sources the tooling files are emitted from. It is
// the SOURCE; CLAUDE.md / AGENTS.md / .cursorrules / memory-bank are its PROJECTIONS.
type ToolingKernel struct {
	// Project is the project name rendered in the file headers, e.g. "AIDOS".
	Project string   `json:"project"`
	Sources []Source `json:"sources"`
}

// Target is one of the CLOSED tooling files emitted from a ToolingKernel (FKE-20).
type Target string

const (
	// TargetClaudeMd — CLAUDE.md: the full agent contract (policies + style + architecture).
	TargetClaudeMd Target = "CLAUDE.md"
	// TargetAgentsMd — AGENTS.md: the agent personas/roles (agent-profile sources).
	TargetAgentsMd Target = "AGENTS.md"
	// TargetCursorRules — .cursorrules: a compact rule list (policies + style) for Cursor.
	TargetCursorRules Target = ".cursorrules"
	// TargetMemoryBank — memory-bank.md: the durable facts (memory sources).
	TargetMemoryBank Target = "memory-bank.md"
)

// Targets returns the four closed tooling targets in canonical order.
func Targets() []Target {
	return []Target{TargetClaudeMd, TargetAgentsMd, TargetCursorRules, TargetMemoryBank}
}

// Validation errors. Each maps 1:1 to a closed BlockReason code surfaced by the MCP
// + the Workbench.
var (
	// ErrNoProject — a kernel with no project name is rejected (a nameless tooling).
	ErrNoProject = errors.New("toolproject: empty project (NO_PROJECT)")
	// ErrUnknownKind — a source of a kind outside the five closed source kinds.
	ErrUnknownKind = errors.New("toolproject: source of an unknown kind (UNKNOWN_KIND)")
	// ErrEmptyID — a source with an empty id (an unnamed rule cannot be addressed).
	ErrEmptyID = errors.New("toolproject: source with an empty id (EMPTY_ID)")
	// ErrUnknownTarget — DetectDrift/Emit was asked for a target outside the four.
	ErrUnknownTarget = errors.New("toolproject: unknown target (UNKNOWN_TARGET)")
)

// Validate checks a ToolingKernel's shape (pure): a non-empty project, and every
// source has a known kind and a non-empty id. It does NOT require all kinds (a
// project may declare only policies, or only an agent profile). Writes nothing.
func Validate(k ToolingKernel) error {
	if strings.TrimSpace(k.Project) == "" {
		return ErrNoProject
	}
	for _, s := range k.Sources {
		if !IsKnownKind(s.Kind) {
			return fmt.Errorf("%w: %q", ErrUnknownKind, s.Kind)
		}
		if strings.TrimSpace(s.ID) == "" {
			return fmt.Errorf("%w: kind %q", ErrEmptyID, s.Kind)
		}
	}
	return nil
}

// sortedSourcesOfKind returns the sources of a given kind in a STABLE order (by ID),
// so the rendered bytes are independent of the caller's slice order.
func sortedSourcesOfKind(k ToolingKernel, kind SourceKind) []Source {
	out := make([]Source, 0)
	for _, s := range k.Sources {
		if s.Kind == kind {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// renderSection renders a titled list of sources as markdown bullets. Empty when the
// kind has no sources (so a target only carries the sections it has truth for).
func renderSection(b *strings.Builder, heading string, sources []Source) {
	if len(sources) == 0 {
		return
	}
	fmt.Fprintf(b, "\n## %s\n\n", heading)
	for _, s := range sources {
		fmt.Fprintf(b, "- **%s** (`%s`): %s\n", s.Title, s.ID, s.Body)
	}
}

// SourceHash is the SHA-256 hex digest of the kernel sources a target is projected
// from — the file's source-hash. It is computed over the CANONICAL serialization of
// the kernel (records.Canonicalize of the link body), so it is independent of caller
// map/slice order: the SAME logical kernel always yields the SAME source-hash. A
// hand-edit changes the FILE bytes but not the source-hash, so DetectDrift catches it.
func SourceHash(k ToolingKernel) (string, error) {
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

// emitBody renders the markdown BODY of a target (without the protection footer),
// from the kernel sources, deterministically. Each target reads exactly the source
// kinds it is the view of — no double-typing, no new truth.
func emitBody(k ToolingKernel, t Target) (string, error) {
	var b strings.Builder
	switch t {
	case TargetClaudeMd:
		fmt.Fprintf(&b, "# %s — Agent Contract\n", k.Project)
		fmt.Fprintf(&b, "\n> Generated from the kernel sources. Do not hand-edit (hash-protected, FK15).\n")
		renderSection(&b, "Policies", sortedSourcesOfKind(k, KindPolicy))
		renderSection(&b, "Architecture", sortedSourcesOfKind(k, KindArchitecture))
		renderSection(&b, "Style", sortedSourcesOfKind(k, KindStyle))
	case TargetAgentsMd:
		fmt.Fprintf(&b, "# %s — Agents\n", k.Project)
		fmt.Fprintf(&b, "\n> Generated from the kernel agent-profile sources. Do not hand-edit (FK15).\n")
		renderSection(&b, "Agent profiles", sortedSourcesOfKind(k, KindAgentProfile))
	case TargetCursorRules:
		fmt.Fprintf(&b, "# %s — Cursor rules\n", k.Project)
		fmt.Fprintf(&b, "\n> Generated from the kernel policy + style sources. Do not hand-edit (FK15).\n")
		renderSection(&b, "Rules", sortedSourcesOfKind(k, KindPolicy))
		renderSection(&b, "Style", sortedSourcesOfKind(k, KindStyle))
	case TargetMemoryBank:
		fmt.Fprintf(&b, "# %s — Memory bank\n", k.Project)
		fmt.Fprintf(&b, "\n> Generated from the kernel memory sources. Do not hand-edit (FK15).\n")
		renderSection(&b, "Durable facts", sortedSourcesOfKind(k, KindMemory))
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownTarget, t)
	}
	return b.String(), nil
}

// protectionFooter is the hash-protection marker appended to every emitted file. It
// records the source-hash so DetectDrift can verify the file is the projection of its
// declared sources (a hand-edit, or a stale file, no longer matches).
const protectionFooter = "\n<!-- AIDOS-TOOLING-SOURCE-HASH: %s — DO NOT EDIT; regenerate via /tool-project (FK15) -->\n"

// Emit renders ONE tooling file from the kernel sources, deterministically, with the
// hash-protection footer. Same kernel ⇒ byte-identical file (the FK15 done-criterion).
func Emit(k ToolingKernel, t Target) (string, error) {
	if err := Validate(k); err != nil {
		return "", err
	}
	body, err := emitBody(k, t)
	if err != nil {
		return "", err
	}
	h, err := SourceHash(k)
	if err != nil {
		return "", err
	}
	return body + fmt.Sprintf(protectionFooter, h), nil
}

// EmitAll renders ALL four tooling files from the kernel sources, keyed by target, in
// canonical order. Same kernel ⇒ byte-identical map (the property mirror's witness).
func EmitAll(k ToolingKernel) (map[Target]string, error) {
	if err := Validate(k); err != nil {
		return nil, err
	}
	out := make(map[Target]string, len(Targets()))
	for _, t := range Targets() {
		f, err := Emit(k, t)
		if err != nil {
			return nil, err
		}
		out[t] = f
	}
	return out, nil
}

// DriftKind is the closed reason an on-disk tooling file is out of projection.
type DriftKind string

const (
	// DriftHandEdited — the file bytes do not equal the projection of its declared
	// sources: a hand-edit (or a stale file). The FK15 fault-injection.
	DriftHandEdited DriftKind = "HAND_EDITED"
	// DriftMissingMarker — the file carries no AIDOS source-hash marker (not a
	// recognised projection at all).
	DriftMissingMarker DriftKind = "MISSING_MARKER"
	// DriftStaleHash — the file carries a marker whose hash differs from the current
	// kernel's source-hash: the sources changed but the file was not re-emitted.
	DriftStaleHash DriftKind = "STALE_HASH"
)

// Drift is one out-of-projection tooling file: the target, the closed reason, and the
// expected (current) source-hash. Empty slice ⇔ the file is the exact projection.
type Drift struct {
	Target   Target    `json:"target"`
	Kind     DriftKind `json:"kind"`
	Expected string    `json:"expected,omitempty"`
}

const markerPrefix = "<!-- AIDOS-TOOLING-SOURCE-HASH: "

// markerHash extracts the source-hash recorded in a file's protection marker. ok is
// false when the file carries no AIDOS marker (DriftMissingMarker).
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

// DetectDrift is the PURE hash-protection check (the FK15 done-criterion "hand-edit
// détecté"). Given the kernel and the on-disk content of a target, it reports:
//
//   - nil           — the file equals the exact projection of the kernel (no drift).
//   - MISSING_MARKER — the file carries no AIDOS source-hash marker.
//   - STALE_HASH     — the marker's hash differs from the kernel's current source-hash
//     (sources changed, file not re-emitted).
//   - HAND_EDITED    — the marker matches the current source-hash, yet the file bytes
//     differ from Emit(kernel, target): the body was edited by hand under a valid hash.
//
// It is a TOTAL function of (kernel, target, onDisk) — no clock, no I/O, NO LLM: a
// byte comparison and a string-equality on hashes.
func DetectDrift(k ToolingKernel, t Target, onDisk string) (*Drift, error) {
	want, err := Emit(k, t)
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
		return &Drift{Target: t, Kind: DriftMissingMarker, Expected: cur}, nil
	}
	if mh != cur {
		return &Drift{Target: t, Kind: DriftStaleHash, Expected: cur}, nil
	}
	// Marker hash matches the current source-hash, yet bytes differ ⇒ the body was
	// hand-edited under a valid hash (the file lies about being a clean projection).
	return &Drift{Target: t, Kind: DriftHandEdited, Expected: cur}, nil
}

// SerializeBody renders the content-addressed kernel.link body carrying the
// ToolingKernel — the SAME storage fork FK14 (lexicon) decided: a tooling source
// rides inside a kernel.link body (link_kind:"tooling"), NOT a new record kind.
// NewRecord(KindLink, body) yields id == version == Hash(Canonicalize(body)): a
// changed source yields a DIFFERENT version (a new tooling, never an in-place
// mutation, KRD §12). Sources are emitted in a STABLE order (kind canonical order,
// then ID) so the address is independent of the caller's slice order.
func SerializeBody(k ToolingKernel) ([]byte, error) {
	if err := Validate(k); err != nil {
		return nil, err
	}
	type src struct {
		Kind  SourceKind `json:"kind"`
		ID    string     `json:"id"`
		Title string     `json:"title"`
		Body  string     `json:"body"`
	}
	srcs := make([]src, 0, len(k.Sources))
	for _, kind := range SourceKinds() {
		for _, s := range sortedSourcesOfKind(k, kind) {
			srcs = append(srcs, src{Kind: s.Kind, ID: s.ID, Title: s.Title, Body: s.Body})
		}
	}
	body := map[string]any{
		"kind":      string(records.KindLink),
		"link_kind": "tooling",
		"project":   k.Project,
		"sources":   srcs,
	}
	return json.Marshal(body)
}

// ParseBody is the inverse of SerializeBody: it recovers a ToolingKernel from a
// kernel.link body (the round-trip half). It errors if the body is not a tooling link.
func ParseBody(body []byte) (ToolingKernel, error) {
	var probe struct {
		Kind     string `json:"kind"`
		LinkKind string `json:"link_kind"`
		Project  string `json:"project"`
		Sources  []struct {
			Kind  SourceKind `json:"kind"`
			ID    string     `json:"id"`
			Title string     `json:"title"`
			Body  string     `json:"body"`
		} `json:"sources"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return ToolingKernel{}, fmt.Errorf("toolproject: invalid link body: %w", err)
	}
	if probe.Kind != string(records.KindLink) {
		return ToolingKernel{}, fmt.Errorf("toolproject: body kind %q is not a kernel.link", probe.Kind)
	}
	if probe.LinkKind != "tooling" {
		return ToolingKernel{}, fmt.Errorf("toolproject: body link_kind %q is not tooling", probe.LinkKind)
	}
	srcs := make([]Source, 0, len(probe.Sources))
	for _, s := range probe.Sources {
		srcs = append(srcs, Source{Kind: s.Kind, ID: s.ID, Title: s.Title, Body: s.Body})
	}
	return ToolingKernel{Project: probe.Project, Sources: srcs}, nil
}

// Record builds the content-addressed kernel.link Record for a ToolingKernel (the
// materialized, replayable tooling source). It REUSES records.NewRecord — the same
// content-address path as every other kernel record, so id == version ==
// Hash(Canonicalize(body)). Writes nothing (the wall): the caller hands this Record
// to the aidos CLI writer role via a ChangeSet, never the agent.
func Record(k ToolingKernel) (records.Record, error) {
	body, err := SerializeBody(k)
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindLink, body)
}
