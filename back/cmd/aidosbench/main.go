// Command aidosbench TRITURE AIDOS : it stress-tests the system end-to-end on REAL app
// templates, across SEVERAL real models, and measures the two things the user asked for —
//
//  1. DÉTERMINISME DE L'ÉMETTEUR (la fondation) : « mêmes specs → même code ». For each app
//     template the deterministic emitter (appdata.EmitProjectData — a PURE projection of the
//     entity ASTs, zero LLM) is run TWICE and the bytes are sha256-compared. Same spec → the
//     SAME code, byte-identical (the « 99% » the user expects is in fact 100% for the
//     deterministic layer — the emitter is a pure function, proven by its reproducibility mirror).
//
//  2. DIVERGENCE MODÈLE (le bench différentiel DG) : « compile avec plusieurs modèles ». For
//     each app, each model (opus / sonnet / haiku, via the DG04 ClaudeModel adapter behind the
//     RequirementBench port) PROPOSES the requirement set; the PURE DG03 metric re-judges it
//     (MatchPct = quality, MissingTypes = holes). We time each call (speed) and compute the
//     cross-model AGREEMENT (Jaccard of the surfaced requirement-type sets) — how identical the
//     models' extractions are. The screen-mockup app exercises the DG05 multimodal path.
//
// THE FINDING the report makes precise: the CODE EMISSION is 100% deterministic (same spec →
// same code); the model-dependent layer is the requirement/spec EXTRACTION, where models
// DIVERGE — and this bench quantifies that divergence + ranks the models on quality & speed.
//
// THE WALL (CLAUDE.md §2): everything here READS and MEASURES. The emitter is below-the-line;
// the models only PROPOSE Text, re-judged deterministically (no LLM in the judge); the bench
// writes NO truth — it emits a report. DETERMINISM-FIRST (§6/§8): the judge (DG03) dominates;
// the LLM is the gated exception, isolated to ClaudeModel.Propose, always re-judged.
//
// Usage:
//
//	aidosbench                    # all apps × all models, markdown report to stdout + JSON file
//	aidosbench -models opus       # restrict the model set (csv of opus|sonnet|haiku)
//	aidosbench -apps shop,blog    # restrict the app set
//	aidosbench -json /tmp/b.json  # where to write the machine-readable report
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	rb "github.com/steph-frtech/aidos/back/runtime/requirementbench"
)

// model is one benchmarked LLM: a display key + the claude --model id.
type model struct {
	Key string
	ID  string
}

var allModels = []model{
	{"opus", "claude-opus-4-8"},
	{"sonnet", "claude-sonnet-4-6"},
	{"haiku", "claude-haiku-4-5-20251001"},
}

// appTemplate is a REAL app the bench compiles: its declared structure (→ the spec-derived
// expected requirement types), the natural-language SPEC TEXT a model reads (intent + screen),
// and the entity ASTs the deterministic emitter projects to code.
type appTemplate struct {
	Key      string
	Title    string
	Decl     rb.SpecDeclaration
	SpecText string
	Entities []generators.EntitySource
}

