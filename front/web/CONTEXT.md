# AIDOS Workbench

The Workbench is AIDOS's own operating interface (`front/web/`) — the visual governance surface through which humans see kernel, mirror, and archive state and route decisions. It renders what the engine computes; it never holds or decides truth. **It is the OS's own UI, not an app AIDOS emits for an end user** (those are Runtime-generated projections that live in a separate user workspace).

## Language

**Workbench (KRDWorkbench)**:
The OS's own visual governance UI — the human-facing surface that is too rich for YAML alone, and the home of the human `/brain` cockpit. Without it, authority bypasses instead of deciding.
_Avoid_: dashboard, admin panel, control panel; "the AIDOS web app" (it is the OS UI, not an emitted end-user app).

**Surface (vue de gouvernance)**:
One governance view inside the Workbench (ideas queue, mirrors, authority, semantic-diff, dag-viewer, kernel-debt, color-legend, cockpit). A surface renders engine state and offers a bounded set of human gestures; it never computes the state it shows.
_Avoid_: page, screen, tab, widget.

**Gesture (geste humain)**:
A single human decision exposed by a surface — approve / reject / spike / scope / authority / declass / kill — that returns to the engine as an approved ChangeSet. The Workbench routes decisions; it is never the decision authority.
_Avoid_: action, button-click, command.

**Workbench is not an emitted projection**:
`front/web/` is the OS's own UI. The web / mobile / cli apps AIDOS generates when someone _uses_ the OS are Runtime generator targets that live in the user's workspace — not directories of this repo.
_Avoid_: calling `front/web/` an "emitted app", "ui-web target", or "the generated frontend".

### Rendered engine state

These records are computed elsewhere (Runtime, Kernel, Mirror, or Archive); the Workbench only renders them in human terms.

**SemanticDiff**:
The real nature of a kernel change in human-readable form (change_type, blast_radius, requires_authority, red_wave) — not a textual diff. Computed by the Runtime; rendered by the Workbench so a human can weigh the change.
_Avoid_: git diff, file diff, line diff.

**BlockReason**:
The actionable explanation behind a refusal (code, severity, explanation, how_to_fix), rendered next to the wall it justifies. A wall without a rendered BlockReason becomes a prison.
_Avoid_: error message, exception, stack trace, "permission denied".

**AuthorityGraph (surface)**:
The Workbench surface of the explicit authority model — per domain, who approves, who can veto, who escalates — in place of an anonymous "the human", editable by gesture.
_Avoid_: roles list, RBAC table, ACL editor, permissions screen.

**KernelDebt (review)**:
The Workbench review of accrued kernel-gardening debt (stale fixtures, orphan mirrors, surviving mutants) alongside `/trim-kernel` proposals to pay it down. A review surface, not a ledger of its own.
_Avoid_: tech debt board, backlog, lint report.

**CellVitality**:
The diagnostic health of a cell, surfaced as one of four interpretation states — `healthy`, `stale`, `overfitting_risk`, `underconstrained` — that triggers review. A diagnostic, never a promotion fitness.
_Avoid_: health score, status badge, test coverage, pass rate.

### The color language

A meaning-bearing palette, constant across the whole method, that encodes every node and edge. Keep the canonical color → concept mapping; never recolor by status alone.
_Avoid_: arbitrary theming, status-only colors (e.g. green = "ok"), severity palettes.

**🟨 OR (gold)**:
The noyau / source — frozen, executable, human truth. "What must be true."
_Avoid_: yellow = warning.

**🟦 TURQUOISE (turquoise)**:
The code / projection — the free, derived, disposable, AI-written structure. "How it is done."
_Avoid_: blue = info; cyan = link.

**🟥 ROUGE (red)**:
The cliquet / mur / régression — the boundary, the enforcement, the vague de rouge (red wave).
_Avoid_: red = error/failure only.

**🟩 VERT (green)**:
Prouvé / réconcilié — a living miroir that passes. "The proof that holds."
_Avoid_: green = success/ok only.

**🟪 VIOLET (purple)**:
L'évolution — open search, variants, the archive, self-play, auto-modification.
_Avoid_: purple = premium/special.

### The /brain cockpit

**Cockpit (`/brain`)**:
The Obsidian-style human reading surface over the six KRD memories — notes, adr, runs, glossary, maps, reviews. The cockpit lives in the Workbench; the memory **store** lives engine-side in `back/archive/brain/`. The engine reads the store; the human reads the cockpit.
_Avoid_: knowledge base, wiki, the memory store/database, "the brain" (ambiguous — say cockpit vs store), RAG store.

**Memory cockpit ≠ truth**:
What the cockpit shows is context fuel, never truth. No note becomes kernel by living in the cockpit; memory is promoted only through a mirror, gated by the MemoryFirewall.
_Avoid_: source of truth, spec, authoritative record.
