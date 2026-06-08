// Package library is the AIDOS Mirror engine of S70 — « LA LIBRAIRIE DE MIROIRS PAR PROJET »: the
// user's mirrors listed BY APP with liveness, plus the completeness/monster detection SCOPED TO ONE
// PROJECT (ROADMAP-app-builder S70; KRD §29, §33, §34, LIVRE XXII §126-§127).
//
// THE STEP. S06 (records) computes the completeness law over a GLOBAL cut of mirrors ⋈ kernel; S12
// (completeness) turns that verdict into a Stop gate. S70 is the next gesture: in the multi-project
// AIDOS each user builds their OWN app, so the mirror library and the monster hunt must be SCOPED to
// a single project — « les miroirs du user listés par app ». S70 tags each layer/mirror with the
// project that owns it, GROUPS the mirrors per app with their liveness, and runs the SAME bicephalous
// law restricted to one project's cut.
//
// THE PROJECT IS THE SCOPE. A ProjectMirror / ProjectLayer is a records.Mirror / records.Layer plus
// the owning ProjectID. ScopeTo(projectID) projects the global library down to exactly one project's
// cut (the layers it owns ∧ the mirrors it owns) — never another project's rows (the S55 RLS
// isolation made deterministic in pure code). The monster set is then ComputeCompleteness over THAT
// cut alone: a truth without a living mirror, or an orphan mirror, WITHIN the project.
//
// THE ORPHAN IS SCOPED TOO. A mirror in project A that reflects a layer owned by project B is an
// ORPHAN within A — project B's layers are NOT visible inside A's cut, so the cross-project reflect
// is a monster (no_orphan_mirror). This is the heart of the project-scoped detector: scope is not a
// cosmetic filter, it changes the verdict (a cross-project mirror is a monster the global cut would
// have hidden). The fault-injection mirror pins exactly this.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ScopeTo, ListByApp and ScopedCompleteness are PURE, TOTAL,
// DETERMINISTIC — same library → same scoped cut → same monster set (sorted). No clock, no rng, no
// I/O, never an LLM. The detector REUSES records.ComputeCompleteness verbatim (it does not re-derive
// or re-type the law). The reproducibility property mirror pins same input → same output.
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over a projection of the
// project-tagged mirrors ⋈ kernel (passed in). It writes NOTHING above the waterline; the agent role
// has no GRANT to kernel/mirrors. The predicates return the monster set, never a boolean they then
// satisfy (anti-Goodhart). Project isolation is enforced at the wall (S55 RLS) AND made explicit
// here as a deterministic scope of a value.
package library

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// ProjectID identifies the app (project) that owns a layer or a mirror — the scope of the library
// and the monster hunt (the S55 multi-project isolation key).
type ProjectID string

// ProjectLayer is a kernel layer TAGGED with the project that owns it (the read-model the library
// groups and scopes by). The Layer is the S06 read-model verbatim; Project is the owning app.
type ProjectLayer struct {
	Project ProjectID     `json:"project"`
	Layer   records.Layer `json:"layer"`
}

// ProjectMirror is a Mirror TAGGED with the project that owns it (« les miroirs du user listés par
// app »). The Mirror is the S06 typed record verbatim; Project is the owning app.
type ProjectMirror struct {
	Project ProjectID      `json:"project"`
	Mirror  records.Mirror `json:"mirror"`
}

// Library is the whole multi-project mirror library: every project-tagged layer and mirror. It is
// the global value S70 scopes DOWN to a single project — never the cut the law runs on directly.
type Library struct {
	Layers  []ProjectLayer  `json:"layers"`
	Mirrors []ProjectMirror `json:"mirrors"`
}

// AppMirrors is the per-app listing of mirrors with their liveness (« les miroirs du user listés par
// app avec liveness »). Mirrors are sorted deterministically; Alive/Dead are the liveness tallies so
// the panel can render the green/red split at a glance.
type AppMirrors struct {
	Project ProjectID        `json:"project"`
	Mirrors []records.Mirror `json:"mirrors"`
	Alive   int              `json:"alive"`
	Dead    int              `json:"dead"`
}

