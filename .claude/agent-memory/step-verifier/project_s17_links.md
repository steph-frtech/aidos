---
name: s17-links
description: S17 versioned links — six closed-kind Link AST + pure Validate/Resolve(green|stale|absent) + content-addressed kernel.link; verified-green
metadata:
  type: project
---

S17 lands the six KRD §41 versioned link kinds (projects_to/derives_from/contracts_with/triggers/binds/mirrors) as a CLOSED enum.

- **Core** `back/kernel/links/links.go`: pure `Validate` (rejects unknown kind + unpinned from/to) and pure `Resolve(link, heads) → green|stale|absent`. Resolve keys only on pinned `to` ref; `heads` handed in as arg (DAG head resolution owned by later step — kept pure). `SerializeLinkBody` reuses S02 `records.NewRecord/Canonicalize/Hash` (not forked).
- **Done criterion** "link to absent version is RED": proven at every layer — Go fixture row 3 (StatusAbsent), rapid property (missing head ⇒ absent always), fast-check front, live /link-graph toggle asserted by Playwright.
- **Migration** `kernel_link_baseline.sql`: content-addressed append-only `kernel.link`, refs INSIDE jsonb body deliberately NOT FKs (a dangling target must stay inspectable for the red wave §42). GRANT SELECT-only + REVOKE writes; Testcontainers proves round-trip + agent INSERT refused.
- **UI** `/link-graph` read-only (no truth write — ui-completeness vacuous on write-path; truth-writes via ChangeSet S20). Heads toggle flips binds edge green↔absent. nav.linkGraph wired.
- **Verified green**: gofmt/vet clean, pure Go tests + Testcontainers PASS, tsc clean, biome clean, vitest 150/150 (links 9/9), Playwright 4/4 (port 3000), docs 2 pages (3 layers) registered + pushed (1362e27, no unpushed), Linear AID-13 Done.
- OpenQuestions (by-design forward deps, non-blocking): full red-wave/impact = S22; mirrors-schema persistence back-filled S06; ChangeSet truth-write path = S20.
