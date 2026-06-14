package main

// impact.go — LA VAGUE DE ROUGE SUR L'ARBRE DU PROJET (le génome) + le FOUND INCRÉMENTAL.
//
// VISION (gravée) : UNE vague de rouge à chaque grain. Changer UN requirement → la vague (S22,
// runtime/redwave) propage l'impact à tout ce qui en dépend → on re-compile les nœuds rouges, jamais à la
// main. Au grain de l'ARBRE (le ProjectTree, le génome export/found) : un nœud changé (une entité, une
// opération, un control/bouton, la vue maître, le manifest) → les FAMILLES affectées (le sous-graphe
// rouge), pour que le recompile soit INCRÉMENTAL — on ne refonde QUE les familles touchées.
//
// LA PROPAGATION (le câblage des 7 familles ; la structure maître→enfants de honoemit) :
//   - une ENTITÉ changée   → {schema, + les vues qui la montrent : master, web, mobile, desktop} ;
//   - une OPÉRATION changée → {server, + les boutons qui la déclenchent → leurs vues} ;
//   - un CONTROL changé    → {les 3 vues} (master → web, mobile, desktop) ;
//   - la MAÎTRE changée    → {web, mobile, desktop} (les 3 enfants) ;
//   - le MANIFEST changé   → {infra}.
//
// RÉUTILISE S22, NE LA RÉ-IMPLÉMENTE PAS (CLAUDE.md §6 ; ADR 0056 = les rdeps Bazel au grain code).
// ImpactOf NE RE-CODE PAS la propagation : il PROJETTE l'arbre en le graphe de liens (redwave.Edge) que la
// vague de rouge S22 attend — un nœud par famille, une arête `from derives_from to` pour chaque relation
// de dépendance — pose le nœud changé comme bumped (sa tête bouge v1→v2), puis appelle redwave.Impact pour
// calculer le sous-graphe rouge (la fermeture transitive, mirror-first), et lit les FAMILLES rouges en
// sortie. C'est la MÊME vague de rouge, branchée sur les nœuds du ProjectTree au lieu des sources kernel.
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8). ImpactOf est une FONCTION PURE, TOTALE : même (arbre, nœud) →
// même sous-graphe rouge, byte-stable (familles triées canoniquement) ; aucune horloge, aucun RNG, aucune
// I/O. FoundIncremental recompile PUREMENT les SEULES familles rouges en réutilisant recompileFamilies (le
// même cœur que FoundProject) : son émission est BYTE-IDENTIQUE à FoundProject pour ces familles, et une
// famille NON touchée n'est PAS recompilée (absente de la sortie). Aucune écriture de vérité (le gen/ est
// une projection below-the-line). Anti-overwrite §9 : FoundProject reste intact ; impact.go est PUREMENT
// ADDITIF.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// Family is one of the SEVEN artefact families `found` recompiles (the closed set the red wave maps a
// changed node to). It is the GRAIN of the incremental recompile: the unit the red wave reddens whole.
type Family string

const (
	// FamilySchema — schema.sql (the project's data DDL, from the entities).
	FamilySchema Family = "schema"
	// FamilyServer — gen/<name>/server/ (the Hono server scaffold, from the operations).
	FamilyServer Family = "server"
	// FamilyMaster — master-view.json (the canonical, platform-agnostic parent node).
	FamilyMaster Family = "master"
	// FamilyWeb — gen/<name>/web/ (the React web child, derives from the master).
	FamilyWeb Family = "web"
	// FamilyMobile — gen/<name>/mobile/ (the mobile child, derives from the master).
	FamilyMobile Family = "mobile"
	// FamilyDesktop — gen/<name>/desktop/ (the desktop child, derives from the master).
	FamilyDesktop Family = "desktop"
	// FamilyInfra — gen/<name>/infra/ (the Pulumi 3-container program, from the manifest).
	FamilyInfra Family = "infra"
)

// canonicalFamilyOrder is the CLOSED, canonical order of the seven families — the SAME order
// recompileFamilies walks (schema → server → master → web → mobile → desktop → infra). The wave's
// output families are sorted into this order so ImpactOf is byte-stable regardless of map iteration.
var canonicalFamilyOrder = []Family{
	FamilySchema, FamilyServer, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop, FamilyInfra,
}

// familyRank gives a family its canonical rank (its index in canonicalFamilyOrder); an unknown family
// ranks last so a malformed family never jumps ahead. Used to order the wave's output deterministically.
func familyRank(f Family) int {
	for i, c := range canonicalFamilyOrder {
		if c == f {
			return i
		}
	}
	return len(canonicalFamilyOrder)
}

// isFamily reports whether id names one of the seven families (so the wave's red TARGETS that ARE family
// nodes are read off as affected families, the others — entity/op/control/sentinel nodes — are ignored).
func isFamily(id string) bool {
	switch Family(id) {
	case FamilySchema, FamilyServer, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop, FamilyInfra:
		return true
	default:
		return false
	}
}

