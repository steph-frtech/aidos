package main

// export.go — `aidospulumi export` : l'ARBRE du projet (le « génome ») → UN artefact portable,
// content-adressé, déterministe.
//
// Intention (utilisatrice, 2026-06-14) : « on peut faire un EXPORT de tout le projet et le REFONDER
// avec une sorte de COMPILATEUR ». Le projet = son ARBRE content-adressé ; le code (gen/) est une
// projection RÉGÉNÉRABLE ; le compilateur (les émetteurs existants : appdata.EmitProjectData,
// honoemit.EmitServerScaffold/EmitWebApp/EmitMasterView/EmitPulumiStackHono) le reproduit BYTE-IDENTIQUE.
// La re-émission byte-stable est DÉJÀ prouvée (materialise → zéro diff git). Ce fichier matérialise le
// PREMIER demi : EXPORT = rassembler l'arbre en UN artefact dont tout le code se régénère ; le SECOND
// demi (FOUND = recompiler tout depuis l'artefact, byte-identique) réutilise les mêmes émetteurs sans
// rien re-dériver.
//
// LE GÉNOME (ProjectTree) = {Name, StackManifest, Entities []EntitySource, Operations []honoemit.Op,
// WebAppSpec honoemit.WebAppSpec, Adaptations []honoemit.ViewAdaptation}. C'est la SOURCE unique de
// vérité de la projection — la même que les matérialiseurs Hono lisent aujourd'hui (honoDefaultManifest,
// projectWebSpec, le cut d'opérations), rassemblée et figée dans UN fichier.
//
// DÉTERMINISME-FIRST / le mur (§2/§6/§8). ExportProject + Serialise sont des fonctions PURES, TOTALES,
// byte-stable : même projet → même artefact byte-identique, content-adressé via records.Hash ; aucune
// horloge, aucun RNG, aucun ordre d'entrée qui fuit (Serialise CANONICALISE — clés triées). Le round-
// trip Serialise→Deserialise est l'identité. AUCUNE écriture de vérité : l'artefact EST l'arbre, le code
// est sa projection ; anti-overwrite §9 (Materialise* restent intouchés — l'export est PUREMENT additif).

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// ProjectTree is the EXPORTED genome of a project — the content-addressed ARBRE the whole code base is a
// projection of. It carries the SIX sources `found` recompiles everything from, each the SAME cut a
// matérialiseur reads today:
//
//	(1) Name          — the per-project namespace (the catalogue identity).
//	(2) StackManifest — the 3-container topology (honoDefaultManifest) the Pulumi program is emitted from.
//	(3) Entities      — the schema source ([]generators.EntitySource) appdata.EmitProjectData emits the DDL from.
//	(4) Operations    — the operation CUT ([]honoemit.Op) the Hono server scaffold registers one route per.
//	(5) WebAppSpec     — the entities + control→action pairs the view family (master + 3 children) derives from.
//	(6) Adaptations   — the capitalised SOFT per-platform requirements a recompile reproduces (append-only).
//
// It is a PURE value (no clock, no RNG). Hash() is its content address (records.Hash over the canonical
// serialisation) — the idempotency key the content-store (S01) lands it under and `found` recompiles by.
type ProjectTree struct {
	Name          string                    `json:"name"`
	StackManifest honoemit.StackManifest    `json:"stack_manifest"`
	Entities      []generators.EntitySource `json:"entities"`
	Operations    []honoemit.Op             `json:"operations"`
	WebAppSpec    honoemit.WebAppSpec       `json:"web_app_spec"`
	Adaptations   []honoemit.ViewAdaptation `json:"adaptations"`
}

// Hash returns the content address of the genome — records.Hash over the CANONICAL serialisation (sorted
// keys, byte-stable). Same tree → same hash; two different projects → two different hashes (content-
// addressed to the WHOLE arbre, not a constant). It is the key the content-store lands the artefact
// under and `found` recompiles by. A non-serialisable tree surfaces the marshal error (never a panic).
func (t ProjectTree) Hash() (string, error) {
	raw, err := Serialise(t)
	if err != nil {
		return "", err
	}
	return hashBytes(raw), nil
}