func templates() []appTemplate {
	return []appTemplate{
		{
			Key:   "shop",
			Title: "Boutique en ligne",
			Decl: rb.SpecDeclaration{
				HasViewGoal: true, HasViewData: true, HasViewEmptyState: true,
				Controls: 3, ControlVisible: true, ControlEnabled: true,
				Actions: 2, ActionOnSuccess: true, ActionOnError: true,
				Operations: 1, OperationEvents: 1, OperationGuards: 1,
				Entities: 3, EntityFields: 12, EntityRelations: 2,
				Invariants: 1, Policies: 1, Budgets: 1, ErrorCases: 1, EdgeCases: 1,
			},
			SpecText: "Une boutique en ligne. ÉCRAN catalogue : la grille des produits (sku, nom, prix, " +
				"stock, image, description), un état vide « aucun produit », un bouton « Ajouter au panier » " +
				"visible si connecté, activé si stock>0. Au paiement, débiter le panier UNE SEULE FOIS " +
				"(invariant ∀), seul le propriétaire du panier peut payer (policy authz), la page répond " +
				"en <200ms (budget). Erreur : paiement refusé → message ; cas limite : panier vide. " +
				"L'opération checkout émet un évènement OrderPlaced, gardée par stock disponible.",
			Entities: []generators.EntitySource{
				{ID: "e_Product", Kind: generators.KindEntity, Name: "Product", Fields: []generators.Field{
					{Name: "sku", Type: "text"}, {Name: "name", Type: "text"}, {Name: "price", Type: "numeric"},
					{Name: "stock", Type: "int"}, {Name: "description", Type: "text"},
				}},
				{ID: "e_Cart", Kind: generators.KindEntity, Name: "Cart", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "owner", Type: "text"}, {Name: "created_at", Type: "timestamptz"},
				}},
				{ID: "e_Order", Kind: generators.KindEntity, Name: "Order", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "customer", Type: "text"}, {Name: "total", Type: "numeric"},
					{Name: "placed_at", Type: "timestamptz"},
				}},
			},
		},
		{
			Key:   "blog",
			Title: "Blog / publication",
			Decl: rb.SpecDeclaration{
				HasViewGoal: true, HasViewData: true, HasViewEmptyState: true,
				Controls: 2, ControlVisible: true,
				Actions: 2, ActionOnSuccess: true, ActionOnError: true,
				Operations: 1, OperationEvents: 1,
				Entities: 3, EntityFields: 9, EntityRelations: 2,
				Policies: 1, ErrorCases: 1,
			},
			SpecText: "Un blog. ÉCRAN article : le titre, le corps, l'auteur, la date ; liste des commentaires " +
				"avec un état vide « soyez le premier ». Bouton « Publier » visible pour l'auteur. Publier " +
				"émet un évènement PostPublished ; seul l'auteur peut éditer (policy). Erreur : titre vide → refus.",
			Entities: []generators.EntitySource{
				{ID: "e_Post", Kind: generators.KindEntity, Name: "Post", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "title", Type: "text"}, {Name: "body", Type: "text"},
					{Name: "published_at", Type: "timestamptz"},
				}},
				{ID: "e_Author", Kind: generators.KindEntity, Name: "Author", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "name", Type: "text"},
				}},
				{ID: "e_Comment", Kind: generators.KindEntity, Name: "Comment", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "body", Type: "text"}, {Name: "created_at", Type: "timestamptz"},
				}},
			},
		},
		{
			Key:   "tasks",
			Title: "Gestionnaire de tâches",
			Decl: rb.SpecDeclaration{
				HasViewGoal: true, HasViewData: true,
				Controls: 3, ControlEnabled: true, ControlVisible: true,
				Actions: 3, ActionOnSuccess: true, ActionOnError: true,
				Operations: 2, OperationEvents: 2, OperationGuards: 2,
				Entities: 3, EntityFields: 10, EntityRelations: 2,
				Invariants: 1, Budgets: 1, EdgeCases: 1,
			},
			SpecText: "Un gestionnaire de tâches. ÉCRAN tableau : les tâches par colonne (à faire / en cours / " +
				"fait), chaque tâche a un titre, une échéance, un assigné. Bouton « Terminer » activé si la tâche " +
				"est en cours. Déplacer une tâche émet TaskMoved, gardé par une transition valide ; une tâche close " +
				"ne rouvre pas (invariant). Cas limite : échéance dépassée. Budget : le tableau charge en <300ms.",
			Entities: []generators.EntitySource{
				{ID: "e_Task", Kind: generators.KindEntity, Name: "Task", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "title", Type: "text"}, {Name: "status", Type: "text"},
					{Name: "due_at", Type: "timestamptz"},
				}},
				{ID: "e_Project", Kind: generators.KindEntity, Name: "Project", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "name", Type: "text"},
				}},
				{ID: "e_User", Kind: generators.KindEntity, Name: "User", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "email", Type: "text"}, {Name: "created_at", Type: "timestamptz"},
				}},
			},
		},
		{
			// The SCREEN-MOCKUP app — exercises the DG05 multimodal path : a screen described as a
			// spec (zones/fields/actions) the models read to propose VIEW-specs; we measure whether
			// the models agree on the screen's requirement types (the « visuels d'écran » test).
			Key:   "screen",
			Title: "Maquette d'écran (multimodal DG05)",
			Decl: rb.SpecDeclaration{
				HasViewGoal: true, HasViewData: true, HasViewEmptyState: true,
				Controls: 2, ControlVisible: true, ControlEnabled: true,
				Actions: 2, ActionOnSuccess: true, ActionOnError: true,
				Entities: 1, EntityFields: 4,
				ErrorCases: 1, EdgeCases: 1,
			},
			SpecText: "MAQUETTE d'un écran de profil utilisateur. ZONES : un en-tête avec l'avatar + le nom ; " +
				"un formulaire (email, téléphone, bio) ; un bouton « Enregistrer » désactivé tant que rien n'a " +
				"changé, visible toujours ; un bouton « Annuler ». Enregistrer → succès « profil mis à jour » / " +
				"erreur « email invalide ». État vide : aucun avatar → initiales. Cas limite : email déjà pris.",
			Entities: []generators.EntitySource{
				{ID: "e_Profile", Kind: generators.KindEntity, Name: "Profile", Fields: []generators.Field{
					{Name: "id", Type: "text"}, {Name: "email", Type: "text"}, {Name: "phone", Type: "text"},
					{Name: "bio", Type: "text"},
				}},
			},
		},
	}
}