// ListByApp groups the library's mirrors BY APP, each with its liveness tally — the project-scoped
// mirror listing of S70. PURE, TOTAL, DETERMINISTIC: apps are sorted by ProjectID, mirrors within an
// app by their sort key, so the same library always yields the same listing. A mirror counts toward
// Alive iff it is living (alive ∧ executable cert_language, KRD §805); otherwise it is Dead.
func ListByApp(lib Library) []AppMirrors {
	byApp := make(map[ProjectID][]records.Mirror)
	for _, pm := range lib.Mirrors {
		byApp[pm.Project] = append(byApp[pm.Project], pm.Mirror)
	}
	out := make([]AppMirrors, 0, len(byApp))
	for proj, mirrors := range byApp {
		sort.Slice(mirrors, func(i, j int) bool { return mirrorSortKey(mirrors[i]) < mirrorSortKey(mirrors[j]) })
		var alive, dead int
		for _, m := range mirrors {
			if m.IsLiving() {
				alive++
			} else {
				dead++
			}
		}
		out = append(out, AppMirrors{Project: proj, Mirrors: mirrors, Alive: alive, Dead: dead})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Project < out[j].Project })
	return out
}

// ScopedCut is the projection of `mirrors ⋈ kernel` restricted to EXACTLY ONE project (the cut the
// scoped completeness law runs on). It carries the project for the content address and the verdict.
type ScopedCut struct {
	Project ProjectID        `json:"project"`
	Layers  []records.Layer  `json:"layers"`
	Mirrors []records.Mirror `json:"mirrors"`
}

// ScopeTo projects the global library down to ONE project's cut — exactly the layers it owns and the
// mirrors it owns, never another project's rows (the S55 RLS isolation as a deterministic value).
// PURE, TOTAL, DETERMINISTIC: same (library, project) → byte-identical cut. The layer/mirror slices
// are sorted so the cut — and any hash of it — is stable regardless of input order.
func ScopeTo(lib Library, project ProjectID) ScopedCut {
	var layers []records.Layer
	for _, pl := range lib.Layers {
		if pl.Project == project {
			layers = append(layers, pl.Layer)
		}
	}
	var mirrors []records.Mirror
	for _, pm := range lib.Mirrors {
		if pm.Project == project {
			mirrors = append(mirrors, pm.Mirror)
		}
	}
	sort.Slice(layers, func(i, j int) bool { return layerSortKey(layers[i]) < layerSortKey(layers[j]) })
	sort.Slice(mirrors, func(i, j int) bool { return mirrorSortKey(mirrors[i]) < mirrorSortKey(mirrors[j]) })
	return ScopedCut{Project: project, Layers: layers, Mirrors: mirrors}
}

// ScopedCompleteness runs the bicephalous completeness law (KRD §29) over ONE project's cut alone —
// the project-scoped monster detector of S70. It REUSES records.ComputeCompleteness verbatim (it
// does not re-implement the law); the only new behaviour is the SCOPE. Because project B's layers
// are absent from project A's cut, a mirror in A reflecting a B layer is reported as an orphan
// (no_orphan_mirror) — a monster the global cut would have hidden. PURE, TOTAL, DETERMINISTIC.
func ScopedCompleteness(lib Library, project ProjectID) records.Completeness {
	cut := ScopeTo(lib, project)
	return records.ComputeCompleteness(cut.Mirrors, cut.Layers)
}

// HasMonster reports whether the project's scoped cut contains at least one monster (a truth without
// a living mirror, or an orphan mirror within the project). The boolean the panel renders as the
// project's red/green health dot — derived from the verdict, never a self-satisfied flag.
func HasMonster(lib Library, project ProjectID) bool {
	return ScopedCompleteness(lib, project).Verdict == records.VerdictRedMonster
}

// layerSortKey is the total ordering key for a layer (id, version, kind) so the scoped cut is stable.
func layerSortKey(l records.Layer) string {
	return l.LayerID + "\x00" + l.Version + "\x00" + l.Kind
}

// mirrorSortKey is the total ordering key for a mirror — every field that distinguishes one row from
// another, so the listing and the scoped cut are stable even when two rows share a MirrorID.
func mirrorSortKey(m records.Mirror) string {
	return m.MirrorID + "\x00" + m.Reflects.LayerID + "\x00" + m.Reflects.Version + "\x00" +
		string(m.TestKind) + "\x00" + string(m.CertLanguage) + "\x00" + string(m.Authority) + "\x00" +
		string(m.Liveness)
}
