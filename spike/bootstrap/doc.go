// Package bootstrap — THROWAWAY (DP10 spike, ratchet OFF, rigor T0, /spike zone only).
//
// The probe: BEFORE writing DP11-DP13, prove BY MEASUREMENT that a deterministic
// one-shot emitted bootstrap (network→volumes→.env→secrets-check→port-resolution→
// ordered-start→healthchecks→print-URLs) beats calling /data/dockers/deploy.sh
// directly. Three candidates compared (≤3, declared criteria, a feature COUNT —
// never an opinion):
//
//	A. native Go deterministic bootstrap emitter (the plan is data, executed pure);
//	B. non-interactive wrapper around deploy.sh (pipe answers into its prompts);
//	C. direct call of /data/dockers/deploy.sh (interactive select/read).
//
// What is measured (never declared):
//   - port resolution is a PURE FUNCTION of the observed host state (`ss -ltn` +
//     `docker ps` outputs parsed as data): same snapshot → same resolved port,
//     never an interactive choice;
//   - start order is a PURE FUNCTION of the bundle's service roles (traefik →
//     datastore → server), deterministic under permutation of the input;
//   - a REAL throwaway run: an emitted bundle + a throwaway bootstrap starts
//     traefik→datastore→server in that order against the local Docker daemon,
//     healthchecks go green (pg_isready / TCP / HTTP-200 through traefik),
//     URLs are printed — and the run is REPRODUCIBLE (run twice: identical
//     ordered event kinds, identical resolved port);
//   - deploy.sh interactivity and coupling are MEASURED on its bytes: count of
//     `select`/`read -rp` prompts, count of hardcoded /data/dockers references.
//
// Verdict = a pure boolean conjunction over these measurements, NEVER an LLM
// opinion. Go → DP12 emits the real one-shot bootstrap; no-go → direct reuse of
// deploy.sh is documented and DP11-DP13 are not written.
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING above the line — no
// kernel/mirrors/fitness, no GRANT, no persistence. The throwaway containers are
// namespaced dp10spike-* on their own network and torn down. /harvest PROPOSES a
// DraftIdea record; the human freezes later via /goal.
package bootstrap