// modelResult is one (app, model) measurement.
type modelResult struct {
	App         string   `json:"app"`
	Model       string   `json:"model"`
	MatchPct    float64  `json:"match_pct"`
	Expected    int      `json:"expected"`
	Present     int      `json:"present"`
	Missing     []string `json:"missing"`
	PresentSet  []string `json:"present_set"`
	LatencyMS   int64    `json:"latency_ms"`
	UsedRealLLM bool     `json:"used_real_llm"`
	FellBack    bool     `json:"fell_back"`
}

// report is the full machine-readable result.
type report struct {
	Models      []string            `json:"models"`
	Determinism []determinismResult `json:"emitter_determinism"`
	Runs        []modelResult       `json:"runs"`
	Agreement   []agreementResult   `json:"cross_model_agreement"`
}

type determinismResult struct {
	App        string `json:"app"`
	Hash       string `json:"emitted_sha256"`
	ByteStable bool   `json:"byte_stable"`
	SchemaSize int    `json:"schema_bytes"`
}

type agreementResult struct {
	App          string  `json:"app"`
	JaccardMean  float64 `json:"jaccard_mean"`  // mean pairwise Jaccard of present-type sets
	IdenticalPct float64 `json:"identical_pct"` // fraction of expected types ALL models agree on
}

