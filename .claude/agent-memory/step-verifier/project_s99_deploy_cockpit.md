---
name: project-s99-deploy-cockpit
description: S99 verification — deploy cockpit extension over S98 env-rollback plane (domain/TLS link + live HTTPS URL, DP29/ADR0043)
metadata:
  type: project
---

S99 (EPIC10/DP29/ADR0043) = cockpit EXTENSION over the prior S98/DP28 env-rollback plane (anti-overwrite §9, additive only). The prior interrupted attempt had built the full S98 plane (Go archive/envrollback Promote/Rollback, MCP, TS twin, /env-rollback route, Playwright 6/6, docs at commit 59c18e2). S99 run ADDED the missing cockpit surface the objective requires: DomainRoot + LiveURL.

**What S99 added (verified by re-reading files):**
- Go: `PromoteInput.DomainRoot`, `Promotion.DomainRoot`+`Promotion.LiveURL` (fold into contentAddress so id stays deterministic), pure `LiveURL(env,phaseHash,domainRoot)` = `https://<env>-<subdomain>.<root>` ALWAYS https, `DefaultDomainRoot="deploy.aidos.app"`.
- TS twin lib/env-rollback: `liveUrl()` reuses lib/deploy `subdomainOf`+`DEFAULT_DOMAIN_ROOT`; Promotion gains domainRoot+liveUrl; FNV-1a display digest (Go records.Hash authoritative).
- Panel: domain input (`promote-domain`) + clickable `promote-live-url` anchor (href===text, target _blank) + `promote-domain-out`.
- Docs: REUSED s98-env-rollback.mdx page (NOT a new s99 file) extended with S99/DP29 section + kept 3 layers Implémentation/Méta/Méta-méta — acceptable per-step doc decision since S99 extends the SAME plane.

**Done-criterion** = "Playwright e2e — déployer une phase, lier un domaine, voir l'URL HTTPS, rollback." ALL 4 reachable+executable from /env-rollback screen. RAN: Playwright 7/7 GREEN live:3000 (route 200) incl scenario "linking a custom domain yields a live HTTPS URL (S99/DP29)" asserting href ^https:// + contains shop.example.com + href===text.

**Verification RAN green, ZERO corrections:**
- go build ./... exit0, vet clean, gofmt -l empty
- go test envrollback/mcp/blockreason/preview/deploy/datamigrate ok; broad runtime+archive NO FAIL (prior-green intact)
- Named property mirror `TestPromoteLiveURLDeterministicAndHTTPS` PASS (same env+phase+domain→same URL, always https) + TestPromoteReproducible/RollbackServesReProjectionNotStale/PromoteNonStableAlwaysRefused
- MCP env-rollback wall-grep CLEAN (no truth-write; serializes full Promotion JSON so domain_root+live_url ride along automatically — main_test.go doesn't explicitly assert new fields but Go property test covers them)
- TS: tsc clean for env-rollback, vitest 7/7 (added liveUrl determinism + custom-domain props), biome clean 6 files
- i18n fr4532==en4532 EXACT, envRollback ns 39 keys, liveUrlLabel+domainLabel present both; nav /env-rollback line 158
- docs HEAD==origin/main d2d67e9, 2 docs.json entries, S99/DP29 section + 3 layers present

**OpenQuestions (by-design, NOT residual):** (1) route name /env-rollback vs DP29 literal "/deploy" — prior attempt named the plane, cockpit functionally complete (déployer+domaine+URL+rollback all on the screen); a future consolidation step could alias. (2) Linear MCP unauthenticated (only authenticate tool available). (3) deploy substrate (Pulumi/Traefik/ACME) modelled as pure functions per bootstrap-exception; real infra owned by DP deploy track.

RECURRING pattern note: when a step is a cockpit EXTENSION of a just-prior interrupted plane, the executor reuses the prior step's doc mdx + route + nav + e2e and adds fields additively — verify the NEW capability (here domain/URL) has its own e2e scenario + property mirror, not just that the prior plane is green.
