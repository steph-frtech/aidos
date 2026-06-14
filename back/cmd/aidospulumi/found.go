package main

// found.go — `aidospulumi found` : l'ARTEFACT (le « génome ») → recompilation BYTE-IDENTIQUE de TOUTE l'app.
//
// Intention (utilisatrice, 2026-06-14) : « on peut faire un EXPORT de tout le projet et le REFONDER avec
// une sorte de COMPILATEUR ». L'export (export.go) rassemble l'ARBRE content-adressé ; le FOUND est le
// COMPILATEUR : il recompile TOUT le code depuis cet arbre — le schéma (appdata.EmitProjectData), le
// serveur Hono émis (honoemit.EmitServerScaffold), la vue MAÎTRE (EmitMasterView), les TROIS enfants
// (web/mobile/desktop, EmitWebChild + ReproduceWithCapitalised en appliquant les adaptations capitalisées),
// et le programme Pulumi 3-conteneurs (EmitPulumiStackHono) — et l'écrit sous gen/<name>/.
//
// LE THÉORÈME DU COMPILATEUR (le miroir, found_test.go). found(export(P)) produit une émission BYTE-
// IDENTIQUE à l'émission DIRECTE de P : recompiler depuis le génome == émettre depuis les sources, byte
// pour byte. C'est la preuve que le génome est une SOURCE complète et fidèle, et que le code est sa
// projection régénérable. La re-émission byte-stable était déjà prouvée pour chaque émetteur ; found la
// compose en UNE recompilation de l'app entière.
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8). FoundProject est une FONCTION PURE de l'artefact, byte-stable :
// même artefact → même gen/ ; aucune horloge, aucun RNG, aucun chemin de sortie qui fuit dans les octets
// (les émetteurs rendent des Paths RELATIFS, content-adressés à leurs sources). Found NE RE-DÉRIVE RIEN :
// il RÉUTILISE les émetteurs existants, chacun déjà prouvé byte-stable. Il n'écrit AUCUNE vérité —
// l'artefact EST l'arbre, le gen/ est sa projection below-the-line. Anti-overwrite §9 : les émetteurs et
// les matérialiseurs (Materialise/MaterialiseApp/MaterialiseHono) restent intouchés ; found est PUREMENT
// ADDITIF, le second demi du couple export↔found.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// foundEnv is the environment the recompiled Pulumi program targets. The genome pins the WHAT (the
// stack manifest, the 3-container topology); the env is the deployment dimension `found` recompiles
// for — `dev` by default (the same env the demo cut materialises). Declared, never guessed; one source
// shared by the executor and the mirror so the recompiled program is byte-stable.
const foundEnv = "dev"

// FoundFile is one recompiled artefact: its RELATIVE path (under outRoot — gen/<name>/<family>/<file>,
// or the bare schema.sql / master-view.json), the recompiled bytes, and their content address
// (records.Hash — the byte-stable re-emit proof, the SAME scheme the content-store S01 lands under).
type FoundFile struct {
	Path       string `json:"path"`
	Bytes      []byte `json:"-"`
	OutputHash string `json:"output_hash"`
}

// FoundResult is the inventory of a recompilation: the project, the artefact's content address (so the
// operator sees WHICH genome was recompiled), the output root, and the recompiled files (path-ordered).
// The Files carry the bytes (for the in-memory mirror) AND their content address (the visible proof).
type FoundResult struct {
	Project  string      `json:"project"`
	Artefact string      `json:"artefact_hash"`
	OutRoot  string      `json:"out_root"`
	Files    []FoundFile `json:"files"`
}

