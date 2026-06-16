# Inventaire dormant exhaustif — 2026-06-16 (méthode déterministe)

## Go : reachability (deadcode -test=false ./...) — 753 funcs injoignables depuis un main réel
Source: /tmp/deadcode.txt (regénérable). Une fonction injoignable depuis tout binaire = dormante en prod.
ATTENTION: deadcode ne voit pas la reachability HTTP (gateway dispatch) ni les twins TS — à interpréter.

```
 40 exp / 95 tot  runtime/governance  → PillarVerdicts, Verdict, ADRNumber, ADRAcceptanceStatus, ADRParity, AdoptionADRSummary
 34 exp / 40 tot  runtime/besoin  → IsResolved, ParseGraphHash, IsAnchored, Descend, ShrinkOptionSpaceCascade, ReopenAnchor
 20 exp / 30 tot  kernel/policy  → CanPlaceOrder, Serialize, Canonicalize, NewCtx, Eval, Holds
 17 exp / 24 tot  runtime/agentloop  → CheckLLMIsolation, ScanModule, DefaultPolicy, FinalMeter, EmittedTargetEL00, EffectKinds
 14 exp / 18 tot  kernel/connector  → Kinds, IsKnownKind, Classifications, IsKnownClassification, AccessScopes, IsKnownScope
 14 exp / 33 tot  runtime/honoemit  → EmitDesktopChild, Targets, EmitMobileChild, ServiceRoles, Targets2, IsTarget
 14 exp / 17 tot  runtime/requirementbench  → FixtureModel.Available, FixtureModel.Name, FixtureModel.Propose, NewClaudeModel, SpecFromDeclaration, FixtureMockupModel.Available
 13 exp / 16 tot  kernel/agentlayer  → LayerKinds, Providers, ModelsFor, DeriveSeed, SeedFor, FanModes
 11 exp / 13 tot  runtime/agentimpl  → HardStop, FakeGenerator.GenerateAction, FSBoundary.MayWrite, EgressBoundary.MayReach, ExecBoundary.MayRun, Sandbox.GateWrite
 10 exp / 10 tot  runtime/bootstrap  → BootMergeOrder, MergeBootEnv, RotateSecret, ScanBootEmission, BootEmissionIsClean, SecretsStateFromStore
 10 exp / 17 tot  runtime/endpointfitness  → Reasons, ExtractLiterals, ClassifyLiteral, ScanSource, Sense, Canonical
 10 exp / 11 tot  runtime/harness  → CrudFragment, CrudCapabilities, ConformantCrudCell, Topologies, Topology.IsKnown, NewFragment
  9 exp / 14 tot  kernel/globalinvariant  → Scopes, IsKnownScope, BlastRadii, IsKnownBlastRadius, Authorities, IsKnownAuthority
  9 exp /  9 tot  runtime/agentrun  → Results, ApplyWall, LegacyID, DeriveSeed, SeedFor, BuildLedger
  9 exp / 12 tot  runtime/connresolve  → Modes, IsKnownMode, ResolveConnection, ResolveMatrix, DemoManifest, DemoMatrix
  8 exp / 11 tot  runtime/compound  → CapitalisationDecisions, Compute, ADRNumber, ADRAcceptanceStatus, ADRParity, ADRSummary
  8 exp / 10 tot  runtime/connectorinfra  → ServiceFragment.WritesTruth, Keys, SubstrateConnectorInfraFragments, CanonicalFragment, HashFragment, NewToolRegistry
  7 exp / 15 tot  archive/brain/contextgraph  → Dimensions, Condition.Holds, ContextGraphDecision.hasChecked, Decide, ContextGraphDecision.CanonicalBody, ContextGraphDecision.ComputeID
  7 exp /  7 tot  gen/db  → Strategies, ExampleOrderPrior, ExampleOrderNarrowed, ExampleHistoricalChange, ExampleDeclaredScope, ExampleNewRecordsOnlyChange
  7 exp /  8 tot  kernel/sagas  → Scopes, IsKnownScope, CertLanguages, IsKnownCertLanguage, Validate, CheckCoherence
  7 exp /  7 tot  kernel/scope  → Regions, Targets, UserSegments, Environments, Statuses, IsKnownStatus
  7 exp / 13 tot  runtime/backup  → IsKnownEngine, ScheduleBackup, RealizeBackup, RestoreBackup, AccessArtifact, StateEqual
  7 exp /  7 tot  runtime/envemit  → Targets, MergeOrder, Bundle.Artifacts, Mode, Keys, ComposeEnvRefs
  7 exp / 13 tot  runtime/spike/dp19connectorgov  → GateConnectorAction, GateAIDataAccess, ActionToRun, LedgerFor, GovernedImpl, ImplFixture.Valid
  6 exp / 11 tot  kernel/composes  → Ref.String, CycleError.Error, SerializeComposesBody, Aggregate, Activation, ReopensOnChange
  6 exp /  6 tot  kernel/records  → Check, CheckEmptyExample, EmptyExampleBody, EmptyExampleSet, DefaultAuthority, Validate
  6 exp /  7 tot  runtime/connectorenforce/connectoraudit  → DeriveConnectorBOM, Append, AuditConnectorAction, BuildLedger, Root, Verify
  5 exp /  5 tot  archive/brain/firewall  → Taints, IsKnownTaint, Capture, Propose, ToKernel
  5 exp /  7 tot  archive/curation  → Node.hasFlag, DefaultPolicy, Curate, CurationDecision.Hashed, SortedByNode
  5 exp /  6 tot  kernel/expr  → CatalogueNames, ParseEnv, ValueEqual, Obj, Arr
  5 exp /  6 tot  runtime/authn  → NewUser, User.AsPrincipal, Principal.IsAnonymous, Authenticate, Principal.GUCs
  5 exp / 13 tot  runtime/checkout  → ExampleCart, MemoryOrderStore.CreateOrder, ExampleInput, RunSlice, SeedIdea
  5 exp /  5 tot  runtime/envbindings  → Datastores, Bindings, BindingsFor, CanonicalBindings, HashBindings
  5 exp /  6 tot  runtime/generators  → ExampleOrderChanged, ExampleBroken, DecodeEntity, HashForTest, APISourceBodyForTest
  5 exp /  5 tot  runtime/generators/techspec  → OSILayers, SpecFacets, TestKinds, ParseBody, Record
  5 exp /  9 tot  runtime/scheduler  → ScheduleTeam, SystemClock.Now, LeaseWindow.Until, Driver.Tick, Driver.Run
  4 exp /  4 tot  archive/projectdag  → BlockReason.Error, NamespaceKey, SameNamespace, ProjectDAG.DAG
  4 exp /  4 tot  kernel/causedby  → IsCausedBy, Edge.AsLink, CauseChain.IsEmpty, ParseEdgeBody
  4 exp /  4 tot  kernel/links  → Kinds, IsKnownKind, Validate, SerializeLinkBody
  4 exp /  4 tot  kernel/stackmanifest  → Roles, Profiles, NewRecord, Example
  4 exp /  4 tot  kernel/temporal  → Clocks, MirrorForms, Relations, SerializeBody
  4 exp /  5 tot  runtime/authoritybinding  → BlockReason.Error, ToProvenanceDetail, NewOverride, Override.contentAddress
  4 exp /  7 tot  runtime/buildloop  → IsKnownVerdict, RunResultFor, Drive, ProposeOnGreen
  4 exp /  4 tot  runtime/buildloop/selfcert  → RunBattery, CertifiedSensors.Run, IsKnownKind, Report
  4 exp /  5 tot  runtime/deploycockpit  → LivenessOf, DefaultLadder, Project, Projection.contentAddress
  4 exp /  4 tot  runtime/erasure  → IsPlan, SelectAccount, SelectApp, ApplyErasure
  4 exp /  4 tot  runtime/evolve  → Sandbox, ExtractContract, AltReferenceSampler, ProposeViaIdea
  4 exp /  4 tot  runtime/sensors/mutation  → GremlinsRunner.Scope, GremlinsRunner.Run, StrykerRunner.Scope, StrykerRunner.Run
  3 exp /  3 tot  archive/brain/memory  → Kinds, IsKnownKind, Taints
  3 exp /  3 tot  hooks/postkernelchange  → PgRedWorkQueue.Enqueue, PgRedWorkQueue.Wave, FireRedWave
  3 exp /  3 tot  kernel/autonomy  → Levels, Validate, OutcomeOf
  3 exp /  3 tot  kernel/entities/ref  → Cardinalities, Semantics, Parse
  3 exp /  4 tot  kernel/grid  → Project, Build, Grid.Hash
  3 exp /  3 tot  kernel/project  → Validate, Scope, Disjoint
  3 exp /  3 tot  kernel/propagation  → Weights, Ref.String, ValidateWeight
  3 exp /  3 tot  mcp/telemetry-reader/telemetryreadersrv  → NewIncidentStoreFromPool, NewTelemetryStoreFromPool, NewIdeaCaptureStoreFromPool
  3 exp /  3 tot  runtime/adoption  → IsStage, Requires, Grants
  3 exp /  4 tot  runtime/billing  → CanRunBuild, WebhookKinds, ContractJSON
  3 exp /  3 tot  runtime/debt/garden  → IsKind, SnapshotID, IsGardenAction
  3 exp /  7 tot  runtime/domainbind  → ResolveInEnvironment, EnvServesHTTPS, ProposeEnvironmentDomain
  3 exp /  3 tot  runtime/economics  → IsDecision, ValidateValueCase, SnapshotID
  3 exp /  3 tot  runtime/exploration  → DraftTruthProposal.HasFrozenVersion, DraftTruthProposal.HasMirror, Harvest
  3 exp /  4 tot  runtime/secretstore  → NewFixedSealer, NewWithSealer, IsClean
  3 exp /  4 tot  runtime/shapeeditor  → Natures, OpenDraft, ApplyEdit
  2 exp /  2 tot  archive/changeset  → Statuses, StampReverted
  2 exp /  2 tot  archive/contentstore  → Store.ListContent, Store.ListHeads
  2 exp /  2 tot  cmd/aidos/lawcoverage  → Verbs, Matrix
  2 exp /  2 tot  kernel/action  → Click, Plan
  2 exp /  2 tot  kernel/authority  → Decisions, SerializeGraphBody
  2 exp /  2 tot  kernel/cell  → PackHasNeighborInternal, SerializeCellBody
  2 exp /  2 tot  kernel/entities/blob  → Parse, Canonical
  2 exp /  2 tot  kernel/ideas  → Statuses, ProposesKinds
  2 exp /  2 tot  kernel/lexicon  → Clean, ParseBody
  2 exp /  2 tot  kernel/mirror/contracte  → NLifecycle.IsReal, Deprecate
  2 exp /  2 tot  kernel/mirror/prooftype  → NLevels, NLevel.IsReal
  2 exp /  2 tot  kernel/truthapproval  → Outcomes, Provenance
  2 exp /  2 tot  kernel/truthtyping  → Kinds, Levels
  2 exp /  4 tot  mcp/besoin-intake  → NewStoreFromPool, Store.CanWriteKernel
  2 exp /  3 tot  mcp/idea-intake/ideaintakesrv  → NewStoreFromPool, Store.List
  2 exp /  2 tot  runtime/buildloop/approval  → RefuseDirectWrite, Admitted
  2 exp /  2 tot  runtime/collab  → CanApprove, Canvas.ReleaseLock
  2 exp /  2 tot  runtime/composeemit  → Targets, Drifted
  2 exp /  3 tot  runtime/connectorenforce  → ConnectorRuntimeApproval.covers, EnforceConnectorAction
  2 exp /  2 tot  runtime/debt  → IsKind, SnapshotID
  2 exp /  4 tot  runtime/debt/trim  → IsAction, SuggestTrim
  2 exp /  2 tot  runtime/goalpiloting  → PilotBlock.Error, CanClose
  2 exp /  2 tot  runtime/preview  → TeardownOf, EmittedSurface.sortedHashes
  2 exp /  4 tot  runtime/semanticdiff  → LandedTypes, IsLanded
  2 exp /  3 tot  runtime/stackemit  → Targets, InterpreterSidecar
  2 exp /  2 tot  runtime/workspace  → Workspace.CanObserve, Workspace.CanReachTruthStore
```