// AllFamilies returns the membership set of ALL seven families (every family wanted) — the COMPLETE
// recompilation FoundProject runs. recompileFamilies(tree, AllFamilies()) == the old recompile(tree).
func AllFamilies() map[Family]bool {
	want := make(map[Family]bool, len(canonicalFamilyOrder))
	for _, f := range canonicalFamilyOrder {
		want[f] = true
	}
	return want
}

// The sentinel node ids for the two NON-content sources of the genome that are not addressed by a
// per-element id. A changed master / manifest is referred to by these stable ids (the human-facing
// "master" / "manifest" the prompt names), distinct from any entity/operation/control id.
const (
	// NodeMaster is the changed-node id for the MASTER view (the canonical parent node).
	NodeMaster = "master"
	// NodeManifest is the changed-node id for the StackManifest (the 3-container topology).
	NodeManifest = "manifest"
)

// projectVersion is the uniform version every link is pinned to in the projected graph (v1), while every
// node's HEAD is set one ahead (v2). With every link pinned to v1 and every head at v2, links.Resolve
// reports EVERY edge stale — so redwave's closure is driven PURELY by reachability from the bumped node
// (the `red[to]` walk), which is exactly the dependency propagation the arbre encodes. Declared, one
// source, so the projection is deterministic.
const (
	projectVersion = "v1"
	projectHead    = "v2"
)

// projectEdge builds one propagating arête of the projected graph: `from derives_from to`, load-bearing,
// pinned from@v1 → to@v1. The Layer is a render hint only (the wave's order does not change the affected
// families). Every edge is load-bearing — the arbre's family dependencies are all structural (a changed
// entity DOES redden the schema; there is no "cosmetic" family edge), so the wave never drops one.
func projectEdge(from, to string) redwave.Edge {
	return redwave.Edge{
		Link: links.Link{
			Kind: links.KindDerivesFrom,
			From: links.Ref{ID: from, Version: projectVersion},
			To:   links.Ref{ID: to, Version: projectVersion},
		},
		LoadBearing: true,
		Layer:       redwave.LayerProjection,
	}
}

// projectTreeGraph PROJECTS the ProjectTree into the (edges, heads) the red wave S22 consumes. It encodes
// the family-dependency graph the prompt pins, walked OUTWARD from the changed node by redwave.Impact:
//
//	entity <e>   ←derives— schema, master            (the schema + the views show every entity)
//	operation<o> ←derives— server                     (the server registers every operation)
//	operation<o> ←derives— <control bound to o>        (the buttons that TRIGGER the op, via action.Invoke)
//	control <c>  ←derives— master                      (every button lives on the master view)
//	master       ←derives— web, mobile, desktop        (the three children derive from the master)
//	manifest     ←derives— infra                       (the Pulumi program is emitted from the manifest)
//
// redwave.Impact reddens a `from` when its `to` is already red — so a bumped entity reddens schema+master,
// the reddened master reddens web/mobile/desktop, etc. (the transitive closure). The heads put every node
// at v2 while every link is pinned to v1, so Resolve reports every edge stale and the closure is the pure
// reachability from the bumped node. PURE: a deterministic projection of the tree, no clock, no RNG.
func projectTreeGraph(tree ProjectTree) (edges []redwave.Edge, heads links.Heads, nodes map[string]bool) {
	nodes = map[string]bool{}
	addNode := func(id string) {
		if id != "" {
			nodes[id] = true
		}
	}

	// The family nodes always exist (they are the recompile targets).
	for _, f := range canonicalFamilyOrder {
		addNode(string(f))
	}
	addNode(NodeManifest)

	// (a) entities → schema + master (the schema and every view derive from each entity).
	for _, e := range tree.Entities {
		id := entityNodeID(e.Name)
		if id == "" {
			continue
		}
		addNode(id)
		edges = append(edges, projectEdge(string(FamilySchema), id))
		edges = append(edges, projectEdge(string(FamilyMaster), id))
	}

	// (b) operations → server (the server registers every operation).
	for _, op := range tree.Operations {
		id := operationNodeID(op.Name)
		if id == "" {
			continue
		}
		addNode(id)
		edges = append(edges, projectEdge(string(FamilyServer), id))
	}

	// (c) controls → master (every button lives on the master view) ; and operation → its triggering
	// buttons (the button DERIVES FROM the op it invokes — change the op, the button reddens).
	for _, b := range tree.WebAppSpec.Buttons {
		cid := controlNodeID(b.Control.Name)
		if cid == "" {
			continue
		}
		addNode(cid)
		edges = append(edges, projectEdge(string(FamilyMaster), cid))
		if opID := operationNodeID(b.Action.Invoke); opID != "" {
			addNode(opID)
			edges = append(edges, projectEdge(cid, opID))
		}
	}

	// (d) master → web/mobile/desktop (the three children derive from the master).
	edges = append(edges, projectEdge(string(FamilyWeb), NodeMaster))
	edges = append(edges, projectEdge(string(FamilyMobile), NodeMaster))
	edges = append(edges, projectEdge(string(FamilyDesktop), NodeMaster))
	addNode(NodeMaster)

	// (e) manifest → infra (the Pulumi program is emitted from the manifest).
	edges = append(edges, projectEdge(string(FamilyInfra), NodeManifest))

	// Every node sits at the projectHead (v2) while every link is pinned to projectVersion (v1) — so
	// Resolve reports every edge stale and the closure is the pure reachability from the bumped node.
	heads = make(links.Heads, len(nodes))
	for id := range nodes {
		heads[id] = projectHead
	}
	return edges, heads, nodes
}