// wireTree is the SERIALISED shape of the genome — every part is plain-JSON-round-trippable EXCEPT the
// view's control→action buttons, which carry Expr ASTs (an interface, not reconstructible by generic
// json.Unmarshal). Those are stored as their CANONICAL JSONB (control.Canonicalize / action.Canonicalize)
// — the SAME content-hash scheme the kernel stores control/action under (one address space, never a
// forked codec). The rest (manifest, entities, operations, the web spec's project/entities/invariants,
// adaptations) is plain serialisable. So Serialise→Deserialise is the identity AND byte-stable.
type wireTree struct {
	Name          string                    `json:"name"`
	StackManifest honoemit.StackManifest    `json:"stack_manifest"`
	Entities      []generators.EntitySource `json:"entities"`
	Operations    []honoemit.Op             `json:"operations"`
	Web           wireWebApp                `json:"web_app_spec"`
	Adaptations   []honoemit.ViewAdaptation `json:"adaptations"`
}

// wireWebApp is the serialised WebAppSpec: the plain parts verbatim + the buttons as their canonical AST
// JSONB pairs (control + action), so the Expr interface fields survive the round-trip.
type wireWebApp struct {
	Project    string              `json:"project"`
	Entities   []entities.Entity   `json:"entities"`
	Buttons    []wireControlAction `json:"buttons"`
	Invariants []string            `json:"invariants"`
}

// wireControlAction stores one button as the canonical JSONB of its control AND its action — the SAME
// bytes the kernel.control / kernel.action records hash over (reuses control/action.Canonicalize).
type wireControlAction struct {
	Control json.RawMessage `json:"control"`
	Action  json.RawMessage `json:"action"`
}

// Serialise renders the genome as a CANONICAL JSON artefact: project the AST-bearing buttons to their
// canonical JSONB (control/action.Canonicalize — the kernel's own codec), then records.Canonicalize the
// whole envelope (object keys sorted recursively, no insignificant whitespace) so the bytes are byte-
// stable regardless of Go map iteration / field order. This is the portable artefact written to disk
// (X.aidos.json) — the SOURCE `found` recompiles from. PURE: same tree → identical bytes.
func Serialise(t ProjectTree) ([]byte, error) {
	btns := make([]wireControlAction, 0, len(t.WebAppSpec.Buttons))
	for i, b := range t.WebAppSpec.Buttons {
		cw, err := control.Canonicalize(b.Control)
		if err != nil {
			return nil, fmt.Errorf("export: button[%d] control: %w", i, err)
		}
		aw, err := action.Canonicalize(b.Action)
		if err != nil {
			return nil, fmt.Errorf("export: button[%d] action: %w", i, err)
		}
		btns = append(btns, wireControlAction{Control: cw, Action: aw})
	}
	w := wireTree{
		Name:          t.Name,
		StackManifest: t.StackManifest,
		Entities:      t.Entities,
		Operations:    t.Operations,
		Web: wireWebApp{
			Project:    t.WebAppSpec.Project,
			Entities:   t.WebAppSpec.Entities,
			Buttons:    btns,
			Invariants: t.WebAppSpec.Invariants,
		},
		Adaptations: t.Adaptations,
	}
	raw, err := json.Marshal(w)
	if err != nil {
		return nil, fmt.Errorf("export: marshal genome: %w", err)
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return nil, fmt.Errorf("export: canonicalise genome: %w", err)
	}
	return canon, nil
}

// Deserialise reconstructs a ProjectTree from a serialised artefact, parsing the buttons' canonical
// JSONB back through control.Parse / action.Parse (the kernel's own codec). It is the inverse of
// Serialise: Deserialise(Serialise(t)) == t (the round-trip identity). It JUDGES nothing and writes no
// truth — it only re-parses the genome. A malformed artefact is an actionable error, never a partial tree.
func Deserialise(raw []byte) (ProjectTree, error) {
	var w wireTree
	if err := json.Unmarshal(raw, &w); err != nil {
		return ProjectTree{}, fmt.Errorf("export: unmarshal genome: %w", err)
	}
	var btns []honoemit.ControlAction
	if w.Web.Buttons != nil {
		btns = make([]honoemit.ControlAction, 0, len(w.Web.Buttons))
		for i, b := range w.Web.Buttons {
			c, err := control.Parse(b.Control)
			if err != nil {
				return ProjectTree{}, fmt.Errorf("export: button[%d] control: %w", i, err)
			}
			a, err := action.Parse(b.Action)
			if err != nil {
				return ProjectTree{}, fmt.Errorf("export: button[%d] action: %w", i, err)
			}
			btns = append(btns, honoemit.ControlAction{Control: c, Action: a})
		}
	}
	return ProjectTree{
		Name:          w.Name,
		StackManifest: w.StackManifest,
		Entities:      w.Entities,
		Operations:    w.Operations,
		WebAppSpec: honoemit.WebAppSpec{
			Project:    w.Web.Project,
			Entities:   w.Web.Entities,
			Buttons:    btns,
			Invariants: w.Web.Invariants,
		},
		Adaptations: w.Adaptations,
	}, nil
}

