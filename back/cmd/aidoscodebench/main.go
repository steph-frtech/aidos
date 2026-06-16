// Command aidoscodebench answers the SHARP question: « as-tu bien 3 codes sources générés
// DIFFÉRENTS ? » — by ACTUALLY generating one per model and diffing them.
//
// THE REAL PIPELINE (≠ aidosbench, which fixed the entities and only measured requirement
// extraction). Here, for a fixed app INTENT (natural language), EACH model (opus/sonnet/haiku)
// EXTRACTS the entity spec (a JSON []entity it produces from the intent); we then run the SAME
// deterministic emitter (appdata.EmitProjectData) on EACH model's extracted spec, and DIFF the
// three generated codes. This measures « mêmes specs (intent) → même code selon les modèles ? »
// at the CODE level — not the requirement-coverage level.
//
// THE HONEST EXPECTATION. The emitter is a PURE function: same entity AST → same code (100%).
// So the cross-model CODE identity is exactly the cross-model SPEC-EXTRACTION identity: where the
// models extract the SAME entities/fields/types, the code is byte-identical; where they diverge
// (a model names it "Produit" vs "Product", or types an id "int" vs "text"), the code differs.
// This bench QUANTIFIES that — the determinism is in the emitter, the divergence is in the model.
//
// THE WALL (§2): reads + measures, writes no truth (a report). DETERMINISM-FIRST (§8): the emitter
// is the deterministic authority; the LLM is the gated exception, confined to entity extraction,
// its output PARSED deterministically (a malformed reply is a recorded failure, never a guess).
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

type model struct{ Key, ID string }

var allModels = []model{
	{"opus", "claude-opus-4-8"},
	{"sonnet", "claude-sonnet-4-6"},
	{"haiku", "claude-haiku-4-5-20251001"},
}

// the closed type set the emitter accepts (a model reply outside it is normalised to text).
var okTypes = map[string]bool{"text": true, "numeric": true, "int": true, "timestamptz": true}

type intent struct{ Key, Text string }

var intents = []intent{
	{"shop", "une boutique : des produits (sku, nom, prix, stock, description) et des commandes (id, client, total, date de passage)."},
	{"blog", "un blog : des articles (titre, corps, date de publication), des auteurs (nom), des commentaires (corps, date)."},
}

// extractedEntity is the shape a model is asked to return.
type extractedEntity struct {
	Name   string `json:"name"`
	Fields []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"fields"`
}

type genResult struct {
	Intent    string   `json:"intent"`
	Model     string   `json:"model"`
	OK        bool     `json:"ok"`
	Entities  []string `json:"entities"`    // "Name(f1:t1,f2:t2,...)" per entity, canonical
	CodeSHA   string   `json:"code_sha256"` // the emitted schema's hash
	CodeBytes int      `json:"code_bytes"`
	LatencyMS int64    `json:"latency_ms"`
	ParseErr  string   `json:"parse_err,omitempty"`
}

func main() {
	intentsCSV := flag.String("intents", "shop,blog", "csv of intent keys")
	modelsCSV := flag.String("models", "opus,sonnet,haiku", "csv of models")
	timeout := flag.Duration("timeout", 150*time.Second, "per-call timeout")
	jsonOut := flag.String("json", "/tmp/aidoscodebench.json", "machine-readable report")
	flag.Parse()

	bin := os.Getenv("AIDOS_CLAUDE_BIN")
	if bin == "" {
		bin = "/home/stevig/.local/bin/claude"
	}
	models := pick(allModels, *modelsCSV, func(m model) string { return m.Key })
	its := pick(intents, *intentsCSV, func(i intent) string { return i.Key })

	var results []genResult
	byIntent := map[string]map[string]genResult{}
	for _, it := range its {
		byIntent[it.Key] = map[string]genResult{}
		for _, m := range models {
			r := runOne(bin, m, it, *timeout)
			results = append(results, r)
			byIntent[it.Key][m.Key] = r
			fmt.Fprintf(os.Stderr, "  %-6s × %-7s : ok=%v entities=%d code=%s %dms\n",
				it.Key, m.Key, r.OK, len(r.Entities), short(r.CodeSHA), r.LatencyMS)
		}
	}

	if b, err := json.MarshalIndent(results, "", "  "); err == nil {
		_ = os.WriteFile(*jsonOut, b, 0o644)
	}
	printReport(its, models, byIntent)
	fmt.Fprintf(os.Stderr, "\nJSON: %s\n", *jsonOut)
}

// runOne asks ONE model to extract the entities, emits the code, hashes it.
func runOne(bin string, m model, it intent, timeout time.Duration) genResult {
	res := genResult{Intent: it.Key, Model: m.Key}
	prompt := "Depuis cet intent d'application, produis UNIQUEMENT un tableau JSON d'entités " +
		"(aucun texte autour, pas de ```), format exact " +
		`[{"name":"Nom","fields":[{"name":"champ","type":"text|numeric|int|timestamptz"}]}]. ` +
		"Un seul type par champ, dans cet ensemble fermé. Intent : " + it.Text
	start := time.Now()
	out, err := shell(bin, m.ID, prompt, timeout)
	res.LatencyMS = time.Since(start).Milliseconds()
	if err != nil {
		res.ParseErr = "shell: " + err.Error()
		return res
	}
	ents, perr := parseEntities(out)
	if perr != nil {
		res.ParseErr = perr.Error()
		return res
	}
	srcs := toEntitySources(ents)
	schema, _, eerr := appdata.EmitProjectData(it.Key, srcs)
	if eerr != nil {
		res.ParseErr = "emit: " + eerr.Error()
		return res
	}
	h := sha256.Sum256(schema)
	res.OK = true
	res.Entities = canonicalEntities(ents)
	res.CodeSHA = hex.EncodeToString(h[:])
	res.CodeBytes = len(schema)
	return res
}

