// Package harness is the CLOSED catalogue of composable harness fragments the
// generator ASSEMBLES per topology — never a bare skeleton (ADR 0082, KRD LIVRE
// IX §48, the keystone application of Ashby's law §136).
//
// THE PROMISE (Tome §48). « Un générateur n'instancie pas un squelette — il
// instancie *une topologie + son harness*. » And the critical nuance, engraved
// verbatim: « une vraie app est une *composition* de topologies, jamais une
// seule… des fragments de harness composables (chacun = un set de sensors + un
// golden path) que le sélecteur *assemble*. Tu réduis la variété par fragment,
// pas par app entière. » Committing to a topology is an ACT OF VARIETY REDUCTION
// (Ashby §136): a regulator must hold at least as much variety as the system it
// governs; pinning a topology makes a COMPLETE harness reachable.
//
// WHAT A HarnessFragment IS (ADR 0082 §19). A pure, content-addressed bundle
// {guides, sensors, golden_path} attached to ONE topology family:
//
//   - Guides      — FEEDFORWARD: the invariants the topology is expected to hold
//     (the named expectations a generator should honour, e.g. CRUD must carry
//     identity / validation / transitions / audit).
//   - Sensors     — FEEDBACK: the DETERMINISTIC `computational` detectors that
//     verify those invariants on an observed cell. A sensor that never fires is
//     dead (§6 hook-honesty) — so every sensor here is checkable and every
//     fragment ships a fault-injection (break the invariant ⇒ the sensor reddens).
//   - GoldenPath  — the reference path of the topology (the canonical happy flow).
//
// THE TOPOLOGY FAMILIES are a CLOSED enum aligned on the Tome §48:
// `crud` · `workflow` · `event-processor` · `dashboard`. A fifth family enters
// ONLY by an explicit ADR (the méta-loop only ADDs a topology, never removes one
// — ADR 0082 §27, KRD §1447). An unknown topology is FAIL-CLOSED (refused), never
// a default skeleton.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock, no RNG, no map-order leak. A fragment's content
// address reuses S02 records.Hash over records.Canonicalize of the fragment body
// (S02 reused, never forked) — same fragment ⇒ byte-identical address, the
// reproducibility mirror. The selector ASSEMBLES (T2), it never single-selects:
// its input is a *set* of topologies, never a scalar (§21) — but T1 ships only
// the fragment substrate + one concrete `crud` fragment.
//
// THE WALL (CLAUDE.md §2). A fragment is an artefact ABOVE the line in the `kind`
// registry sense (KRD §92): it is PROPOSED via idée→/goal, never written in
// passing. This package is below-the-line Runtime PLUMBING — it BUILDS fragments
// as pure projections (regenerable), it writes NO truth (no kernel/mirrors/
// fitness write), it imports records only to read its content-address scheme.
package harness
