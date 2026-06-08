---
name: s11-control-action
description: S11 control-spec (button-as-source) + action-spec binding control→operation, state/event fixtures — verified green
metadata:
  type: project
---

S11 = button-as-a-source down to the button (KRD §24.1/§24.2/§94). Two pure Go pkgs:
- `back/kernel/control`: Control AST {view,label,visible_when,enabled_when,triggers}, VisibleWhen/EnabledWhen are expr.Expr ASTs REUSED from frozen back/kernel/expr (ADR0007, never re-implemented). EvalState(c,given)→{visible,enabled} PURE deterministic — enabled_when consulted ONLY when visible (hidden⇒enabled false). Validate rejects orphan trigger (ErrOrphanTrigger) + non-bool condition (ErrConditionNotBool via empty-env eval, dangling-ref allowed). CheckoutButton() anchor verbatim: visible >($.cart.items.length,0), enabled &&($.form.valid,!($.submitting)), triggers checkout-submit.
- `back/kernel/action`: Action AST {on:click(controlRef), invoke:operation, with{}, on_success[], on_error[]}. Plan(action,event)→PlanResult RESOLVES bind WITHOUT executing (returns invoke ref + with-args + effect lists). Validate rejects orphan bind (ErrOrphanBind) + orphan on-control + non-click event. CheckoutSubmit() anchor: click(checkout-button)→invoke createOrder with{cart:$.cart,user:$.auth.user}, on_success[navigate,toast], on_error[toast.error]. Effect verbs verbatim KRD §24.2 (opaque, no invented semantics).

DONE-CRITERION proven: action fixture green iff Plan(action,click("checkout-button"))→invoke "createOrder" (TestCheckoutSubmitBindsOperation). Control fixture: empty-cart visible=false, invalid-form enabled=false, valid-form enabled=true (3 §35 rows verbatim).

Migration kernel_control_action_baseline.sql: kernel.control + kernel.action content-addr CHECK version=id append-only, aidos_agent SELECT-only REVOKE INSERT/UPDATE/DELETE/TRUNCATE = in-DB wall, aidos writer SELECT/INSERT/UPDATE (no DELETE). canonical.go reuses expr.Canonicalize for nested ASTs + records.Canonicalize/Hash envelope (single hash scheme).

RE-VERIFIED GREEN independently: gofmt clean, go vet clean, go test ./kernel/control/... ./kernel/action/... 8.2s each PASS (incl Testcontainers pg16 round-trip + content-addr CHECK + agent-role permission-denied wall). Property: EvalStateDeterministic, PlanDeterministic (repro mirrors), OrphanTrigger/OrphanBind/OrphanOnControl rejected. Front lib/control.ts byte-faithful twin (evalState/planAction/controlTrace) vitest 11/11, tsc rc0, biome clean on S11 files, i18n control 32==32 total 3441==3441. /control READ-ONLY projection (no fetch/INSERT/useState writes — only a comment mentions later onClick projection S38) ui-completeness VACUOUS (Expr/control=truth via ChangeSet, rendered button=S38 projection). e2e tests/e2e/control.spec.ts 6/6 LIVE :3000. Skills view+action present. Docs concept+internals 3 layers (Implémentation/Méta/Méta-méta) docs.json:89-90 committed+pushed (.aidos-docs clean, build now at S61).

OQ by-design: rendered-button onClick emitter=S38 web projection; mirrors-schema Postgres persistence of fixtures back-filled S06 (file+Go-test = valid mirror pre-S06 bootstrap); Linear MCP unauthenticated (record OQ not fail). verified-green ZERO corrections.