func shell(bin, modelID, prompt string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "--print", "--model", modelID, prompt)
	out, err := cmd.Output()
	return string(out), err
}

// parseEntities extracts the JSON array from a model reply (tolerating ``` fences / prose around it).
func parseEntities(s string) ([]extractedEntity, error) {
	a := strings.Index(s, "[")
	b := strings.LastIndex(s, "]")
	if a < 0 || b <= a {
		return nil, fmt.Errorf("no json array in reply")
	}
	var ents []extractedEntity
	if err := json.Unmarshal([]byte(s[a:b+1]), &ents); err != nil {
		return nil, fmt.Errorf("json: %v", err)
	}
	if len(ents) == 0 {
		return nil, fmt.Errorf("empty entity set")
	}
	return ents, nil
}

func toEntitySources(ents []extractedEntity) []generators.EntitySource {
	var out []generators.EntitySource
	for _, e := range ents {
		name := sanitise(e.Name)
		if name == "" {
			continue
		}
		var fields []generators.Field
		for _, f := range e.Fields {
			fn := sanitiseField(f.Name)
			t := strings.ToLower(strings.TrimSpace(f.Type))
			if !okTypes[t] {
				t = "text" // a type outside the closed set → text (the emitter's safe default)
			}
			if fn != "" {
				fields = append(fields, generators.Field{Name: fn, Type: t})
			}
		}
		if len(fields) == 0 {
			fields = []generators.Field{{Name: "id", Type: "text"}}
		}
		out = append(out, generators.EntitySource{ID: "e_" + name, Kind: generators.KindEntity, Name: name, Fields: fields})
	}
	return out
}

// canonicalEntities renders each entity as "Name(f1:t1,f2:t2)" (sorted) for the spec-divergence view.
func canonicalEntities(ents []extractedEntity) []string {
	var out []string
	for _, e := range ents {
		var fs []string
		for _, f := range e.Fields {
			fs = append(fs, sanitiseField(f.Name)+":"+strings.ToLower(strings.TrimSpace(f.Type)))
		}
		sort.Strings(fs)
		out = append(out, sanitise(e.Name)+"("+strings.Join(fs, ",")+")")
	}
	sort.Strings(out)
	return out
}