// FoundProject is THE COMPILER: it recompiles the WHOLE app from the genome and writes it under outRoot,
// reusing the existing emitters (it re-derives NOTHING). The recompiled artefacts are BYTE-IDENTICAL to
// the direct emission of the project (the compiler theorem, proven by found_test.go):
//
//	(1) schema.sql           — appdata.EmitProjectData over tree.Entities (the schema source).
//	(2) gen/<name>/server/   — honoemit.EmitServerScaffold over the ServerSpec rebuilt from tree.Operations
//	                           + the served view (entities + WebDir) — the SAME cut projectServerSpec pins.
//	(3) master-view.json     — honoemit.EmitMasterView over tree.WebAppSpec (the canonical parent node).
//	(4) gen/<name>/web/      — honoemit.EmitWebChild over tree.WebAppSpec (the web idiom, byte-identical).
//	(5) gen/<name>/mobile/   — honoemit.ReproduceWithCapitalised(master, ChildMobile, tree.Adaptations).
//	(6) gen/<name>/desktop/  — honoemit.ReproduceWithCapitalised(master, ChildDesktop, tree.Adaptations).
//	(7) gen/<name>/infra/    — honoemit.EmitPulumiStackHono over tree.StackManifest (the 3-container program).
//
// PURE except the final disk WRITE (the gated below-the-line side-effect, exactly like the Materialise*
// twins): same artefact → same gen/. The capitalised adaptations (tree.Adaptations) are RE-APPLIED to
// the mobile/desktop children via ReproduceWithCapitalised — the loopback reproduction, not re-derived.
// A malformed genome surfaces the emitter's typed refusal verbatim (the honesty rule), never a partial gen/.
func FoundProject(tree ProjectTree, outRoot string) (FoundResult, error) {
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

	files, err := recompile(tree)
	if err != nil {
		return FoundResult{}, err
	}

	// The gated side-effect: land each recompiled artefact under outRoot at its RELATIVE path. The
	// emitters render slash-relative Paths; we resolve them under outRoot and create the parent dirs.
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

// recompile is the PURE heart of `found`: it reuses every existing emitter over the genome's parts and
// returns the recompiled artefacts (path-relative, content-addressed) — NO disk write. It re-derives
// nothing; each emitter is fed exactly the cut the export gathered, so the bytes equal the direct
// emission. Split out so the byte-identity is a pure-function property the mirror can assert without
// touching disk (and so FoundProject's only impurity is the final write).
func recompile(tree ProjectTree) ([]FoundFile, error) {
	out := make([]FoundFile, 0, 24)

	// (1) The schema — the project's data DDL, from the genome's entity sources.
	schema, _, err := appdata.EmitProjectData(tree.Name, tree.Entities)
	if err != nil {
		return nil, fmt.Errorf("found: recompile schema: %w", err)
	}
	out = append(out, foundFile("schema.sql", schema))

	// (2) The Hono server scaffold — from the ServerSpec rebuilt from the genome (the SAME cut
	// projectServerSpec pins: the operations + the served view's entities + the web build dir).
	scaffold, br := honoemit.EmitServerScaffold(foundServerSpec(tree))
	if br != nil {
		return nil, fmt.Errorf("found: recompile server scaffold (%s): %s", br.Code, br.Explanation)
	}
	for _, a := range scaffold {
		out = append(out, foundFile(a.Path, a.Bytes))
	}

	// (3) The MASTER view — the canonical, platform-agnostic parent node (the children derive from it).
	master, br := honoemit.EmitMasterView(tree.WebAppSpec)
	if br != nil {
		return nil, fmt.Errorf("found: recompile master view (%s): %s", br.Code, br.Explanation)
	}
	masterBytes, err := masterViewArtifactBytes(master)
	if err != nil {
		return nil, fmt.Errorf("found: address master view: %w", err)
	}
	out = append(out, foundFile("master-view.json", masterBytes))

	// (4) The WEB child — the React web idiom, byte-identical to EmitWebApp (anti-overwrite §9).
	webChild, br := honoemit.EmitWebChild(tree.WebAppSpec)
	if br != nil {
		return nil, fmt.Errorf("found: recompile web child (%s): %s", br.Code, br.Explanation)
	}
	for _, a := range webChild.Artifacts {
		out = append(out, foundFile(a.Path, a.Bytes))
	}

	// (5) The MOBILE child — reproduced from the master APPLYING the capitalised adaptations (the
	// loopback). No matching capitalisation ⇒ the canonical mobile child (byte-identical to EmitMobileChild).
	mobile, vbr := honoemit.ReproduceWithCapitalised(master, honoemit.ChildMobile, tree.Adaptations)
	if vbr != nil {
		return nil, fmt.Errorf("found: recompile mobile child (%s): %s", vbr.Code, vbr.Explanation)
	}
	for _, a := range mobile.Artifacts {
		out = append(out, foundFile(a.Path, a.Bytes))
	}

	// (6) The DESKTOP child — reproduced from the master APPLYING the capitalised adaptations.
	desktop, vbr := honoemit.ReproduceWithCapitalised(master, honoemit.ChildDesktop, tree.Adaptations)
	if vbr != nil {
		return nil, fmt.Errorf("found: recompile desktop child (%s): %s", vbr.Code, vbr.Explanation)
	}
	for _, a := range desktop.Artifacts {
		out = append(out, foundFile(a.Path, a.Bytes))
	}

	// (7) The Pulumi PROGRAM — the 3-container wired stack, from the genome's manifest. The per-project
	// server image tag is the SAME the materialiser pins (honoServerImageTag), so the program references
	// the project's own routes — the recompiled program byte-equals the materialised one.
	infra, br := honoemit.EmitPulumiStackHono(tree.Name, foundEnv, tree.StackManifest, honoemit.StackHonoOpts{HonoImage: honoServerImageTag(tree.Name)})
	if br != nil {
		return nil, fmt.Errorf("found: recompile pulumi stack (%s): %s", br.Code, br.Explanation)
	}
	for _, a := range infra {
		out = append(out, foundFile(a.Path, a.Bytes))
	}

	return out, nil
}

// foundServerSpec rebuilds the Hono ServerSpec from the genome — the SAME cut projectServerSpec pins,
// but read FROM the artefact (not re-derived): the operations the genome carries (tree.Operations →
// the routes), the served view's entity names (lowercased, from tree.WebAppSpec.Entities → the read
// routes GET /entities/<e>), and the web build dir (so the server serves the static React build on
// GET /). One source: the recompiled server reads exactly what the genome pins, so the scaffold bytes
// equal the materialiser's.
func foundServerSpec(tree ProjectTree) honoemit.ServerSpec {
	ents := make([]string, 0, len(tree.WebAppSpec.Entities))
	for _, e := range tree.WebAppSpec.Entities {
		ents = append(ents, strings.ToLower(e.Name))
	}
	return honoemit.ServerSpec{
		Project:  tree.Name,
		Ops:      tree.Operations,
		Entities: ents,
		WebDir:   webBuildDir,
	}
}

// masterViewArtifactBytes renders the MASTER view as its canonical JSON artefact (records.Canonicalize
// — sorted keys, byte-stable) so the parent node persists deterministically: same master → same bytes.
// It is the ONE place `found` persists the master (the canonical parent node of the composes tree, S18).
// PURE; a non-serialisable master (impossible for a well-formed value) surfaces the marshal error.
func masterViewArtifactBytes(m honoemit.MasterView) ([]byte, error) {
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("marshal master view: %w", err)
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return nil, fmt.Errorf("canonicalise master view: %w", err)
	}
	return canon, nil
}