// hashBytes is the content-address of raw bytes — records.Hash (SHA-256 hex), matching the Archive
// content-store (S01) so the artefact lands under the same address in either store. One source of truth.
func hashBytes(raw []byte) string { return records.Hash(raw) }

// ExportProject GATHERS the project's ARBRE into a ProjectTree — the SAME cut the Hono matérialiseurs
// read today (honoDefaultManifest, the operation cut, projectWebSpec), assembled into the single
// content-addressed genome. It is a PURE function of the project name (no clock, no RNG, no disk): the
// demo cut (the createOrder anchor + the Order entity + the checkout button) until the kernel projections
// (S17/S31, OpenQuestion) feed the cut from the truth-store. When --entities is passed the schema source
// is the caller's catalogue; otherwise it is derived from the same web spec the views list (one source).
//
// It assembles ONLY existing sources — it re-derives nothing the émetteurs already own. The result
// re-emits BYTE-IDENTICALLY through the existing matérialiseurs (the `found` guarantee): same genome →
// same gen/.
func ExportProject(project string) ProjectTree {
	return exportProjectTree(project, nil)
}

// exportProjectTree is the shared assembler: with entities==nil the schema source is DERIVED from the
// web spec's entities (the same cut the views list — one source); with entities set (the --entities
// catalogue) the genome carries the caller's own schema source. Both paths assemble the SAME manifest,
// operation cut and web spec the matérialiseurs read, so the genome is the faithful arbre either way.
func exportProjectTree(project string, schema []generators.EntitySource) ProjectTree {
	web := projectWebSpec(project)
	if schema == nil {
		schema = entitiesToSchemaSource(web.Entities)
	}
	return ProjectTree{
		Name:          project,
		StackManifest: honoDefaultManifest(project),
		Entities:      schema,
		Operations:    projectOperationCut(),
		WebAppSpec:    web,
		Adaptations:   capitalisedAdaptations(project),
	}
}

// projectOperationCut returns the operation CUT the server registers — the SAME ops projectServerSpec
// pins (today the createOrder anchor; when the kernel.operation projection lands, the executor reads the
// project's operations from the truth-store). One source: the server reads what the genome pins.
func projectOperationCut() []honoemit.Op {
	ops := []operation.Operation{operation.CreateOrder()}
	cut := make([]honoemit.Op, 0, len(ops))
	for _, op := range ops {
		cut = append(cut, honoemit.Op{Name: op.Name})
	}
	return cut
}

// entitiesToSchemaSource projects the view's entity ASTs (entities.Entity, S35) to the schema SOURCE
// shape (generators.EntitySource) appdata.EmitProjectData emits the DDL from — the SAME cut, two shapes.
// It maps each attribute's name verbatim and TRANSLATES the entity scalar token (S35: string/int/
// decimal/bool/timestamptz) to the generators DDL token (S34: text/int/numeric/bool/timestamptz) the
// DDL emitter consumes — the two closed sets differ on string↔text and decimal↔numeric (the SAME
// per-target binding S35's emit.go pins). Without the translation EmitProjectData refuses the genome
// (the schema would never recompile). Input order is preserved (the project OWNS its catalogue order,
// like EmitProjectData). PURE: a deterministic token map, no clock, no guess (an unrecognised token is
// passed through verbatim so the emitter's typed refusal — never a silent wrong column — still fires).
func entitiesToSchemaSource(ents []entities.Entity) []generators.EntitySource {
	out := make([]generators.EntitySource, 0, len(ents))
	for _, e := range ents {
		fields := make([]generators.Field, 0, len(e.Attributes))
		for _, a := range e.Attributes {
			fields = append(fields, generators.Field{Name: a.Name, Type: scalarToGeneratorType(a.Type)})
		}
		out = append(out, generators.EntitySource{
			Kind:   generators.KindEntity,
			Name:   e.Name,
			Fields: fields,
		})
	}
	return out
}

