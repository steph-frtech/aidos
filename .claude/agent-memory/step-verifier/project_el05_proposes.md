---
name: el05-proposes
description: EL05 LevelToProposes table — honest join EL02 grammar → ideas.ProposesKinds() closed set; self-map only, NoEmit for journey/view/invariant
metadata:
  type: project
---

EL05 = the declared table `LevelToProposes(level)→ProposesKind|NoEmit` in back/runtime/besoin/proposes.go — the HONEST JOIN between EL02's 9-Level grammar (7 source rungs + 2 transversal bands invariant/policy) and the EXISTING closed set `ideas.ProposesKinds()` = {control,policy,operation,action,entity,product} (REUSED never forked).

- **Mapping**: control/action/operation/entity/product + policy band → SELF-MAP (the only legal Emit, never an alias of another level). journey/view/invariant → NoEmit (journey/view have no Proposes kind → seed anchors; invariant's mirror is a property N1, not an idea kind).
- **levelProposesTable** first-class CLOSED TOTAL map, domain == AllLevels() (9, proven by DomainIsExactlyAllLevels). `LevelToProposes` (safe NoEmit on out-of-grammar) + `LevelToProposesChecked` (HARD error via ErrUnknownLevel) + NoEmitLevels/EmitLevels/IsNoEmit.
- **Mirror**: proposes_property_test.go, 7 rapid properties RED-first (red-first discipline observed in claude-mem at 15:15Z): Total, EmitTargetInClosedSet (honest join), NoSilentAlias (journey→product forbidden), NoEmitSetIsExact{journey,view,invariant}, OutOfGrammarHardError, Reproducible(50×), DomainIsExactlyAllLevels. Go test/vet/gofmt clean.
- **Wall**: STRUCTURAL — proposes.go imports only fmt + ideas; no pgx/INSERT/DB/truth-write. Decides only the Proposes target, emits NO Idea (EL16's job via idea-intake door).
- **TS twin** lib/besoin-proposes.ts byte-faithful (LEVEL_PROPOSES_TABLE/levelToProposes/Checked/emitLevels/noEmitLevels/proposesKinds), vitest+fast-check 12/12, tsc clean. Twin imports `./besoin-grammar` (alias `@/lib/` was fixed during exec per claude-mem 15:16Z).
- **Front**: action-capable /compound-besoin-proposes 3 controls (Mapper/Prouver-jointure/Tester-hors-grammaire) all run the twin (no LLM, no re-impl); nav under WorkbenchHeader k:besoinProposes; i18n 27 keys besoinProposes + nav.besoinProposes both locales, parity 2746/2746; e2e besoin-proposes.spec.ts 4/4 on :3000 (semantic — journey never casts to product).
- **SCAR (recurred)**: report claimed biome clean but lib/besoin-proposes.test.ts had `m.proposes!` noNonNullAssertion warning (see [[feedback-biome-clean-report-lie]]). Fixed WITHOUT weakening: added `expect(m.proposes).toBeDefined()` guard + `as string` cast, not a runtime skip.
- ADR 0041 accepted (docs/adr/0041, additive, reuses Proposes unchanged). Docs cf8d8e8 HEAD==origin/main, mint validate passed, 2 MDX (concept + internals 3 layers).
- FwdDep: EL16 consumes LevelToProposes to emit Ideas, EL17 topo-sorts, NoEmit nodes seed anchors = by-design OQ. Linear MCP unauth = OQ.
- verified-green