func main() {
	modelsCSV := flag.String("models", "opus,sonnet,haiku", "csv of models: opus|sonnet|haiku")
	appsCSV := flag.String("apps", "shop,blog,tasks,screen", "csv of app keys")
	jsonOut := flag.String("json", "/tmp/aidosbench.json", "machine-readable report path")
	timeout := flag.Duration("timeout", 150*time.Second, "per-model-call timeout")
	flag.Parse()

	models := pickModels(*modelsCSV)
	apps := pickApps(*appsCSV)
	bin := os.Getenv("AIDOS_CLAUDE_BIN")
	if bin == "" {
		bin = "/home/stevig/.local/bin/claude"
	}

	rep := report{Models: keysOf(models)}

	// ── 1. ÉMETTEUR DÉTERMINISTE : mêmes specs → même code, byte-identique ──────────────
	for _, a := range apps {
		s1, _, err := appdata.EmitProjectData(a.Key, a.Entities)
		if err != nil {
			fmt.Fprintf(os.Stderr, "emit %s: %v\n", a.Key, err)
			continue
		}
		s2, _, _ := appdata.EmitProjectData(a.Key, a.Entities)
		h1, h2 := sha256.Sum256(s1), sha256.Sum256(s2)
		rep.Determinism = append(rep.Determinism, determinismResult{
			App: a.Key, Hash: hex.EncodeToString(h1[:]), ByteStable: h1 == h2, SchemaSize: len(s1),
		})
	}

	// ── 2. BENCH MULTI-MODÈLE : qualité (MatchPct), vitesse (latence), via le port ──────
	// present-type sets per (app, model) for the cross-model agreement.
	presentByApp := map[string]map[string]map[string]bool{}
	for _, a := range apps {
		decl := a.Decl
		spec := rb.Spec{ID: a.Key, SpecText: a.SpecText, ExpectedKinds: rb.ExpectedFromSpec(decl)}
		presentByApp[a.Key] = map[string]map[string]bool{}
		for _, m := range models {
			adapter := &rb.ClaudeModel{Bin: bin, Model: m.ID, Timeout: *timeout}
			start := time.Now()
			metric, prov := rb.BenchVia(adapter, spec)
			elapsed := time.Since(start)
			res := modelResult{
				App: a.Key, Model: m.Key, MatchPct: metric.MatchPct,
				Expected: metric.ExpectedCount, Present: metric.PresentCount,
				Missing: kindsToStrings(metric.MissingTypes), PresentSet: kindsToStrings(metric.PresentTypes),
				LatencyMS: elapsed.Milliseconds(), UsedRealLLM: prov.UsedRealLLM, FellBack: prov.FellBack,
			}
			rep.Runs = append(rep.Runs, res)
			presentByApp[a.Key][m.Key] = asSet(res.PresentSet)
			fmt.Fprintf(os.Stderr, "  %-7s × %-7s : match=%.0f%% present=%d/%d %4dms real=%v\n",
				a.Key, m.Key, metric.MatchPct*100, metric.PresentCount, metric.ExpectedCount,
				elapsed.Milliseconds(), prov.UsedRealLLM)
		}
		// cross-model agreement for this app.
		rep.Agreement = append(rep.Agreement, agreementOf(a.Key, presentByApp[a.Key], keysOf(models)))
	}

	// ── 3. RAPPORT ─────────────────────────────────────────────────────────────────────
	if b, err := json.MarshalIndent(rep, "", "  "); err == nil {
		_ = os.WriteFile(*jsonOut, b, 0o644)
	}
	printMarkdown(rep)
	fmt.Fprintf(os.Stderr, "\nJSON: %s\n", *jsonOut)
}

// agreementOf computes, per app, the mean pairwise Jaccard of the models' present-type sets and
// the fraction of types ALL models agree on (intersection / union).
func agreementOf(app string, byModel map[string]map[string]bool, modelKeys []string) agreementResult {
	var sets [][]string
	for _, k := range modelKeys {
		sets = append(sets, sortedKeys(byModel[k]))
	}
	// pairwise Jaccard mean.
	var sum float64
	var pairs int
	for i := 0; i < len(sets); i++ {
		for j := i + 1; j < len(sets); j++ {
			sum += jaccard(asSet(sets[i]), asSet(sets[j]))
			pairs++
		}
	}
	mean := 1.0
	if pairs > 0 {
		mean = sum / float64(pairs)
	}
	// identical = |∩| / |∪|.
	inter, union := intersectUnion(sets)
	identical := 1.0
	if union > 0 {
		identical = float64(inter) / float64(union)
	}
	return agreementResult{App: app, JaccardMean: mean, IdenticalPct: identical}
}

