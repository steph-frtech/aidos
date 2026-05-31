# Feeding the Mintlify docs (`aidos.mintlify.app`)

This is the canonical convention for the **public AIDOS documentation**. The same
rules are obeyed by `/grill-with-docs` (at the start of a step) and by every step's
documentation pass (at green). Both write here so the docs grow tooth-by-tooth with
the build, exactly like the kernel.

> **One sentence.** Every step ships **two pages** — one *concept* page for future
> users and one *internals* page for me — and the internals page always carries the
> three layers **Implémentation · Méta · Méta-méta**. Nothing is "done" until its
> docs are live on `aidos.mintlify.app`.

The prose is written in **French** (this is the builder's language and the audience
framing — *« Pour moi »* / *« Pour les futurs utilisateurs »*). Keep canonical
identifiers and KRD terms verbatim (kernel/noyau, mirror/miroir, ratchet/cliquet,
wall/mur, ChangeSet, RedWave, etc.) — never translate a term that is truth-language.

---

## 1. Where the docs live and how they deploy

| | |
|---|---|
| **Connected repo** | `github.com/steph-frtech/docs` (branch `main`) — **separate** from the `aidos` code repo. |
| **Working clone** | `.aidos-docs/` at the repo root (gitignored). Create it if missing: `git clone https://github.com/steph-frtech/docs.git .aidos-docs`. |
| **Deploy** | Mintlify auto-builds on **push to `main`** → serves `https://aidos.mintlify.app`. |
| **Verify** | the read-only MCP `mcp__mintlify-aidos` (`https://aidos.mintlify.app/mcp`) — search + a sandboxed read-only docs filesystem (`tree`, `cat`, `rg`). Poll it until the new pages appear. |

You author MDX + `docs.json` in `.aidos-docs/`, validate, commit, push. You never edit
`aidos.mintlify.app` by hand and you never invent a different repo.

## 2. Tooling you must use

- **`mintlify` skill** (`.agents/skills/mintlify/`) — component syntax, `docs.json`
  schema, navigation patterns, frontmatter, writing standards. Read its `reference/*`
  files when a detail is missing. **Read `docs.json` and 2–3 existing pages first** to
  match voice and structure (its rule).
- **`mcp__mintlify-aidos`** — *read* the already-published AIDOS docs. Use **before**
  writing (avoid duplicating a page; prefer updating/linking) and **after** pushing
  (verify the page is live).
- **`mcp__mintlify-docs`** (`mintlify.com/docs/mcp`) — how to *use* Mintlify itself
  when the skill's reference doesn't cover something.
- **`mcp__mintlify-write`** (`mcp.mintlify.com`) — the dashboard write MCP (OAuth,
  opens a PR). The **git-push path above is primary** (deterministic, headless,
  CI-friendly). Use the write MCP only for an interactive, review-on-the-dashboard edit.
- **`mint` CLI** (`npm i -g mint`) — `mint validate` (strict build check, run from
  `.aidos-docs/`) and `mint broken-links` before every push. Fix every warning.

## 3. The two docs (top-level tabs)

The site is **two distinct docs**, one tab per reader — the same system told at two
altitudes. **Do not** mix them.

### Tab « Pour moi » — the complete internals (*everything*)

The full documentation of **AIDOS itself**, built tooth by tooth. It holds the
**Fondations** and **every build step**; each step has a *concept* page
(`steps/concept/sNN-<slug>.mdx` — the what/why of that build step) **and** an
*internals* page (`steps/internals/sNN-<slug>.mdx`) carrying the three layers below.
This is the build journal — Go, SQL, file paths (`path:line`), mirrors, ADRs all
belong here. Audience: **me** (the builder), who wants to understand *tout*.

### Tab « Pour les futurs utilisateurs » — the product guide (the End User)