// scalarToGeneratorType maps an entity scalar token (S35: entities.ScalarType) to the generators DDL
// token (S34: generators.Field.Type) the DDL emitter consumes. The two closed sets agree on int/bool/
// timestamptz and differ on string→text and decimal→numeric (the SAME binding S35's typeBindings pins:
// text→string, numeric→decimal). A PURE total function over the closed scalar set; an unrecognised
// token is returned verbatim so the downstream emitter's typed refusal fires (honesty — never a guessed
// mapping that silently emits the wrong column type).
func scalarToGeneratorType(t entities.ScalarType) string {
	switch t {
	case entities.TypeString:
		return "text"
	case entities.TypeDecimal:
		return "numeric"
	case entities.TypeInt:
		return "int"
	case entities.TypeBool:
		return "bool"
	case entities.TypeTimestamptz:
		return "timestamptz"
	default:
		return string(t)
	}
}

// capitalisedAdaptations returns the project's capitalised SOFT per-platform adaptations (the loopback
// band, S-viewadaptation). For the demo cut none is validated yet, so the genome carries an empty band
// (nil → the recompile applies no override; the children stay their canonical form). When the kernel
// projection lands, the executor reads the project's capitalised adaptations from the truth-store.
func capitalisedAdaptations(project string) []honoemit.ViewAdaptation {
	_ = project
	return nil
}

// MaterialiseExport is the GATED writer half of `export`: it serialises the genome and writes the
// portable artefact (X.aidos.json) to outPath, returning the content address and the byte count. It
// JUDGES nothing — it lands exactly the bytes Serialise produced (the PURE projection). It writes NO
// truth (the artefact is the arbre, a below-the-line projection). An empty project/out is an actionable
// error; an unwritable path surfaces the OS error verbatim.
func MaterialiseExport(tree ProjectTree, outPath string) (ExportResult, error) {
	if tree.Name == "" {
		return ExportResult{}, errors.New("export: the genome pins no project name")
	}
	if outPath == "" {
		return ExportResult{}, errors.New("export: --out is required (where to write X.aidos.json)")
	}
	raw, err := Serialise(tree)
	if err != nil {
		return ExportResult{}, err
	}
	if dir := filepath.Dir(outPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return ExportResult{}, fmt.Errorf("create %s: %w", dir, err)
		}
	}
	if err := os.WriteFile(outPath, raw, 0o644); err != nil {
		return ExportResult{}, fmt.Errorf("write %s: %w", outPath, err)
	}
	return ExportResult{
		Project: tree.Name,
		Hash:    hashBytes(raw),
		Out:     outPath,
		Bytes:   len(raw),
		Parts:   genomeParts(tree),
	}, nil
}

// ExportResult is the JSON the `export` gesture prints: the project, the content address of the genome,
// the artefact path, its byte count, and the inventory of the six parts (the arbre is complete & visible).
type ExportResult struct {
	Project string   `json:"project"`
	Hash    string   `json:"hash"`
	Out     string   `json:"out"`
	Bytes   int      `json:"bytes"`
	Parts   []string `json:"parts"`
}

// genomeParts is the inventory of the six genome parts with their counts — so the operator SEES the
// whole arbre was captured (no silently dropped source). A pure projection of the tree.
func genomeParts(t ProjectTree) []string {
	return []string{
		fmt.Sprintf("name=%s", t.Name),
		fmt.Sprintf("stack_manifest.services=%d", len(t.StackManifest.Services)),
		fmt.Sprintf("entities=%d", len(t.Entities)),
		fmt.Sprintf("operations=%d", len(t.Operations)),
		fmt.Sprintf("web_app_spec.buttons=%d", len(t.WebAppSpec.Buttons)),
		fmt.Sprintf("adaptations=%d", len(t.Adaptations)),
	}
}

// runExport assembles the project's genome (with the optional --entities catalogue), writes the portable
// artefact, and prints the result as JSON. With --entities the schema source is the caller's catalogue;
// without it the schema is derived from the same web spec the views list (one source). Any error is
// actionable on stderr.
func runExport(project, entitiesPath, out string) {
	if project == "" {
		fail(errors.New("export: --project is required"))
	}
	if out == "" {
		out = defaultExportOut(project)
	}
	var schema []generators.EntitySource
	if entitiesPath != "" {
		ents, err := loadEntities(entitiesPath)
		if err != nil {
			fail(err)
		}
		schema = ents
	}
	tree := exportProjectTree(project, schema)
	res, err := MaterialiseExport(tree, out)
	if err != nil {
		fail(err)
	}
	printJSON(res)
}

// defaultExportOut is the default artefact path (<project>.aidos.json in the CWD) when --out is omitted.
func defaultExportOut(project string) string { return project + ".aidos.json" }
