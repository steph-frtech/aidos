# AIDOS Kernel

The frozen, human-anchored truth of a managed project: a small, growing set of executable, falsifiable constraints that constrains AI-written code but never generates it. The **intention** head of the bicephalous truth; it physically contains the **Mirror plane** (`back/kernel/mirror/`), the **proof** head co-versioned with it.

## Language

**noyau (Kernel)**:
The small set of executable, human-frozen, falsifiable constraints — predicates, schemas, thresholds, data-shapes, invariants, fixtures, contracts, ubiquitous language — over the behaviour space. Append-only, content-addressed, AI-never-writes; the intention head.
_Avoid_: spec (the spec is one part of it), config, golden-master, "core" (generic), prose document.

**Layer (la couche)**:
The single KRD meta-type from which every truth is built; UI, entity, API, button, operation, policy are its `kind` values. Carries `kind`, `truth_artifact`, `owner`, `authority`, `role`, `sensor`, `zone`, `links`, `rigor`, `generator`, `composes`, `own_mirror`, `activation_threshold`.
_Avoid_: level, tier, N-rung (those are values of a Layer, not the type), component.

**composes (7th link) / vérité compositionnelle**:
The mereology link — a whole contains a part — versioned and weighted (load-bearing | cosmetic), where `truth(composite) = Σ truths(parts) + own emergent truth`. Down is a constraint the agent reconciles; up is a signal that may need human override; weights are declared, never learned.
_Avoid_: has-a, contains (generic), backpropagation.

**source / projection (shared)**:
Source = frozen human truth above the waterline (product, journey, view, control, action, operation, policy, entity, mirror). Projection = AI-derived, disposable, ratcheted code below it, guarded by a mirror; the Kernel owns the sources, projections live outside it.
_Avoid_: input/output, build artifact, generated-vs-handwritten.

**idée (idea)**:
The entry stage above product: a candidate-truth with the form of a truth but no freeze and no mirror. Promoted into the Kernel by writing its mirror (the `/goal`); its two sources are human and reality.
_Avoid_: feature request, ticket, backlog item, requirement.

**epistemic typing**:
The four attributes that qualify every Kernel truth: `truth_kind` (what kind of claim), `TruthScope` (where/when/for-whom it holds), `VerifiabilityLevel` (how strongly it can be proven), and `AuthorityGraph` admission (who approves, vetoes, escalates). Every above-the-line truth carries an explicit authority owner.
_Avoid_: metadata, tags, type annotations (generic).

**contracts / ports**:
Derived boundary ports (e.g. `api.pact`, `types.zod`) declared inside the Kernel as frozen, versioned N3 contracts, born from the domain's need. The contract artifact is Kernel-owned source; a shipped client SDK is a separate emitted projection.
_Avoid_: API (generic), interface (generic), the emitted SDK (that is a projection).

## Mirror plane

The Mirror is a plane inside this context at `back/kernel/mirror/`, not a separate subsystem; Kernel and Mirror are one bicephalous unit, co-versioned and joined by the `mirrors` link and the completeness law.

**miroir (Mirror)**:
The executable proof of a truth, typed by a certification language and runnable as a deterministic sensor. The non-gameable fitness anchor and deterministic Judge, above the waterline and out of AI reach; the proof head.
_Avoid_: test (generic), assertion, a `test` attribute on a layer, preuve (kept as alias).

**bicéphale (bicephalous)**:
One body (the truth) with two heads — intention in the Kernel spec, proof in the Mirror — inseparable and joined by the `mirrors` link. Not bicameral: a head cannot live detached from the body.
_Avoid_: bicaméral (historical alias), two-house, MVC.

**le monstre (monster)**:
A spec without a mirror, or an orphan mirror — a body without a head, or a head without a body. Exactly what the completeness law forbids and what fault injection hunts.
_Avoid_: dead mirror / miroir mort (now an alias), bug, broken test.

**loi de complétude (completeness law)**:
The law that every spec layer has at least one living mirror executable as a deterministic sensor; recursive, so an aggregate is GREEN iff its own mirror is GREEN and every composes-child aggregate is GREEN.
_Avoid_: coverage requirement, definition of done.

**out-of-sample / RealityMirror**:
Non-gameable evaluation on never-seen data or live reality (prod metrics, incidents, OOS, walk-forward, Monte-Carlo). One of the four non-gameable anchors (mirror, out-of-sample, reality, fault injection).
_Avoid_: validation set, monitoring (generic), staging check.

**test-as-goal / test-as-means**:
test-as-goal = the human-written mirror above the line that DEFINES the truth (it becomes the `/goal`); test-as-means = the agent's inner tests below the line. The agent may write means-tests but never truth-tests — that circularity is the wall.
_Avoid_: unit vs acceptance (generic), spec test vs unit test.

**ligne de flottaison (waterline)**:
The above/below partition that runs through this context: above it the Mirror and Kernel spec are human-anchored truth out of AI reach; below it AI self-certifies projections. Immutable, part of NIVEAU 3.
_Avoid_: threshold, cutoff, boundary (generic).
