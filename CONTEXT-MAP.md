# AIDOS — Context Map

AIDOS is the product (an "AI Development Operating System"); KRD is the method it implements. This repo is the OS itself: a backend engine under `back/` and the OS's own UI under `front/web/`. Per-context glossaries live in each context's `CONTEXT.md`.

## Shared language

**AIDOS**:
The runnable product — "AI Development Operating System". The concrete system in this repo that implements and enforces the KRD method.
_Avoid_: using "AIDOS" and "KRD" interchangeably.

**KRD**:
The method AIDOS implements — _Kernel-Ratchet Development_. The discipline of a small human-anchored kernel of executable truth, freely-evolving AI-written code that the kernel ratchets, and a mirror that proves each truth. Defined in full in `KRD.md`.
_Avoid_: treating KRD as a product or a directory; it is the methodology, not the tool.

**FKE (Fractal Kernel Engineering)**:
The universal discipline of which KRD is the software-product method and AIDOS the reference runtime (FKE ⊃ KRD ⊃ AIDOS). Lives INSIDE the Tome as `KRD.md` LIVRE XXX (ADR 0044). Its core is the **symmetric kernel anatomy**: ten slots mirrored around the wall, the wall being both the write-barrier and a *language frontier* (only the two code slots speak machine).
_Avoid_: "Fractal Kernel Vibing"/FKV (the vibe is a contained phase — the Vibe Lab —, not the discipline's name); treating FKE as a separate founding document (it is fused into the Tome).

**Paire-miroir (mirror pair)**:
One of the four reflected slot pairs of the kernel anatomy: spec↔doc (s1↔s10), use-case↔code-derived-doc (s2↔s9, the *doc-miroir*), human-data-model↔data-projection (s3↔s7, the *data-miroir*), scenario↔test+result (s4↔s5/s6). The judge is a structural set comparison; prose divergence is advisory only.
_Avoid_: reducing "miroir" to tests — the test pair is one family of four.

**Conscience**:
The deterministic AGGREGATOR composing the verdicts of the existing judges (mirror runner, completeness/monster, SemanticDiff, RealityMirror, sensors, ledger) into one consciousness report per kernel + decision cards. It compares the mirror pairs; it never judges on its own.
_Avoid_: an active LLM "alignment governor" that evaluates — that is the second-agent-as-proof the method forbids (§8).

**Kernel effondré (collapsed kernel)**:
A leaf kernel that collapses its derivable slots (s2/s3 into s1; s9/s10 derived; s8 absent). Incompressible minimum: **s1 (intent, even one line) + the proof pair (s4↔s5/s6)**.
_Avoid_: collapsing the proof pair (reintroduces the monster); forcing all ten slots onto a three-line function (the ×10 tax).

**Workbench UI (`front/web/`)**:
AIDOS's own operating interface — the visual governance surface of the OS. This is what `front/web/` is.
_Avoid_: confusing it with a web app that AIDOS *emits* for an end user (see Emitted projection).

**Emitted projection / target**:
Code AIDOS generates when someone _uses_ the OS to build their app (web / mobile / cli / api / db). It lives in that user's workspace, produced by a Runtime generator. It is **not** a directory of this repo.
_Avoid_: putting "ui-web" / "ui-mobile" built-app directories in this repo and calling them AIDOS's frontend.

**AIDOS truth-store (Postgres)**:
The OS's own governance base — `kernel · mirrors · ideas · changesets · dag · brain · context · fitness`, append-only and content-addressed, written only at human-approval cadence through an approved changeset. Always **Postgres** (pgvector for brain; sqlc/pgx/Atlas; the wall via GRANTs). See ADR 0004.
_Avoid_: putting an emitted application's runtime data here; using Doltgres (beta) for it.

**Emitted-app datastore (Doltgres)**:
The **runtime database of an application AIDOS builds for a user** — lives in that user's workspace, not in this repo. **Doltgres** (Dolt's Postgres-wire build) is the first-class data-versioning **emitter target** for it: git-for-data (branch / merge / diff / time-travel) on the *built product's* data, in the **same Postgres dialect** as the truth-store — so the emitters reuse the same sqlc/pgx/Atlas (no MySQL). Distinct from the AIDOS truth-store. See ADR 0006.
_Avoid_: confusing it with the AIDOS truth-store (which is Postgres, never Doltgres — ADR 0004); using Dolt-MySQL (we chose Doltgres to keep one dialect); treating it as a second engine in the OS core (it is an emitter target, `replaceable`, spike-validated for beta).

**Layer-A memory (claude-mem) vs Layer-B brain**:
Two unrelated memories. **Layer A** = the cross-session memory of the *Claude Code agent that builds AIDOS* — **claude-mem**, a dev convenience, not part of the product, never AIDOS truth. **Layer B** = AIDOS's own `brain` subsystem (S30–S33) over user projects — **native pgvector** in the Postgres truth-store, behind the MemoryFirewall, with a deterministic (LLM-free) ContextGraphDecision. The wall + the memory-is-not-truth law keep them from ever crossing. See ADR 0008.
_Avoid_: using claude-mem (Layer A) as the OS brain backend (Layer B); putting an LLM inside the ContextGraph; a second memory engine on the truth side.

**Bicéphale (Kernel + Mirror)**:
One body (the truth), two heads — intention (Kernel spec) and proof (Mirror). Inseparable, co-versioned, joined by the `mirrors` link and the completeness law (no truth without a living mirror). The Mirror is a **plane inside the Kernel context**, living at `back/kernel/mirror/`.
_Avoid_: bicaméral (historical alias); treating the Mirror as a mere `test` attribute.

## Contexts

_Homes resolved this session; the engine-vs-scope of `back/` is the one open pivot (see below)._

- **AIDOS Runtime** → `back/runtime/` — the harness: loops, skills, hooks (the wall), sensors, generators/emit-templates, topologies, tools, the `krd` compiler, the context compiler, goal engine, evolution lab; hosts the inviolable NIVEAU 3 fitness.
- **AIDOS Kernel** → `back/kernel/` — the frozen, human truth (intention head). Contains the Mirror plane.
- **AIDOS Mirror** → `back/kernel/mirror/` — the executable proof (proof head), bicephalous twin of the Kernel, out of the AI's reach.
- **AIDOS Archive** → `back/archive/` — the version DAG = quality-diversity memory; hosts the `/brain` memory **store**.
- **AIDOS Workbench** → `front/web/` — the OS's own governance UI; hosts the human `/brain` **cockpit**. The existing Next.js app moves here.

## Relationships

- **Kernel ↔ Mirror**: bicephalous — `mirrors` link, co-versioned; completeness law forbids any truth without a living mirror, and any orphan mirror (the _monstre_).
- **Kernel → projections**: constrains, never generates (the cliquet).
- **Runtime → Kernel/Mirror/fitness**: enforces the wall (the agent writes projections, never the kernel/mirror/fitness).
- **Mirror → projections**: the red wave starts at the mirror, then cascades.
- **Archive ↔ Kernel/Mirror**: a ChangeSet moves spec + mirror together atomically; the DAG serves both manual undo and evolutionary search; promotion to truth passes through the Mirror, never the DAG.
- **Workbench → all**: surfaces SemanticDiff / AuthorityGraph / KernelDebt / DAG / RedWorkQueue and routes human gestures back as approved ChangeSets. Without it, authority bypasses instead of deciding.
