---
status: accepted
---

# This repo is the OS: `back/` is the engine, `front/web/` is its UI

This repository **is AIDOS itself** (the AI Development Operating System), not an app built with it. `back/` holds the OS engine only — the Go code implementing the KRD concepts (DSL grammars, the 6 laws, cert-language runners, the version-DAG engine, generators/emit-templates) across the Runtime, Kernel (with the Mirror plane at `back/kernel/mirror/`), and Archive contexts — and `front/web/` is the OS's own UI, the Workbench. We chose this because the KRD method's value is the engine that enforces it: the OS must exist before anything can be built with it.

The managed-project zones the Tome shows (`/ideas`, `/spike`, `/src`, a user `/kernel/spec`) are **not directories of this repo**: AIDOS creates them inside *separate user workspaces* when someone uses the OS to build their app. Likewise the emit targets (web / mobile / cli) are **Runtime generator concerns** — code emitted into a user's workspace — not product directories here. `front/web` is the OS's governance UI, never an emitted app.

## Considered Options

- **Engine-only (chosen)** — the repo ships the OS: `back/` is the engine, `front/web/` is the Workbench. Managed-project zones and emit targets live in the user's workspace, produced at runtime. Clean separation between the tool and what the tool builds.
- **Dogfood** — let the OS's own `back/` *be* a managed KRD project, mixing engine code with a live `/kernel`/`/mirror`/`/src` of its own. Rejected: it conflates the OS with a project built by the OS, so the directory tree stops meaning one thing, and every reader has to ask "is this `/kernel` the engine's spec or a sample project's spec?".
- **Workspace-template** — ship the repo as a scaffold a user clones and fills in (the Tome arborescence as literal repo folders). Rejected: that makes this a project template, not the operating system; there is no engine to enforce the method, only an empty shape.

## Consequences

- The whole tree depends on this split, so it is **hard to reverse** — moving the engine/UI boundary later means relocating every context home (`back/runtime/`, `back/kernel/`, `back/kernel/mirror/`, `back/archive/`, `front/web/`).
- It resolves the **surprising** mismatch with the Tome: the Tome's arborescence (`/kernel`, `/src`, `/mirror` as sibling folders) describes a **managed project**, not the OS. Readers must not map those Tome paths onto this repo.
- The existing Next.js app moves to `front/web/` as the Workbench; it is the OS's own surface, distinct from any web app the Runtime *emits* for a user.
- `/brain` is split along the same seam: the engine **store** lives in `back/archive/brain/`; the human **cockpit** lives in `front/web` (Workbench).
- Mirror is a **plane inside the Kernel context** (`back/kernel/mirror/`), co-versioned with the spec, not a separate top-level subsystem directory.