// foundFile wraps recompiled bytes into a FoundFile, content-addressing the output (records.Hash — the
// SAME scheme the emitter Artifact.OutputHash and the content-store S01 use; one address space).
func foundFile(path string, b []byte) FoundFile {
	return FoundFile{Path: path, Bytes: b, OutputHash: records.Hash(b)}
}

// runFound reads the portable artefact (X.aidos.json), recompiles the WHOLE app from it under outRoot,
// and prints the result as JSON. With --project it OVERRIDES the genome's name (re-found under another
// namespace); without it the genome's own name is used. Any error is actionable on stderr.
func runFound(artefactPath, project, outRoot string) {
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
	res, err := FoundProject(tree, outRoot)
	if err != nil {
		fail(err)
	}
	printJSON(foundSummary(res))
}

// renameTree re-namespaces the genome under a new project name — the name flows into every emitter
// (the schema header, the server/web/mobile/desktop dirs, the Pulumi stack), so a re-found under a new
// name recompiles a complete, namespaced app. It also re-stamps the web spec's project (one source).
// PURE: a copy with the name swapped, the rest of the arbre verbatim (anti-overwrite §9, no in-place edit).
func renameTree(tree ProjectTree, project string) ProjectTree {
	out := tree
	out.Name = project
	out.StackManifest.App = project
	out.WebAppSpec.Project = project
	return out
}

// foundSummary is the JSON the `found` gesture prints: the project, the genome's content address, the
// output root, the file COUNT, and the path-ordered inventory (path + output hash) — so the operator
// SEES the whole app was recompiled (no silently dropped family). The bytes themselves are on disk.
func foundSummary(r FoundResult) map[string]any {
	files := make([]map[string]string, 0, len(r.Files))
	for _, f := range r.Files {
		files = append(files, map[string]string{"path": f.Path, "output_hash": f.OutputHash})
	}
	return map[string]any{
		"project":       r.Project,
		"artefact_hash": r.Artefact,
		"out_root":      r.OutRoot,
		"file_count":    len(r.Files),
		"files":         files,
	}
}

// defaultFoundOut is the default recompilation root (.found/<project> in the CWD) when --out-root is
// omitted — a dedicated dir so found never overwrites the live gen/ tree (anti-overwrite §9).
func defaultFoundOut(project string) string { return filepath.Join(".found", project) }
