// Package stackmanifest — THROWAWAY (DP01 spike, ratchet OFF, rigor T0, /spike zone only).
//
// The probe: BEFORE engraving anything (DP02+), prove BY MEASUREMENT that declaring the
// emitted-app stack as a content-addressed Kernel SOURCE (a StackManifest governed by the
// wall) carries its value against a plain static /data/dockers template.
//
// What is measured (never declared):
//   - byte-identity: a minimal StackManifest → a throwaway pure emitter → a docker-compose.yml
//     honouring the /data/dockers conventions; re-emission N times = identical bytes
//     (hash equality, the reproducibility measure);
//   - round-trip: the emitted compose parses back to the manifest's topology (no information
//     invented, none lost);
//   - drift detection: a one-byte hand-edit of the emitted artifact is DETECTED by source-hash
//     (manifest path) and UNDETECTABLE on the static-template path (no recorded hash) — the
//     versioning/audit/anti-overwrite payoff the source brings;
//   - form fit: ≤3 candidate forms (record kind / TruthScope dimension / pure projection)
//     scored against DECLARED criteria (carries-body, content-addressed, wall-governed,
//     append-only) — a feature count, never an opinion.
//
// Verdict = a pure function of these measurements (hash equal/unequal, boolean conjunction),
// NEVER an LLM opinion. Go → DP02 engraves the source; no-go → an abandon ADR and the DP
// roadmap stops honestly at DP01.
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING — no kernel/mirrors/fitness, no GRANT,
// no persistence. /harvest PROPOSES a DraftIdea record; the human freezes later via /goal.
package stackmanifest