// entityNodeID / operationNodeID / controlNodeID namespace each kind of node so an entity named "infra"
// can never collide with the infra FAMILY node (the families own the bare names; the elements are
// prefixed). A changedNodeID handed to ImpactOf may be a BARE element name OR an already-prefixed id —
// nodeIDFor resolves it against the tree so the caller can pass either.
func entityNodeID(name string) string {
	if name == "" {
		return ""
	}
	return "entity:" + name
}

func operationNodeID(name string) string {
	if name == "" {
		return ""
	}
	return "operation:" + name
}

func controlNodeID(name string) string {
	if name == "" {
		return ""
	}
	return "control:" + name
}

// resolveChangedNode maps a caller-supplied changedNodeID to the node id used in the projected graph. It
// accepts, in order: the sentinels "master"/"manifest" (verbatim); a bare FAMILY name (verbatim — a
// family node IS a recompile target); an already-prefixed id (entity:/operation:/control: — verbatim);
// or a BARE element name resolved against the tree (an entity / operation / control name). It is PURE and
// TOTAL: an unknown id is returned VERBATIM (so an unrecognised node simply reddens nothing — never a
// crash, never a guessed family). The match is a deterministic NAME lookup, no LLM.
func resolveChangedNode(tree ProjectTree, changedNodeID string) string {
	id := changedNodeID
	if id == NodeMaster || id == NodeManifest || isFamily(id) {
		return id
	}
	if strings.HasPrefix(id, "entity:") || strings.HasPrefix(id, "operation:") || strings.HasPrefix(id, "control:") {
		return id
	}
	// A bare element name — resolve it against the tree's catalogue (entity, then operation, then control).
	for _, e := range tree.Entities {
		if e.Name == id {
			return entityNodeID(id)
		}
	}
	for _, op := range tree.Operations {
		if op.Name == id {
			return operationNodeID(id)
		}
	}
	for _, b := range tree.WebAppSpec.Buttons {
		if b.Control.Name == id {
			return controlNodeID(id)
		}
	}
	return id
}

// ImpactOf computes the RED SUBGRAPH of the project's arbre: the FAMILIES a changed node propagates red
// to (the vague de rouge on the ProjectTree). It RE-USES the S22 red wave (redwave.Impact) — it projects
// the arbre into the (edges, heads) the wave consumes, marks the changed node as bumped, runs the wave,
// and reads the red FAMILY targets off the result. The propagation is the prompt's wiring:
//
//	entity   → {schema, master, web, mobile, desktop}  (the schema + the views that show it)
//	operation→ {server, + the views carrying the buttons that trigger it}
//	control  → {master, web, mobile, desktop}          (the three views)
//	master   → {web, mobile, desktop}                  (the three children)
//	manifest → {infra}
//
// It is PURE, TOTAL, DETERMINISTIC: same (tree, changedNodeID) → the SAME families in canonical order
// (schema < server < master < web < mobile < desktop < infra). An unknown / empty node reddens NOTHING
// (an empty slice — never a panic, never a guessed family). The changedNodeID may be a bare element name,
// an already-prefixed node id, a family name, or a sentinel ("master"/"manifest").
func ImpactOf(tree ProjectTree, changedNodeID string) []Family {
	if changedNodeID == "" {
		return nil
	}
	bumped := resolveChangedNode(tree, changedNodeID)

	edges, heads, _ := projectTreeGraph(tree)

	// REUSE S22: the wave is the transitive closure of the projected graph from the bumped node.
	wave := redwave.Impact([]string{bumped}, edges, heads)

	// A bumped node that IS itself a family node is its own red family (the wave reddens CONSUMERS, so a
	// leaf family like infra/schema bumped directly would not appear among the wave's `from` targets).
	seen := map[Family]bool{}
	if isFamily(bumped) {
		seen[Family(bumped)] = true
	}
	for _, it := range wave.Items {
		if isFamily(it.Target) {
			seen[Family(it.Target)] = true
		}
	}

	out := make([]Family, 0, len(seen))
	for f := range seen {
		out = append(out, f)
	}
	sort.SliceStable(out, func(i, j int) bool { return familyRank(out[i]) < familyRank(out[j]) })
	return out
}

