---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise, AND feeds the public AIDOS docs on Mintlify (aidos.mintlify.app). Use when user wants to stress-test a plan against their project's language and documented decisions, or to document a step.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

**Then feed the documentation.** Once the intention is sharp, you do not consider the grill complete until the step's public documentation exists on Mintlify — see [Feed the Mintlify docs](#feed-the-mintlify-docs) below. This is part of every AIDOS step (CLAUDE.md §6).

</what-to-do>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

**When an ADR lands, track it in Linear.** Linear is the AIDOS tracker (CLAUDE.md §11). Use the `linear` skill to file/update a `ADR 000N · <title>` issue (label `adr` + `documentation`, status `Done` once accepted) in the AIDOS project, linking the `docs/adr/000N-*.md` file and its Mintlify page.

## Feed the Mintlify docs

A grill that sharpens an intention but leaves no published documentation is half-done. After the terminology and ADRs settle, **author or refresh the step's public documentation on Mintlify** (`aidos.mintlify.app`). This is mandatory for every AIDOS step, not optional polish.

The full convention — repo, deploy path, MCP servers, the two audiences, the three meta-levels, the page templates, `docs.json` registration, the publish + verify workflow, and what is known at grill-time vs green-time — lives in [MINTLIFY-DOCS.md](./MINTLIFY-DOCS.md). Read it before writing.

In short, every step produces **two pages**:

1. **« Pour les futurs utilisateurs »** (`steps/concept/sNN-<slug>.mdx`) — the *concept*: what the capability is, why it matters, and the vocabulary. No code.
2. **« Pour moi »** (`steps/internals/sNN-<slug>.mdx`) — the *detail*, always in three `##` layers: **Implémentation** (the real code, files, schema), **Méta** (the mirrors and kernel truths that prove it), **Méta-méta** (its place in the KRD ratchet, the wall/completeness rules, the ADRs).

Use the `mintlify` skill (`.agents/skills/mintlify/`) for component and `docs.json` syntax, the `mcp__mintlify-aidos` MCP to read the already-published docs (avoid duplicates, verify after deploy), and `mcp__mintlify-docs` for how-to-use-Mintlify questions. Prose is **French** (`vous`); keep KRD terms (kernel/noyau, mirror/miroir, cliquet, mur, ChangeSet…) verbatim.

At grill time the concept page is written in full, plus the internals **Méta** and **Méta-méta** layers; the **Implémentation** layer is completed at green (CLAUDE.md §6). Validate with `mint validate` + `mint broken-links`, push to `steph-frtech/docs` `main`, and confirm the pages are live via `mcp__mintlify-aidos`.

</supporting-info>