For someone who will **use AIDOS to develop their own app** — never a reader of AIDOS's
own guts. It holds two things: **comment développer son app avec AIDOS** (the user's
journey — getting started, the KRD workflow, the gestures, the Workbench, the app you
get) **and tous les concepts** they need (what AIDOS is, the KRD method, the five
subsystems, the glossary). Organized by the **user's journey, never by AIDOS's internal
step numbers**; no AIDOS-internal Go/SQL. **Bilingue par défaut** (français d'abord,
une seconde langue disponible — voir l'ADR i18n et la page `guide/your-app`).

### The three internals layers (every « Pour moi » step *internals* page)

1. **`## Implémentation`** — the actual code: packages, files (`path:line`), schema,
   the algorithms, how it really works, the commands to run it/test it.
2. **`## Méta`** — the *truth about the code*: the **mirror(s)** that prove it (Gherkin
   journey / rapid property / fixture), the kernel records / contracts the step pins,
   the `reflects · test_kind · cert_language · liveness`, and the red→green story.
3. **`## Méta-méta`** — the *method about the truth*: where the step sits in the KRD
   ratchet, which wall / completeness / honesty rules apply, the relevant ADRs, and any
   bootstrap forward-dependency recorded as an OpenQuestion.

> The three layers are not optional headings — every « Pour moi » internals page has them.

## 4. The pages

### « Pour les futurs utilisateurs » — the product guide

| Group | Page | Holds |
|---|---|---|
| Découvrir AIDOS | `index.mdx` | Landing — what AIDOS is, the two docs, cards into both tabs. |
| Découvrir AIDOS | `concepts/what-is-aidos.mdx` | The product: AI Development Operating System. |
| Découvrir AIDOS | `concepts/krd-method.mdx` | The method: Kernel-Ratchet Development (the two mandates). |
| Découvrir AIDOS | `concepts/five-subsystems.mdx` | Runtime · Kernel · Mirror · Archive · Workbench. |
| Découvrir AIDOS | `concepts/glossary.mdx` | The ubiquitous language (accessible form of `CONTEXT-MAP.md`). |
| Développer votre app | `guide/getting-started.mdx` | Premiers pas : ouvrir le Workbench, le projet, la première intention. |
| Développer votre app | `guide/krd-workflow.mdx` | Le cycle : intention → `/grill` → miroir BDD → `/goal` → AIDOS construit → Workbench → phase stable. |
| Développer votre app | `guide/gestures.mdx` | Les gestes (commandes) que **vous** invoquez : grill, goal, tdd, spike, evolve, … |
| Développer votre app | `guide/workbench.mdx` | Le Workbench — vos panneaux (contract, store, …) et comment gouverner. |
| Développer votre app | `guide/your-app.mdx` | L'app que vous obtenez : projections émises (web/mobile/cli/api/db), données Doltgres, **bilingue par défaut**. |

### « Pour moi » — the complete internals

| Group | Page | Holds |
|---|---|---|
| Fondations | `internals/overview.mdx` | How the repo is built tooth-by-tooth; the per-step loop. |
| Fondations | `internals/the-wall-and-ratchet.mdx` | The wall + the ratchet + completeness. |
| Fondations | `internals/the-stack.mdx` | The frozen stack (Go · Postgres · Next) and why. |
| Fondations | `internals/repo-structure.mdx` | The directory map and where each subsystem lives. |
| Les étapes | `steps/concept/sNN-*.mdx` + `steps/internals/sNN-*.mdx` | Per build step: the what/why **and** the three-layer internals. |

## 5. Page templates

### Concept page — `steps/concept/sNN-<slug>.mdx`

```mdx
---
title: "SNN · <Nom lisible>"
description: "<Une phrase : ce que l'étape apporte, côté concept.>"
keywords: ["aidos", "krd", "<termes>"]
---

<Note>Côté concept — aucune ligne de code. Pour le détail d'implémentation, voir [Pour moi → SNN](/steps/internals/sNN-<slug>).</Note>

## En une phrase
<Le pitch de la capacité, sans jargon d'implémentation.>

## Le problème que ça résout
<Pourquoi cette étape existe, du point de vue de quelqu'un qui utilise AIDOS.>

## Les idées-clés
<Le vocabulaire introduit, défini simplement — une `<Field>` ou une liste par terme.>

## Ce que ça vous permet de faire
<Les gestes concrets que la capacité débloque.>

<Card title="Pour aller plus loin — l'implémentation" icon="wrench" href="/steps/internals/sNN-<slug>">
  Le code, les mirrors et la place dans le cliquet KRD.
</Card>
```

### Internals page — `steps/internals/sNN-<slug>.mdx`

```mdx
---
title: "SNN · <Nom lisible> — implémentation"
description: "<Une phrase : le détail technique de l'étape.>"
keywords: ["aidos", "krd", "implémentation", "<termes>"]
---

<Info>Côté détail. Pour le concept, voir [Pour les futurs utilisateurs → SNN](/steps/concept/sNN-<slug>).</Info>

## Implémentation
<Packages, fichiers (`back/...:NN`), schéma Postgres, algorithmes, commandes. Code réel.>

## Méta
<Le(s) mirror(s) qui le prouvent (Gherkin/rapid/fixture), les records/contrats du kernel
épinglés, `reflects · test_kind · cert_language · liveness`, l'histoire red→green.>

## Méta-méta
<La place dans le cliquet KRD ; les règles du mur / de la complétude / d'honnêteté qui
s'appliquent ; les ADR concernés ; toute forward-dependency en OpenQuestion.>
```

### Writing standards (from the `mintlify` skill)

- Active voice, direct. In French: address the reader as **« vous »**.
- Sentence case for headings. Language tag on **every** code block.
- Internal links are root-relative, no extension: `/steps/concept/s01-content-store`.
- All images need alt text. No marketing filler, no emoji.
- Code examples small and real (copy from the actual repo, keep `path:line` refs honest).

## 6. Registering pages in `docs.json`

Two tabs (§3). Adding a **build step** = adding its two pages (`steps/concept/sNN-*` +
`steps/internals/sNN-*`) to the « Pour moi » → "Les étapes" group. Shipping a
**user-facing capability** = adding/updating a page in the « Pour les futurs
utilisateurs » → "Développer votre app" group. Never reorder or drop an existing page.

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "mint",
  "name": "AIDOS",
  "navigation": {
    "tabs": [
      {
        "tab": "Pour les futurs utilisateurs",
        "groups": [
          { "group": "Découvrir AIDOS", "pages": ["index", "concepts/what-is-aidos", "concepts/krd-method", "concepts/five-subsystems", "concepts/glossary"] },
          { "group": "Développer votre app", "pages": ["guide/getting-started", "guide/krd-workflow", "guide/gestures", "guide/workbench", "guide/your-app"] }
        ]
      },
      {
        "tab": "Pour moi",
        "groups": [
          { "group": "Fondations", "pages": ["internals/overview", "internals/the-wall-and-ratchet", "internals/the-stack", "internals/repo-structure"] },
          { "group": "Les étapes", "pages": ["steps/concept/s00-exec-contract", "steps/internals/s00-exec-contract", "steps/concept/s01-content-store", "steps/internals/s01-content-store"] }
        ]
      }
    ]
  }
}
```

## 7. Publish workflow (every time)

```bash
cd .aidos-docs
# 1. write/update the MDX pages + docs.json (per §5/§6)
mint validate            # strict — fix every warning/error
mint broken-links        # fix every broken internal link
git add -A
git commit -m "docs(SNN): concept + internals (impl/méta/méta-méta)"
git push origin main     # Mintlify rebuilds aidos.mintlify.app
```

Then **verify with `mcp__mintlify-aidos`**: `tree /` shows the new pages, and a `search`
for the step's name returns them. Mintlify takes ~30–60 s to rebuild — poll, don't assume.

## 8. Lifecycle — what each step writes, and when

A build step **always** writes its « Pour moi » pages (the build journal). It touches
the « Pour les futurs utilisateurs » product guide **only when it ships a user-facing
capability** (a new gesture, a Workbench panel, an emitted-app capability, a concept the
user must grasp) — the guide is organized by the user's journey, not 1:1 with steps.

`/grill-with-docs` runs at the **start** of a step; the implementation exists only at
**green**:

- **At grill time** (intention sharpened): write the « Pour moi » **concept page in
  full**, and the internals page's **Méta** (the mirror about to go red) and **Méta-méta**
  (ratchet placement, wall rules, ADRs). Leave `## Implémentation` a short stub
  ("complété à green"). If the step adds a user-facing capability, draft/refresh the
  matching `guide/*` page too.
- **At green** (CLAUDE.md §6): complete `## Implémentation` with the real code, run
  `mint validate` + `mint broken-links`, push, verify. The step is not "done" until its
  « Pour moi » pages are live with the three internals layers filled (and any touched
  `guide/*` page is current).

This keeps the docs honest: they never claim an implementation that does not yet exist.

## 9. Bilingue par défaut

The **product** (Workbench + emitted apps) is bilingual by default — **français
d'abord**, a second language available (i18n, strings in Postgres tables; see the i18n
ADR). The **product guide** (« Pour les futurs utilisateurs ») documents this in
`guide/your-app.mdx`. The docs prose here stays French; if the docs themselves go
bilingual later, use Mintlify's `languages` navigation — not a parallel file tree by hand.
