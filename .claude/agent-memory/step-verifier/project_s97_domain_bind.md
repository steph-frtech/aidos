---
name: project-s97-domain-bind
description: S97 verification — custom-domain binding + TLS + DNS for deployed apps (Traefik/ACME, DP27/ADR0043)
metadata:
  type: project
---

S97 — per-app CUSTOM DOMAIN binding (EPIC10, DP27/ADR0043). PURE deterministic planner over an already-projected binding Registry. VERIFIED GREEN, ZERO corrections.

Bind(Registry,Request)->BindPlan|BlockReason: INJECTIVITY-FIRST (domain owned by ANOTHER project → CodeDomainAlreadyBound naming owner, fail-closed never silent re-point=multi-tenant leak; re-bind SAME project idempotent), renders Traefik HTTPS labels (websecure router + tls + ACME certresolver letsencrypt + http→https redirect, /data/dockers DP27 convention) + DNS CNAME(custom→deploy host d-<hash>.deploy.aidos.app S96) + https URL. content-addr via S02 records.Canonicalize+Hash. ServesHTTPS + IsInjective = PURE code judges. Writes NOTHING (wall), no live DNS/ACME call.

Done-crit ALL RAN green: fixture 12 cases (3 OK + 9 refusals incl DOMAIN_ALREADY_BOUND, normalized case/dot-insensitive match conflict, malformed/empty/no-dot/whitespace OUT_OF_SCOPE, registry-already-non-injective=fault); Godog 5 scenarios (HTTPS serving + DOMAIN_ALREADY_BOUND names owner + idempotent same-project + malformed OUT_OF_SCOPE + reproducible same-id) 24 steps PASS; rapid 5 props (reproducibility/injectivity/HTTPS/idempotent/content-addr sensitivity). go test domainbind+blockreason+mcp ok gofmt -l clean vet clean go build ./... clean runtime/... prior-green intact.

blockreason CodeDomainAlreadyBound='DOMAIN_ALREADY_BOUND' additive enum :374 registry :953 (SeverityBlocking, non-empty how_to_fix choose_free/release/use-default-subdomain) codeOrder :1008 — property mirror auto-covers (samples Codes()).

MCP aidos-domainbind 3 PURE tools bind/serves_https/injective write-NOTHING wall-grep CLEAN.

TS twin lib/domainbind.ts vitest 6/6, digest=FNV-1a DISPLAY-ONLY (Go records.Hash authoritative, e2e asserts plan-id reproducibility NOT byte-eq to Go = correct). tsc clean for domainbind. biome 1 WARNING only = UNSAFE suggested optional-chain fix on validDomain (`!d?.includes` would change empty-string handling) — correctly left as-is, non-applied, NON-blocking.

/domain-bind action-capable (useActionState→bindDomainAction): project/domain inputs + conflict-toggle (proves DOMAIN_ALREADY_BOUND) + bind-url/serves-https badge/injective badge/router-name/cert-resolver/plan-id/dns-record/traefik-labels. Action respects wall (plans only, comment documents propose→ChangeSet for DAG decision). nav:157 /domain-bind k=domainBind. i18n fr4492==en4492 EXACT (flatten+diff 0 drift). e2e 6/6 RAN live:3000 (HTTPS serving + injective badge + DOMAIN_ALREADY_BOUND + OUT_OF_SCOPE + plan-id reproducibility + panel render).

docs 3-layer (Implémentation·Méta·Méta-méta) concept+internals registered docs.json (2 nav entries) HEAD==origin/main 035b98c.

OQ (by-design fwd-dep, NOT residual): OQ-S97-apply (real CNAME applied + pulumi up posting labels + Traefik ACME issuance = downstream); persistent binding registry source-of-truth = S99 deploy cockpit (here supplied as already-projected facts); Linear MCP unauthenticated this session (best-effort §11 gap). verified-green ZERO corrections.
