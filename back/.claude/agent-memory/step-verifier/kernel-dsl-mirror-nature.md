---
name: kernel-dsl-mirror-nature
description: A ∀ DSL (policy, expr) is mirrored by a rapid property test, NOT a Gherkin journey — a forced acceptance is a double-typed monster
metadata:
  type: project
---

For a kernel DSL whose nature is the invariant ∀ (the Policy DSL, the Expr DSL), the canonical mirror is a **rapid property test**, not a Gherkin acceptance.

**Why:** KRD's three-mirror law assigns one form per nature of truth. A policy/expr is ∀ (invariant), so forcing a Gherkin journey on top would be a double-typed monster (the completeness law forbids it). Do NOT flag "no .feature file" as a gap for these.
**How to apply:** when verifying a kernel-DSL step, accept the absence of a Godog journey as correct iff a rapid property mirror exists and proves the invariant. For S09 the property mirror proved both done-criteria: DENY-precedence (`TestProperty_CombinationLaw_AnyFailBlocks`: any failing child under an ALLOW gate ⇒ DENY) and totality (`TestProperty_Eval_Total`: Eval never errors/panics, always returns ALLOW|DENY over generated ctx incl. dangling selectors). The Workbench panel still carries a Playwright e2e (the UI is a journey even if the truth is ∀).