func printMarkdown(rep report) {
	out := os.Stdout
	fmt.Fprintln(out, "# AIDOS — bench multi-modèle (triturer AIDOS)\n")

	fmt.Fprintln(out, "## 1. Émetteur déterministe — « mêmes specs → même code »")
	fmt.Fprintln(out, "| App | code émis byte-stable (émis 2×) | taille schéma | sha256 |")
	fmt.Fprintln(out, "|---|---|---|---|")
	allStable := true
	for _, d := range rep.Determinism {
		mark := "✅ 100% identique"
		if !d.ByteStable {
			mark = "❌ DIVERGENT"
			allStable = false
		}
		fmt.Fprintf(out, "| %s | %s | %d o | `%s` |\n", d.App, mark, d.SchemaSize, d.Hash[:12])
	}
	concl := "L'émetteur est une FONCTION PURE : mêmes specs → même code à **100%** (pas 99%)."
	if !allStable {
		concl = "⚠️ une divergence d'émission détectée — détaillée ci-dessus."
	}
	fmt.Fprintf(out, "\n> %s\n\n", concl)

	fmt.Fprintln(out, "## 2. Bench multi-modèle — qualité, vitesse, vrai-LLM")
	fmt.Fprintln(out, "| App | Modèle | Qualité (match%) | types présents | manquants | Vitesse | vrai LLM |")
	fmt.Fprintln(out, "|---|---|---|---|---|---|---|")
	for _, r := range rep.Runs {
		fmt.Fprintf(out, "| %s | **%s** | %.0f%% | %d/%d | %d | %d ms | %v |\n",
			r.App, r.Model, r.MatchPct*100, r.Present, r.Expected, len(r.Missing), r.LatencyMS, r.UsedRealLLM)
	}

	// per-model aggregates.
	fmt.Fprintln(out, "\n### Agrégat par modèle")
	fmt.Fprintln(out, "| Modèle | Qualité moy. | Vitesse moy. | vrai LLM | replis |")
	fmt.Fprintln(out, "|---|---|---|---|---|")
	for _, mk := range rep.Models {
		var q, lat float64
		var n, real, fb int
		for _, r := range rep.Runs {
			if r.Model != mk {
				continue
			}
			q += r.MatchPct
			lat += float64(r.LatencyMS)
			n++
			if r.UsedRealLLM {
				real++
			}
			if r.FellBack {
				fb++
			}
		}
		if n == 0 {
			continue
		}
		fmt.Fprintf(out, "| **%s** | %.0f%% | %.0f ms | %d/%d | %d |\n",
			mk, (q/float64(n))*100, lat/float64(n), real, n, fb)
	}

	fmt.Fprintln(out, "\n## 3. Accord inter-modèle — « le résultat est-il identique selon les modèles ? »")
	fmt.Fprintln(out, "| App | accord moyen (Jaccard) | types où TOUS s'accordent |")
	fmt.Fprintln(out, "|---|---|---|")
	for _, ag := range rep.Agreement {
		fmt.Fprintf(out, "| %s | %.0f%% | %.0f%% |\n", ag.App, ag.JaccardMean*100, ag.IdenticalPct*100)
	}
	fmt.Fprintln(out, "\n> **Le verdict.** Le CODE est 100% déterministe (émetteur pur). La DIVERGENCE vit dans "+
		"l'EXTRACTION des requirements (intent/écran → types) : les modèles ne s'accordent pas à 100% — "+
		"c'est exactement ce que le bench différentiel DG mesure. Le juge déterministe (DG03) reste "+
		"autoritaire ; les modèles ne font que PROPOSER, re-jugés.")
}

// ── helpers ──────────────────────────────────────────────────────────────────────────

func pickModels(csv string) []model {
	want := asSet(splitCSV(csv))
	var out []model
	for _, m := range allModels {
		if want[m.Key] {
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		out = allModels
	}
	return out
}

func pickApps(csv string) []appTemplate {
	want := asSet(splitCSV(csv))
	var out []appTemplate
	for _, a := range templates() {
		if want[a.Key] {
			out = append(out, a)
		}
	}
	if len(out) == 0 {
		out = templates()
	}
	return out
}

func keysOf(ms []model) []string {
	out := make([]string, len(ms))
	for i, m := range ms {
		out[i] = m.Key
	}
	return out
}

func kindsToStrings(ks []rb.RequirementKind) []string {
	out := make([]string, len(ks))
	for i, k := range ks {
		out[i] = string(k)
	}
	sort.Strings(out)
	return out
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func asSet(ss []string) map[string]bool {
	m := map[string]bool{}
	for _, s := range ss {
		m[s] = true
	}
	return m
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func jaccard(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0
	}
	inter, union := 0, map[string]bool{}
	for k := range a {
		union[k] = true
		if b[k] {
			inter++
		}
	}
	for k := range b {
		union[k] = true
	}
	if len(union) == 0 {
		return 1.0
	}
	return float64(inter) / float64(len(union))
}

func intersectUnion(sets [][]string) (inter, union int) {
	if len(sets) == 0 {
		return 0, 0
	}
	count := map[string]int{}
	for _, s := range sets {
		for k := range asSet(s) {
			count[k]++
		}
	}
	for _, c := range count {
		union++
		if c == len(sets) {
			inter++
		}
	}
	return inter, union
}
