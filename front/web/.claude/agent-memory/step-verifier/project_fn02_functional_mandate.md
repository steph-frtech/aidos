---
name: project-fn02-functional-mandate
description: FN02 = mandate-step (no package, like determinism-first) graving ADR 0036 = emitted code is functional; three emitted invariants; scope tranched to back/gen/ only; verified-green.
metadata:
  type: project
---

FN02 ships **no package** — it is a *mandate-step* exactly like the determinism-first mandate (a rule, not code). Its sole deliverable is **ADR 0036** (`docs/adr/0036-fn02-emitted-functional-mandate.md`, Accepted, commit `01c6bbe` on the AIDOS repo).

**What ADR 0036 graves:** the "emitted code is functional" mandate = determinism-first applied to the OUTPUT. Three emitted invariants — `EMITTED_FUNCTION_PURE` (output=f(inputs), re-emission byte-identical), `EMITTED_NO_GLOBAL_MUTABLE` (no package-scope mutable var; tables returned by value), `EMITTED_CALL_GRAPH_ACYCLIC` (no cycle; one fn = one layer = one node). Scope **tranched to `back/gen/` ONLY** — never the AIDOS engine (back/runtime, back/kernel, front/web stay imperative). Invariants will be **deterministic fail-closed gates** (go-arch-lint/depguard / AST walk, in the spirit of BA14's CheckLLMIsolation), never an LLM judgment.

**Done-criteria:** "ADR accepté définissant les invariants émis + leur portée (gen/ uniquement) ∧ tracké Linear." — met. The wall is intact: FN02 touched only the ADR (provenance), no kernel/mirrors/fitness write.

**Why no BDD mirror / UI / e2e / sensors:** mandate-step. Like [[project-fn01-functional-spike]] (no UI until FN06) and the determinism-first mandate. FN03 makes the mandate executable (emitters + purity property-mirror, red-first), FN04 arms the three invariants as fault-injected arch-fitness rules on back/gen/, FN05 consumes the acyclic call-graph as a context index.

**Mintlify:** 2 pages (concept + internals with the 3 layers Impl·Méta·Méta-méta), registered in docs.json (lines after fn01), `mint validate` clean, pushed to steph-frtech/docs main (commit `d566824`, HEAD == origin/main).

**OpenQuestions (do NOT block):** OQ-FN02-linear (linear-server MCP OAuth not authenticated from isolated executor — Linear issue not flipped to Done; record per CLAUDE.md §11, don't fail step); OQ-FN02-effets-IO (purity scope for emitted handlers doing DB I/O deferred to FN03, likely "functional core, imperative shell"). Both are forward-dependencies / auth-gate, not work gaps.

Verified-green.
