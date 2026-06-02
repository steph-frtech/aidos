// Package qd is the Archive's QUALITY-DIVERSITY selection (KRD §62, algorithm ②): the pure
// MAP-Elites placement that reads the version DAG as evolutionary memory. It keeps ONE élite
// per behavioral NICHE — a Pareto front of cells, NOT one global champion — so the archive is
// DIVERSITY, not just the current best. The version DAG and the QD archive are ONE structure
// (a variant = a branch, a stepping stone = a kept ancestor, a niche = a parallel branch, an
// élite = a kept stable phase).
//
// THE KEYSTONE (KRD §62, §66.2, §123): a variant enters a niche ONLY IF it has a GREEN MIRROR.
// The Judge is the DETERMINISTIC mirror — NEVER an LLM scoring its own copy, NEVER CellVitality
// (which is §66.2 diagnostic, never a promotion fitness). A champion replaces the niche élite
// ONLY IF it beats it on the SAME ANCHORED fitness (mirror red→green ∧ computational sensors ∧
// out-of-sample) — the fitness is CONSUMED from the prior fitness/sensor steps, never coined
// here (anti-Goodhart, CLAUDE.md §8). A red-mirror variant is never promoted, WHATEVER its
// fitness number — the score never overrides the mirror.
//
// PURE (CLAUDE.md §6/§8 determinism-first): Niche and Elites are TOTAL, deterministic functions
// of the input variants — no DB, no clock, no rng, no I/O, NO WRITE, no learned embedding (the
// niche descriptor is DECLARED). Same input ⇒ same map[nicheKey]Variant. They NEVER invent a
// niche key or a fitness — every élite traces to a real input variant. They NEVER PANIC on a
// malformed variant (an empty niche, a nil) — they yield a result, never a crash. The rapid
// property mirror pins determinism, no-green⇒no-élite, one-élite-per-niche, max-anchored-fitness
// wins, no-invented-niche/fitness, and totality.
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package writes nothing. Elites returns
// the map VALUE; recording a niche élite into dag.niche_elite (a truth schema ABOVE the line) is
// done ONLY through the privileged `aidos` writer role inside an approved ChangeSet (S20) — a
// new élite is a NEW row (append-only), never an UPDATE, never the agent role.
package qd

// MirrorStatus is a variant's mirror verdict — the DETERMINISTIC Judge (KRD §62/§123). Only a
// GREEN mirror admits a variant into a niche; anything else is excluded WHATEVER the fitness.
type MirrorStatus string

const (
	// MirrorGreen — the variant's mirror is green: the ONLY status that admits it into a niche.
	MirrorGreen MirrorStatus = "green"
	// MirrorRed — the variant's mirror is red: NEVER promoted, whatever its fitness (the anchor).
	MirrorRed MirrorStatus = "red"
)

// Variant is one candidate in the QD archive (a branch in the version DAG): its node id, its
// DECLARED behavioral niche descriptor, its mirror verdict (the deterministic Judge), and its
// ANCHORED fitness (consumed from the prior fitness steps, never coined here). All fields are
// handed in — qd never fetches, never reads a clock, never re-derives the fitness.
type Variant struct {
	// ID is the variant's node id / content address (S02) — traces to a real DAG node, never invented.
	ID string `json:"id"`
	// Niche is the DECLARED behavioral descriptor (the niche key) — e.g. "createOrder/discount".
	// It is a stable, sortable key (the mirrors a variant reflects + its authority band), NOT a
	// learned embedding (KRD §62 — the niche grammar is declared).
	Niche string `json:"niche"`
	// Mirror is the variant's mirror verdict — the deterministic Judge. Only green admits it.
	Mirror MirrorStatus `json:"mirror"`
	// Fitness is the ANCHORED fitness consumed from the prior fitness/sensor steps (mirror red→green
	// ∧ computational sensors ∧ out-of-sample). Higher beats lower WITHIN a niche, both green.
	// Never re-derived or coined here.
	Fitness float64 `json:"fitness"`
}

// Niche is the PURE behavioral descriptor of a variant (KRD §62): it returns the DECLARED niche
// key the variant already carries. It is NOT a learned embedding — the niche grammar is declared
// upstream and rides on the variant. Total: an empty descriptor returns "" (the unnamed niche),
// never a panic. (Niche is the seam where a richer declared descriptor grammar would plug in — a
// later step; here a variant carries its own key.)
func Niche(v Variant) string {
	return v.Niche
}

// Elites is the PURE MAP-Elites selection (KRD §62, algorithm ②). It returns ONE élite per
// niche — the keystone rule made executable:
//
//   - a variant is a CANDIDATE for its niche ONLY IF its mirror is GREEN (the deterministic Judge,
//     never an LLM, never CellVitality). A red-mirror variant is NEVER an élite, WHATEVER its
//     fitness (the anti-Goodhart anchor — the score never overrides the mirror).
//   - among the green candidates of a niche, the élite is the one with the MAX ANCHORED fitness
//     (consumed, never coined). Ties break deterministically by the smaller id so the result is
//     byte-stable.
//   - exactly ONE élite per niche (MAP-Elites — a Pareto front of cells, never one global champion);
//     a niche whose only candidates have red mirrors has NO élite (an empty cell — "no promotion
//     without a green mirror" made visible).
//
// It NEVER invents a niche key or a fitness — every élite is a real input variant returned
// verbatim. It is total/deterministic and never panics (a nil/empty slice yields an empty map).
func Elites(variants []Variant) map[string]Variant {
	out := map[string]Variant{}
	for _, v := range variants {
		// The keystone: only a GREEN mirror admits a variant into a niche (KRD §62/§123). The Judge
		// is the deterministic mirror — a red variant is skipped WHATEVER its fitness.
		if v.Mirror != MirrorGreen {
			continue
		}
		cur, ok := out[v.Niche]
		if !ok {
			out[v.Niche] = v
			continue
		}
		// A champion replaces the niche élite ONLY IF it beats it on the SAME anchored fitness; ties
		// break by the smaller id (deterministic, byte-stable). It never re-derives the fitness.
		if v.Fitness > cur.Fitness || (v.Fitness == cur.Fitness && v.ID < cur.ID) {
			out[v.Niche] = v
		}
	}
	return out
}
