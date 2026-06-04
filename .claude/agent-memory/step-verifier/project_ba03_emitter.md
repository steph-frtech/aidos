---
name: project-ba03-emitter
description: BA03 — deterministic emitter Project(layer,cfg,pack) projecting CoucheAgent→AgentImplementation; byte-stable, cfg carries only credentials (no knob); resolves OQ-S52-wall by extracting the wall classifier
metadata:
  type: project
---

BA03 = the **deterministic emitter** `agentimpl.Project(layer, ProviderCfg, pack)` (back/runtime/agentimpl/project.go) — pure, no LLM, no clock, content-addressed via records.Canonicalize+records.Hash (CanonicalBytes/Hash), exactly like agentrun.Record.

- **ProviderCfg** carries ONLY Provider/Model (gate inputs) + Endpoint/APIKey (`json:"-"`, never marshaled → never in the projection identity). NO behaviour knob — temperature/seed/maxturns come UNIQUELY from the SOURCE layer. Reproducibility mirror proves perturbing endpoint/key leaves the projection byte-identical.
- **Fail-closed gate** (4 checks): agentlayer.Validate(layer), cfg.Provider==Spec.Provider, cfg.Model==Spec.Modele, IsKnownProvider, and the NEW **IsKnownModel** (closed per-provider model set `knownModelsByProvider` + ModelsFor + IsKnownModel added to agentlayer — twin of IsKnownProvider; a retired model fails the gate, never opaquely at the provider).
- **OQ-S52-wall RESOLVED** here: S04 classifier extracted from `package main` to importable `back/hooks/pretooluse/wall`; hook re-exports via type aliases (anti-overwrite §9) so wall_bdd_test/wall_property_test pass UNCHANGED (`git diff --stat HEAD` blank). Single-sourced. See [[project-s52-agentlayer]].
- **RED mirror** agentimpl_emitter_property_test.go (rapid): byte-stable, cfg-ignores-non-credential, knobs-from-layer, refuses invalid-layer/model-mismatch/unknown-provider/unknown-model, always wall-holding. Plus wall_property_test.go for the extracted classifier.
- **Front twin** lib/agentlayer.ts: project()/ProviderCfg/isKnownModel/KNOWN_MODELS_BY_PROVIDER/implContentHash/canonicalJSON. Vitest 36/36.
- **/agents** action-capable: "Émetteur déterministe" section, executable "Projeter la couche" runs project() twice same-inputs (proves byte-stable via h1==h2) then perturbed endpoint/key (proves cfg-ignored via h1==h3). testids: emitter, emitter-project-button, emitter-result/-hash/-stable/-cfg-ignored. All emitter* i18n keys present fr+en (verified). Playwright 13/13.

Verified-green pattern (2026-06-03): gofmt/vet/build clean, go test hooks+agentlayer+agentimpl+agentrun green, tsc clean, vitest 36/36, Playwright 13/13, mint validate passed, docs pushed 49dbdd8 to steph-frtech/docs main.

OpenQuestions (by-design forward-deps, NOT blocking): Linear MCP unauthenticated (could not flip the issue); resolveTools/Skills/Hooks project enabled bindings sorted but the selection RULE is BA05; `pack` is an opaque ContextPack ref (context.Compile is forward).