// FoundIncremental recompiles ONLY the families ImpactOf(tree, changedNodeID) reddens — the INCREMENTAL
// recompile (la vague de rouge câblée sur le found). It REUSES recompileFamilies (the exact same per-
// family emitters FoundProject runs), so its output is BYTE-IDENTICAL to FoundProject for those families;
// a family NOT in the red subgraph is NOT recompiled (absent from the output). It writes the recompiled
// artefacts under outRoot (the SAME gated below-the-line side-effect as FoundProject — no truth written).
//
// PURE except the final disk write: same (tree, changedNodeID) → same gen/. An unknown node reddens no
// family → an empty recompilation (zero files, no write) — never a crash. A malformed genome surfaces the
// emitter's typed refusal verbatim (the honesty rule), never a partial gen/.
func FoundIncremental(tree ProjectTree, changedNodeID, outRoot string) (FoundResult, error) {
	if tree.Name == "" {
		return FoundResult{}, errors.New("found: the genome pins no project name")
	}
	if outRoot == "" {
		return FoundResult{}, errors.New("found: --out-root is required (where to recompile gen/<name>/)")
	}
	artefactHash, err := tree.Hash()
	if err != nil {
		return FoundResult{}, fmt.Errorf("found: address the genome: %w", err)
	}

	families := ImpactOf(tree, changedNodeID)
	want := make(map[Family]bool, len(families))
	for _, f := range families {
		want[f] = true
	}

	files, err := recompileFamilies(tree, want)
	if err != nil {
		return FoundResult{}, err
	}

	// The gated side-effect: land each recompiled artefact under outRoot at its RELATIVE path (the SAME
	// write FoundProject does — slash-relative Paths resolved under outRoot, parent dirs created).
	for _, f := range files {
		dst := filepath.Join(outRoot, filepath.FromSlash(f.Path))
		if dir := filepath.Dir(dst); dir != "" {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return FoundResult{}, fmt.Errorf("found: create %s: %w", dir, err)
			}
		}
		if err := os.WriteFile(dst, f.Bytes, 0o644); err != nil {
			return FoundResult{}, fmt.Errorf("found: write %s: %w", dst, err)
		}
	}

	return FoundResult{
		Project:  tree.Name,
		Artefact: artefactHash,
		OutRoot:  outRoot,
		Files:    files,
	}, nil
}

// runFoundIncremental reads the portable artefact, recompiles ONLY the families the changed node reddens
// (the red wave on the arbre), and prints the result as JSON. It is the `found --changed <nodeID>` half:
// an incremental refound after a single node changed. Any error is actionable on stderr.
func runFoundIncremental(artefactPath, project, outRoot, changedNodeID string) {
	if artefactPath == "" {
		fail(errors.New("found: --artifact is required (the X.aidos.json to recompile)"))
	}
	raw, err := os.ReadFile(artefactPath)
	if err != nil {
		fail(fmt.Errorf("found: read --artifact %q: %w", artefactPath, err))
	}
	tree, err := Deserialise(raw)
	if err != nil {
		fail(err)
	}
	if project != "" {
		tree = renameTree(tree, project)
	}
	if outRoot == "" {
		outRoot = defaultFoundOut(tree.Name)
	}
	res, err := FoundIncremental(tree, changedNodeID, outRoot)
	if err != nil {
		fail(err)
	}
	printJSON(foundIncrementalSummary(res, changedNodeID, ImpactOf(tree, changedNodeID)))
}

// foundIncrementalSummary is the JSON the `found --changed` gesture prints: the project, the genome's
// content address, the output root, the CHANGED node, the red FAMILIES (the impact), the file COUNT and
// the path-ordered inventory — so the operator SEES which families the wave recompiled (and which it did
// NOT). A pure projection of the result.
func foundIncrementalSummary(r FoundResult, changedNodeID string, families []Family) map[string]any {
	files := make([]map[string]string, 0, len(r.Files))
	for _, f := range r.Files {
		files = append(files, map[string]string{"path": f.Path, "output_hash": f.OutputHash})
	}
	fam := make([]string, 0, len(families))
	for _, f := range families {
		fam = append(fam, string(f))
	}
	return map[string]any{
		"project":       r.Project,
		"artefact_hash": r.Artefact,
		"out_root":      r.OutRoot,
		"changed_node":  changedNodeID,
		"red_families":  fam,
		"file_count":    len(r.Files),
		"files":         files,
	}
}