func printReport(its []intent, models []model, by map[string]map[string]genResult) {
	out := os.Stdout
	fmt.Fprint(out, "# AIDOS — 3 modèles → 3 specs → 3 CODES : sont-ils identiques ?\n\n")
	fmt.Fprintln(out, "Chaque modèle EXTRAIT le spec d'entités depuis le MÊME intent ; le MÊME émetteur")
	fmt.Fprintln(out, "déterministe émet depuis CHAQUE spec ; on diffe les codes. (L'émetteur est pur :")
	fmt.Fprintln(out, "l'identité du code = l'identité de l'extraction du spec.)\n")

	fmt.Fprintln(out, "## Code émis par (intent × modèle) — hash + identité croisée")
	fmt.Fprintln(out, "| Intent | Modèle | extraction ok | entités | code sha256 | latence |")
	fmt.Fprintln(out, "|---|---|---|---|---|---|")
	for _, it := range its {
		for _, m := range models {
			r := by[it.Key][m.Key]
			ok := "✅"
			if !r.OK {
				ok = "❌ " + r.ParseErr
			}
			fmt.Fprintf(out, "| %s | **%s** | %s | %d | `%s` | %d ms |\n",
				it.Key, m.Key, ok, len(r.Entities), short(r.CodeSHA), r.LatencyMS)
		}
	}

	fmt.Fprintln(out, "\n## Verdict par intent : les 3 codes sont-ils identiques ?")
	fmt.Fprintln(out, "| Intent | codes identiques ? | hashes distincts | identité code |")
	fmt.Fprintln(out, "|---|---|---|---|")
	for _, it := range its {
		var hashes []string
		var oks int
		for _, m := range models {
			r := by[it.Key][m.Key]
			if r.OK {
				hashes = append(hashes, r.CodeSHA)
				oks++
			}
		}
		distinct := distinctCount(hashes)
		ident := "—"
		verdict := "—"
		if oks >= 2 {
			if distinct == 1 {
				verdict = "✅ IDENTIQUES (100%)"
				ident = "100%"
			} else {
				verdict = fmt.Sprintf("❌ DIFFÉRENTS (%d codes distincts)", distinct)
				ident = fmt.Sprintf("%.0f%%", 100*float64(oks-distinct+1)/float64(oks))
			}
		}
		fmt.Fprintf(out, "| %s | %s | %d/%d | %s |\n", it.Key, verdict, distinct, oks, ident)
	}

	fmt.Fprintln(out, "\n## La divergence, à la ligne : ce que chaque modèle a extrait")
	for _, it := range its {
		fmt.Fprintf(out, "\n**%s** :\n", it.Key)
		for _, m := range models {
			r := by[it.Key][m.Key]
			if r.OK {
				fmt.Fprintf(out, "- `%s` → %s\n", m.Key, strings.Join(r.Entities, " · "))
			} else {
				fmt.Fprintf(out, "- `%s` → (échec : %s)\n", m.Key, r.ParseErr)
			}
		}
	}
	fmt.Fprintln(out, "\n> **La leçon.** L'émetteur garantit : même SPEC → même code (100%). Mais des modèles "+
		"différents EXTRAIENT des specs différents du même intent (noms, champs, types) → des codes "+
		"DIFFÉRENTS. C'est pourquoi AIDOS ne laisse PAS un modèle décider du spec en bout de chaîne : "+
		"le réducteur déterministe (la grammaire) + le mur (idée→miroir→/goal) ramènent l'intent à UN "+
		"spec gouverné. Le modèle PROPOSE, le déterministe DISPOSE — sinon, pas de reproductibilité.")
}

// ── helpers ──────────────────────────────────────────────────────────────────────────

func pick[T any](all []T, csv string, key func(T) string) []T {
	want := map[string]bool{}
	for _, p := range strings.Split(csv, ",") {
		if p = strings.TrimSpace(p); p != "" {
			want[p] = true
		}
	}
	var out []T
	for _, x := range all {
		if want[key(x)] {
			out = append(out, x)
		}
	}
	if len(out) == 0 {
		return all
	}
	return out
}

func sanitise(s string) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func sanitiseField(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' {
			b.WriteRune('_')
		}
	}
	return strings.Trim(b.String(), "_")
}

func distinctCount(ss []string) int {
	m := map[string]bool{}
	for _, s := range ss {
		m[s] = true
	}
	return len(m)
}

func short(h string) string {
	if len(h) >= 12 {
		return h[:12]
	}
	return h
}