## SYNTHÈSE ACTIONNABLE (trace déterministe paquet-par-paquet)

**Bilan honnête : sur 753 « injoignables », il n'y a PAS 753 trous.**
- **~684 twin-by-design** — le front (front/web/lib, 284 twins TS) réimplémente + pilote le moteur en prod (ADR 0072) ; le Go dort en autorité testée. PAS un trou.
- **8 reached-via-gateway** — les serveurs MCP de `serverBuilders` dispatchés via `gateway_call` (transport in-process invisible à deadcode). PAS un trou.
- **~44 by-design** — enum-validators (IsKnownX), Serialize/Canonicalize, Example* fixtures, spike dp19, variantes-riches de hooks.
- **~16 funcs / 3 capacités genuine-gap**, dont **2 vrais câblages manquants** :

### Les 2 VRAIS trous
1. **`runtime/harness` (Ashby T1)** — templates conformant-CRUD (ConformantCrudCell, CrudFragment, Topologies…). **0 consommateur** (ni Go, ni twin, ni route, ni emitter). Le seul trou net. **HIGH.** Câbler : outil MCP `harness_fragment` OU attacher `ConformantCrudCell` comme miroir de conformité aux cellules CRUD émises.
2. **`hooks/postkernelchange`** — le red-wave fan-out auto sur changement kernel. Le hook **n'est pas enregistré** dans settings.json → l'auto-fire ne se déclenche jamais (le calcul existe en twin red-wave.ts). **MEDIUM.** Câbler : enregistrer + compiler le binaire (comme ADR 0075 pour wall/done-gate).

### Faux trou (correction d'une erreur précédente)
3. **`honoemit.EmitDesktopChild`/`EmitMobileChild`** — **doublon mort**, PAS une capacité manquante. Le déploiement émet DÉJÀ les 3 enfants (web/mobile/desktop) : `runFound → FoundProject → recompileFamilies(AllFamilies())` (found.go:185-214, via `ReproduceWithCapitalised`). Les fonctions `Emit{Desktop,Mobile}Child` bares sont un doublon à /trim. **LOW (rangement).**

> Reste réel côté desktop : la SOURCE Electron est émise, mais **aucun chemin pour la VOIR** (pas de build+run+stream du GUI). C'est le « voir Electron » à câbler (CDP screencast, le webVNC faisable).
