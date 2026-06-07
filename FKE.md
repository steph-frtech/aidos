# FRACTAL KERNEL ENGINEERING (FKE)

> **Statut :** document fondateur v0.1 (draft) — provenance **humaine** (l'intention est de S.V. ; l'agent est le scribe). Devient vérité par sa propre loi : idée → grill → décision. **Note de nommage :** le prompt source disait « Fractal Kernel Vibing » ; le nom retenu est **Fractal Kernel Engineering**. Le *vibe* est une **phase contenue** (le Vibe Lab, §3), pas le nom de la discipline. L'abréviation est **FKE**.
>
> **Filiation :** FKE est la généralisation universelle dont **KRD** (Kernel-Ratchet Development, `KRD.md`) est la méthode produit-logiciel et **AIDOS** le runtime de référence. Rien ici ne contredit le Tome ; tout le précise et l'étend (§45).

---

## 1. DÉFINITION GÉNÉRALE

### 1.1 La thèse

Le code IA ne doit pas être généré directement depuis un prompt. **Le prompt est un signal brut. Le vibe donne l'élan. Le kernel donne la forme. La preuve donne la confiance. La police donne les limites. La mémoire donne la continuité. La conscience donne l'alignement.**

FKE transforme `prompt → code` en :

```
vibe / signal brut → intention structurée → kernel proposé → validation → contrat
→ invariants → preuves attendues → sécurité → context pack → agent paramétré
→ harness contrôlé → réalisation → preuves observées → police → conscience
→ drift ou alignement → décision → mémoire → graphe vivant
```

**Le code n'est pas la vérité. Le code est une projection exécutable d'un kernel d'intention validé.** La vraie sortie n'est pas un fichier : c'est un **graphe vivant de kernels** qui explique, pour chaque artefact : pourquoi il existe, quel contrat il respecte, quelles preuves le valident, quelle sécurité le protège, quelle mémoire l'a influencé, quel agent l'a généré, quel harness l'a encadré, quelle policy l'a autorisé, quelle conscience l'a réconcilié, quelle décision l'a promu.

### 1.2 Le kernel

Toute intention, tout artefact, toute action, toute preuve, toute mémoire, toute policy, tout agent, toute skill, tout MCP, tout test, tout code, toute documentation, toute infra et toute décision **peut être représenté comme un kernel**.

Un kernel est une **unité typée** de : sens · contrat · comportement · contrainte · preuve · projection · sécurité · mémoire · gouvernance · observabilité · liens.

Un kernel n'est **pas forcément du code**. Un kernel peut représenter : une idée, un besoin, une intention, une user story, une règle, un invariant, un scénario BDD, une fonction, une classe, une API, une CLI, un script, une migration SQL, une infra Terraform/Pulumi, un Dockerfile, un pipeline CI/CD, un test, un résultat de test, une preuve, un benchmark, un prompt, une skill, un agent, un MCP tool, un workflow, une policy, une police, une mémoire, une décision, une documentation, un incident, un refactor, une optimisation, un déploiement, une observation runtime.

**Universalité.** Le système fonctionne pour : backend, frontend, API, librairie, CLI, fonction pure, algorithme, parser, script, notebook, data pipeline, modèle ML, agent IA, skill, prompt, MCP server/tool, workflow, migration DB, Docker, Kubernetes, Terraform/Pulumi, CI/CD, observabilité, sécurité, policy-as-code, documentation, bugfix, refactor, optimisation, incident, audit, runtime.

### 1.3 L'ANATOMIE SYMÉTRIQUE — le mur comme plan de miroir

C'est le cœur structurel de FKE. L'anatomie canonique d'un kernel est **symétrique autour du Mur d'Intention** : chaque slot au-dessus a son **reflet** en dessous. Le mur est un **plan de symétrie**.

| # | AU-DESSUS (humain, possède) | | # | EN-DESSOUS (agent, reflète) |
|---|---|---|---|---|
| **s1** | Spec textuelle (intention, buts, non-buts, risques, hypothèses) | ↔ | **s10** | Documentation textuelle finale |
| **s2** | Use cases / comportements (BDD) — *ubiquitaire* | ↔ | **s9** | Doc du use case **dérivée du code** — *ubiquitaire* |
| **s3** | Modèle de donnée **au sens humain** — *ubiquitaire* | ↔ | **s7** | Projection en données (schéma + données réelles) — *ubiquitaire* |
| **s4** | Scénarios de test + contrat de preuve attendu — *ubiquitaire* | ↔ | **s5** | Code du test · **s6** Résultat observé — *ubiquitaire* |
| — | | | **s8** | **Le code lui-même — OPTIONNEL** |

Quatre conséquences fondatrices :

1. **Le « miroir » se généralise en QUATRE familles de paires.** Pas seulement scénario↔test (s4↔s5/s6) : le **doc-miroir** (s2↔s9 : la doc *dérivée du code* doit re-dire le use case déclaré — tue mécaniquement la dérive documentaire), le **data-miroir** (s3↔s7 : la projection doit refléter le modèle humain), le **spec-miroir** (s1↔s10). Une paire qui diverge = soit l'implémentation est rouge, soit la vérité doit évoluer (la boucle, §35).
2. **s8 est le seul slot sans contrepartie au-dessus** — c'est *précisément* pourquoi l'agent le possède, et pourquoi il est **optionnel** : un kernel-vue, un kernel-policy ou un kernel-doc est **déclaratif pur**, entièrement émis depuis d'autres kernels, sans code propre.
3. **Le mur est aussi une frontière de LANGUE.** Tout ce qui se *lit* (s2,s3,s4 et leurs reflets s9,s7,s6) parle la **langue ubiquitaire** du domaine. Les seuls slots non-ubiquitaires sont **s5 et s8 — le code**. La zone machine est exactement la zone de l'agent ; l'humain ne lit jamais autre chose que sa langue, *y compris les retours d'en bas*.
4. **La conscience (§6.3) est le comparateur des paires réfléchies.** Aligné = chaque paire concorde. Drift = une paire diverge. La loi de complétude devient : *un kernel dont un slot requis manque ou dont une paire diverge sans décision est un monstre*.

La symétrie vaut aussi pour les **facettes transversales** : la sécurité (§8) a sa moitié intentionnelle (au-dessus) et sa moitié implémentée (en-dessous) ; la mémoire, la policy et la doc pareillement. **Tout le manifest (§19) est organisé en deux colonnes réfléchies + la boucle qui les compare.**

**Kernel effondré (anti-explosion).** L'anatomie est un **gabarit**, pas une taxe ×10 : un kernel-feuille peut *effondrer* des slots dérivables (s1≈s2 ; s9/s10 entièrement générés ; s8 absent). La règle est « le plus petit cliquet qui clique » : on n'instancie un slot que s'il porte une vérité propre.

---

## 2. PRINCIPES FONDATEURS — les 25 lois

1. Le prompt n'est pas la spec.
2. Le chat est un signal brut.
3. Le vibe est une phase d'exploration, pas une source de vérité.
4. Le code n'est pas la vérité.
5. Le kernel validé est la vérité intentionnelle.
6. Le code est une projection.
7. Toute règle cachée dans le code est un drift.
8. Toute hypothèse doit être explicite.
9. Toute permission doit être explicite.
10. Tout effet de bord doit être déclaré.
11. Toute action sensible passe par une police.
12. Toute mémoire est un kernel.
13. Toute policy est un kernel.
14. Toute police est un kernel.
15. Tout agent est un kernel paramétré.
16. Toute skill est un kernel.
17. Tout MCP est une frontière de sécurité.
18. Tout contexte donné à l'IA est un Context Pack.
19. La confiance du modèle n'est pas une preuve.
20. Une preuve observée vaut plus qu'une confiance déclarée.
21. Le cerveau droit ne modifie jamais seul le dessus du mur.
22. La conscience ne cache jamais les écarts.
23. Tout changement de sens, de contrat ou de sécurité exige une décision.
24. Tout artefact durable doit être relié dans le Kernel Graph.
25. Le système apprend uniquement par mémoire validée ou par décision traçable.

**Phrase fondatrice :** *« Fractal Kernel Engineering est une approche de code IA dans laquelle le vibe produit des signaux, les kernels structurent l'intention, les agents réalisent sous harness, la police contrôle les actions, les preuves établissent la confiance, la mémoire conserve le savoir validé, et la conscience réconcilie en permanence ce qui était voulu, ce qui a été construit, ce qui est prouvé et ce qui est autorisé. »*

---

## 3. LE VIBE LAB

FKE **ne rejette pas** le vibe coding : il le **contient** dans une zone dédiée, le **Vibe Lab** — la zone d'exploration rapide : prototype, spike, brouillon, exploration d'architecture, génération jetable, maquette, essai de lib, expérimentation UI, simulation, POC, comparaison d'options, code temporaire, learning notes.

Tout ce qui en sort porte le statut : `experimental · untrusted · not_promoted · not_production_ready · disposable · needs_kernelization`.

**Règle absolue : `raw vibe → production` est INTERDIT.** Le flux correct :

```
raw vibe → Vibe Lab → raw signal → cerveau gauche → kernel proposé → validation
→ cerveau droit → preuves → conscience → promotion
```

```yaml
vibe_lab_kernel:
  id: vibe_lab.prototype.safe-mcp-readonly
  type: vibe_lab_kernel
  layer: exploration
  status: { trust: experimental, production_allowed: false }
  allowed: [explore, prototype, compare_options]
  forbidden: [merge_to_main, deploy_to_production, modify_security_policy, become_source_of_truth]
  required_before_promotion:
    [intent_kernel, contract, invariants, security_profile,
     evidence_contract, consciousness_review, decision_record]
```

*(Référence AIDOS : la zone `/spike` — ratchet OFF, rigueur T0, écritures confinées — est un Vibe Lab opérationnel.)*

---

## 4. VIBE-TO-KERNEL PROMOTION GATE

Le **Promotion Gate** décide si un artefact vibe-coded devient un kernel durable. Il exige : intention claire, objectifs, non-objectifs, contrat, entrées, sorties, invariants, contraintes, erreurs attendues, hypothèses, sécurité, effets de bord, preuves attendues, tests ou évidence équivalente, owner, reviewability, links, rapport de conscience, décision (utilisateur ou Governor), absence de drift critique, absence de permission implicite, absence de secret exposé, absence de règle cachée.

Décisions possibles : `promote_to_kernel · keep_as_experiment · rewrite_from_kernel · reject · delete · ask_user_decision`.

```yaml
promotion_gate:
  id: gate.vibe-to-kernel.v1
  candidate: vibe_lab.prototype.safe-mcp-readonly
  checks:
    intent_present: true
    contract_complete: true            # s1-s4 instanciés ou effondrés justifiés
    invariants_declared: true
    security_profile: { secrets_exposed: false, implicit_permissions: false }
    hidden_rules_scan: clean           # déterministe (diff sémantique proto vs contrat)
    evidence_contract: E2_minimum
    consciousness_review: aligned
    owner: s.vigneron
  decision: promote_to_kernel          # par décision humaine/governor, jamais par l'agent
  on_promote:
    - create: intent_kernel + contract_kernel + evidence_contract
    - rewrite_from_kernel: true        # le proto n'est JAMAIS promu tel quel : on ré-émet
    - link: derived_from -> vibe_lab.prototype.safe-mcp-readonly
```

*(Référence AIDOS : `/harvest` (spike → Idea DRAFT) + `/grill` (verdict sharp/fuzzy/bad) + `/goal` = le gate en trois gestes ; « rewrite_from_kernel » = la ré-projection, jamais la restauration d'artefact.)*

---

## 5. RAW SIGNAL, SPEC ET LES 7 NIVEAUX DE VÉRITÉ

La description textuelle, le chat, les tickets, logs, docs, erreurs, notes et prototypes **ne sont pas la spec** : ce sont des **raw signals**.

| Niveau | Nom | Définition |
|---|---|---|
| 1 | **Raw Truth** | ce qui a été dit, collé, observé ou généré expérimentalement |
| 2 | **Interpreted Truth** | ce que le cerveau gauche pense avoir compris |
| 3 | **Proposed Truth** | ce qui est proposé au-dessus du mur |
| 4 | **Accepted Truth** | ce qui est validé par l'utilisateur ou un Governor |
| 5 | **Projected Truth** | ce qui est généré (code, config, prompt, test, doc, MCP, infra) |
| 6 | **Observed Truth** | ce que tests, logs, métriques, evals, scans et runtime montrent |
| 7 | **Reconciled Truth** | ce que la conscience conclut après comparaison |

**Règle :** une vérité brute ou inférée ne devient jamais opérationnelle sans validation ou promotion. (Niveaux 1-4 = montée vers le mur ; 5-6 = la descente en reflet ; 7 = la boucle qui referme la symétrie.)

---

## 6. LES TROIS CERVEAUX

### 6.1 Cerveau gauche — Intent Compiler

**Lit** : raw signal, vibe notes, chat, logs, tickets, docs, code existant, erreurs, prototypes, mémoire brute autorisée. **Produit au-dessus du mur** : intention, objectifs, non-objectifs, contexte, langage ubiquitaire, contrat, entrées/sorties, invariants, contraintes, comportements attendus, erreurs attendues, hypothèses, risques, sécurité intentionnelle, permissions, effets de bord autorisés/interdits, preuves attendues, questions à valider — c'est-à-dire **les slots s1→s4**. **Il ne code pas. Il propose.** Il ne marque jamais une proposition comme acceptée seul.

### 6.2 Cerveau droit — Realization Compiler

**Reçoit uniquement** : kernels acceptés, contrats validés, Context Pack minimal, policies applicables, skills autorisées, harness, evidence contract. **Produit sous le mur** : plan, décomposition, tests, code, prompts, agents, skills, MCP tools, workflows, scripts, infra, migrations, configs, doc générée, logs, métriques, evidence reports — **les slots s5→s10**. **Il ne peut pas modifier seul** : intention, contrat, invariants, sécurité, permissions, objectifs, preuves attendues, décisions. S'il découvre que le haut du mur doit changer, il **produit une proposition** (loi 21).

### 6.3 Conscience — Alignment Governor

**Compare** : le voulu, le validé, le construit, le prouvé, l'autorisé, l'observé — concrètement, **les paires réfléchies de l'anatomie** (s1↔s10, s2↔s9, s3↔s7, s4↔s5/s6) plus les facettes (sécurité déclarée↔implémentée, policy↔enforcement).

**Détecte** : `aligned · incomplete · bug · semantic_drift · contract_drift · security_drift · performance_drift · documentation_drift · test_gap · evidence_gap · hidden_rule · undeclared_side_effect · unsafe · overpowered_agent · context_rot · doom_loop · needs_user_decision`.

**Produit** : consciousness report, drift report, decision cards, correction proposals, promotion decisions, blocking decisions. **Elle ne cache jamais les écarts** (loi 22). La conscience est **déterministe d'abord** : la comparaison des paires est un calcul (diff sémantique, hash, parité) ; le jugement LLM est l'exception barricadée, re-vérifiée par le calcul.

---

## 7. LES MURS

**Un seul mécanisme, cinq facettes, application fractale.** Le mur n'est pas multiplié par kernel : c'est UN plan d'enforcement fail-closed, *scopé* par kernel — sinon on multiplie les points de confiance.

### 7.1 Intent Wall
Sépare **au-dessus** (intention, contrat, invariants, contraintes, risques, sécurité intentionnelle, permissions, effets de bord autorisés, preuves attendues, décisions validées, langage commun, hypothèses, non-objectifs — s1→s4) de **sous le mur** (code, tests, prompts, agents exécutables, skills, MCP, configs, pipelines, infra, migrations, docs générées, logs, métriques, scans, evals, preuves observées — s5→s10). **Règle :** le cerveau droit agit sous le mur ; toute modification au-dessus exige proposition + décision.

### 7.2 Security Wall
Protège : secrets, permissions, données sensibles, effets de bord, appels MCP, appels API externes, écriture en base, suppression, déploiement, migration, paiement, remboursement, envoi d'email, modification de policy, modification de mémoire validée, modification de droits. Décisions : `allow · block · require_approval · require_more_evidence · require_rollback · require_dry_run · require_human_decision`.

### 7.3 Runtime Wall
Protège l'exécution réelle : production, réseau, système de fichiers, base, secrets, coûts, quotas, timeouts, déploiements, jobs, schedulers.

### 7.4 Memory Wall
Sépare mémoire brute / inférée / proposée / acceptée / observée / vérifiée / contradictoire / dépréciée. **Le cerveau droit ne lit jamais la mémoire brute sans filtrage** : il reçoit une mémoire validée, scoped et utile, dans un Context Pack.

### 7.5 Policy / Police Wall
**Policy = la loi. Police = l'application de la loi. Governor = l'arbitre. Consciousness = le réconciliateur.** La police intercepte : lecture/écriture de fichier, tool call, MCP call, commande shell, accès mémoire, accès secret, modification de manifest, modification de policy, déploiement, action runtime.

---

## 8. SÉCURITÉ AU-DESSUS ET SOUS LE MUR (sécurité fractale)

La sécurité est présente **partout** — dans chaque kernel, agent, skill, MCP, prompt, mémoire, context pack, harness, projection, exécution — et elle est **symétrique** :

**8.1 Au-dessus (la sécurité INTENTIONNELLE)** : classification des données, finalité, permissions, interdictions, rôles, capability model, actions sensibles, effets de bord, réversibilité, approbation humaine, règles d'audit, minimisation, rétention, conformité, threat model, abuse cases, secrets nécessaires/interdits, règles prompt-injection, règles exfiltration, règles MCP, règles agentiques.

**8.2 Sous le mur (la sécurité IMPLÉMENTÉE — le reflet)** : authn, authz, input validation, output filtering, field allowlist, redaction, sandbox, capability lease, injection de secrets sans exposition, policy-as-code, audit logs, rate limits, timeouts, isolation réseau, SAST, DAST, dependency scan, SBOM, container scan, MCP gateway, evals anti-prompt-injection, tests d'exfiltration, rollback, dry-run, kill switch.

La conscience compare 8.1↔8.2 comme toute paire : une capacité implémentée sans intention déclarée = `security_drift`.

```yaml
security_kernel:
  id: sec.returns-service.v2
  above_wall:
    data_classification: { customer_email: PII, order_total: internal }
    permissions: { read: [orders], write: [return_requests] }
    forbidden: [delete_orders, export_pii, network_egress_other_than(api.payments)]
    sensitive_actions: { refund: require_approval, db_migration: require_dry_run }
    threat_model: [prompt_injection_via_ticket_text, exfiltration_via_log]
  below_wall:
    authz: rls_by_project_id
    field_allowlist: [id, status, reason, created_at]
    secret_injection: env_at_boot_never_in_source
    scans: [gitleaks, sast, dependency, sbom]
    kill_switch: police.returns.kill
```

```yaml
police_kernel:
  id: police.mcp.tool_call_interceptor
  intercepts: [mcp_call, shell_command, file_write, secret_access, memory_write, deploy]
  checks: [capability_lease_valid, field_allowlist, egress_allowlist, blast_radius<=approved]
  on_violation: { action: block, emit: BlockReason{code,severity,explanation,how_to_fix[]}, audit: merkle_ledger }
  fail_mode: closed
```

---

## 9. MÉMOIRE — Kernel Memory System

Une mémoire n'est jamais une connaissance vague « dans la tête de l'IA ». **Une mémoire est un kernel** avec : id, type, source, contenu, classification, trust status, scope, owner, TTL, access policy, provenance, links, contradictions, lifecycle.

**Trust statuses :** `raw · inferred · proposed · accepted · observed · verified · contradicted · deprecated · expired`.

**Types :** raw signal memory, accepted intent memory, project conventions memory, style memory, architecture memory, security memory, evidence memory, failure memory, incident memory, drift memory, pattern memory, anti-pattern memory, lexicon memory, agent behavior memory, MCP behavior memory, user decision memory.

**Memory Police** : contrôle lecture/écriture, classification, scope, TTL, contradiction, minimisation, injection en Context Pack.

**Memory Bank = une PROJECTION**, jamais la vérité :
```
memory-bank/ { architecture.md, decisions.md, conventions.md, progress.md, gotchas.md }
```
sont des vues lisibles **générées depuis les Memory Kernels** (comme `CLAUDE.md`/`AGENTS.md`, §20).

```yaml
memory_kernel:
  id: mem.convention.no-drizzle
  type: project_conventions_memory
  content: "L'accès Postgres de l'app émise = client TS léger + Atlas ; jamais Drizzle."
  trust: accepted          # décision utilisateur tracée
  scope: { project: aidos, layers: [data, infra] }
  ttl: none
  provenance: decision.adr-0040
  contradicts: []
  access: { right_brain: via_context_pack_only }
```

---

## 10. POLICY ET POLICE

**Policy Kernel** : intention, règle, sujet, action, ressource, conditions, exceptions, preuve requise, projection policy-as-code, tests, owner, lifecycle.
**Police Kernel** : intercepte, vérifie, autorise, bloque, demande preuve, demande approval, journalise, alerte, révoque des capabilities, déclenche le kill switch.

Policies canoniques : no hidden meaning · no undeclared side effects · right brain cannot change above wall · no raw memory for right brain · no agent secret access · MCP field allowlist required · production actions require approval · destructive actions require rollback · prompt output cannot override policy · skill cannot widen permissions · harness must block secrets · generated code must be reviewable.

```yaml
policy_kernel:
  id: policy.right-brain.no-above-wall-write
  rule: { subject: brain_role=right_brain, action: write, resource: above_wall/*, effect: deny }
  exceptions: [{ action: propose, effect: allow }]
  required_evidence: fault_injection_proves_block
  projection: policy_as_code/gate_action.yaml   # la loi est SOURCE ; l'enforcer est sa projection
  tests: [policy.right-brain.no-above-wall-write.test]
  owner: governance
```

*(Référence AIDOS : GV05 — `policy.yaml` compilé vers les enforcers Go fail-closed, équivalence prouvée par miroir : la YAML produit les mêmes BlockReason que le code.)*

---

## 11. AGENTS PARAMÉTRÉS

**Il n'existe pas une IA générale unique. Chaque IA est une instance paramétrée.**

```
Agent = BrainRole × Layer × KernelType × Operation × RiskLevel × AutonomyLevel
        + Skills + Harness + Policies + Context Pack + Memory Access + Evidence Contract
```

Un agent **n'est pas défini par son prompt** mais par : brain_role, layer, kernel_type, operation, risk_level, autonomy_level, skills autorisées/interdites, harness, context pack, policies, police, memory access, tools, MCP, evidence contract, output format, failure policy, audit.

**Brain roles :** `left_brain · right_brain · consciousness · governor · police · memory · evidence_runner · reviewer · adversarial_reviewer · runtime_guardian`.

**Layers :** `vibe · intent · code · data · api · ui · mcp · agentic · skill · prompt · workflow · infra · security · evidence · documentation · memory · governance · runtime`.

**Kernel types (sélection) :** function, class, module, api, endpoint, cli, mcp_tool, mcp_server, agent, skill, prompt, workflow, test, evidence, security_policy, police, memory, migration, infra, refactor, bugfix, optimization, documentation, incident.

**Autonomy levels :**
```
A0 observe_only            A1 suggest_only           A2 generate_draft
A3 modify_in_sandbox       A4 open_pull_request      A5 merge_with_checks
A6 execute_non_production  A7 execute_production_with_approval
A8 autonomous_bounded_scope   # JAMAIS pour des actions critiques sans boundaries très fortes
```

Exemples de profils (la grille se lit `agent.<brain>.<layer>.<kernel_type>.<operation>`) :
`agent.left.code.function.contract_builder` (A1) · `agent.right.code.function.implementer` (A3) · `agent.consciousness.code.function.reconciler` (A0) · `agent.left.mcp.tool.contract_designer` (A1) · `agent.right.mcp.tool.implementer` (A3, harness readonly) · `agent.police.mcp.tool_call_interceptor` (A0, fail-closed) · `agent.left.security.policy_designer` (A1) · `agent.right.security.policy_as_code_projector` (A3) · `agent.consciousness.documentation.aligner` (A0, doc-miroir s2↔s9).

---

## 12. SKILLS — kernels de capacité

Une skill n'est pas un prompt. Elle déclare : id, intention, applicable_to, required inputs, produced outputs, forbidden actions, side effects, evidence, evals, security, version, owner, links.

Types : extract intent · define contract · write unit tests · write property tests · run typecheck · implement pure function · generate OpenAPI · write MCP tool · classify data · generate policy-as-code · detect prompt injection · threat model MCP · write rollback plan · generate documentation · review diff · detect semantic drift · detect hidden rule · build context pack · summarize memory · update memory projection.

**Skill = la capacité. Harness = le cadre d'exécution. Policy = la règle. Police = l'enforcement. Context Pack = le contexte contrôlé. Evidence Contract = la preuve attendue.**

```yaml
skill_kernel:
  id: skill.detect-semantic-drift
  intent: "Comparer la paire s2↔s9 d'un kernel et classer la divergence"
  applicable_to: [any_kernel_with_code]
  inputs: [kernel_manifest, code_diff]
  outputs: [drift_report]
  forbidden: [modify_above_wall, write_memory_accepted]
  evidence: { evals: [drift-fixture-corpus], determinism: same_input_same_verdict }
```

---

## 13. HARNESS — kernel d'exécution contrôlée

Un harness définit : sandbox, fichiers lisibles/modifiables, commandes autorisées/interdites, réseau, secrets, MCP autorisés, tools autorisés, memory access, fixtures, test runner, eval runner, scanners sécurité, timeouts, quotas, audit logs, gates, rollback, dry-run, output format, failure policy. Un harness est lui-même **versionné, testé, gouverné, audité, relié au Kernel Graph**.

Exemples : `harness.function.pure-typescript` (aucun IO, fast-check requis) · `harness.mcp-tool.secure-readonly` (egress allowlist, field allowlist, zéro write) · `harness.security.policy-as-code` (projection seule) · `harness.infra.terraform-plan-only` / `harness.infra.pulumi-preview-only` (jamais apply) · `harness.agent.shadow-mode` (observe, ne touche rien) · `harness.db-migration.dry-run-required` (backup + rollback prouvés avant apply).

**Le même agent porte un harness différent selon le risque.**

---

## 14. AGENT FACTORY / PROFILE RESOLVER

L'**Agent Factory Kernel** sélectionne automatiquement profil + skills + harness + policies + context pack + evidence contract + autonomie + police, **par fonction pure** sur les attributs du kernel cible (jamais par jugement LLM).

```yaml
agent_resolution:
  inputs:
    kernel_type: mcp_tool_kernel
    layer: mcp
    brain_role: right_brain
    operation: implement
    risk_level: high            # expose des données
    side_effects: none_declared
    data_classification: PII
    evidence_level: E4
    target_environment: staging
    blast_radius: medium
  output:
    selected_agent: agent.right.mcp.tool.implementer
    selected_harness: harness.mcp-tool.secure-readonly
    selected_skills: [write_mcp_tool, threat_model_mcp, write_unit_tests]
    selected_policies: [mcp_field_allowlist_required, no_agent_secret_access]
    selected_context_pack: ctx.mcp.github-issues.v3
    selected_evidence: { minimum: E4, includes: [schema_tests, allowlist_tests, security_evals] }
    selected_autonomy: A3
```

---

## 15. CONTEXT PACK ET CONTEXT FIREWALL

Le cerveau droit **ne reçoit jamais « tout le repo » ni « tout le chat »**. Il reçoit un **Context Pack minimal** : kernels acceptés, contrats, invariants, fichiers pertinents, code graph pertinent, mémoire validée, style kernels, architecture kernels, policies applicables, commandes autorisées, evidence contract, harness, exclusions.

Il **exclut** : raw chat non validé, secrets, propositions rejetées, fichiers hors scope, données personnelles inutiles, mémoire contradictoire/expirée, anciennes hypothèses, bruit.

Organes : **Context Police** (filtre fail-closed) · **Context Rot Detector** (conversation trop longue, corrections répétées, contraintes oubliées, mélange de tâches, stale assumptions, modèle qui tourne en rond) · **Context Budget** · **Context Checkpoint** · **Context Rebuild** · **Doom Loop Detector** (§27). Actions sur rot : `stop · rewind · clear · rebuild_context_pack · create_diagnosis_kernel`.

*(Référence AIDOS : le ContextRouter est « un algorithme, pas un prompt » ; headroom comprime sous le cap ; le pack est branch-aware et scoped projet.)*

---

## 16. EVIDENCE-FIRST

Remplacer « test » par **evidence**. Types : typecheck, lint, unit, integration, contract, property-based, fuzz, mutation, snapshot, golden output, benchmark, load, dry-run, restore test, rollback test, policy tests, SAST, DAST, dependency scan, SBOM, container scan, prompt eval, agent eval, MCP contract test, red-team eval, screenshot, human review, runtime observation, audit log, preuve formelle quand possible.

**Niveaux :**
```
E0 none                E1 syntax/typecheck/lint     E2 unit tests
E3 contract/integration  E4 security/regression     E5 fuzz/mutation/benchmark/evals
E6 runtime proof/monitoring/rollback                E7 formal/quasi-formal proof
```

Chaque kernel porte : `expected_evidence` (la moitié haute de la paire s4) · `observed_evidence` (la moitié basse s6) · `evidence_gap` · `evidence_status`.

**Règle : un kernel n'est pas terminé quand le code compile. Il est terminé quand les preuves attendues sont observées ET réconciliées.**

```yaml
evidence_contract:
  kernel: code.function.dedupe_by_id
  expected:
    - { type: typecheck, level: E1 }
    - { type: unit, level: E2, cases: [empty, duplicates, ties_on_timestamp] }
    - { type: property, level: E5, props: [idempotent, order_independent_result, no_loss_of_latest] }
    - { type: mutation, level: E5, threshold: 0.85 }
  observed: []          # rempli par l'evidence runner, jamais déclaré
  status: under_proven  # tant que expected ⊄ observed
```

*(Mapping KRD : N0 journey↔E3, N1 invariant↔E5(property), N2 workflow↔E3(fixture), N3 contrat↔E3(Pact), N4 unit↔E1/E2, N5 infra↔E3/E4 — FKE ajoute explicitement E4 sécurité, E6 runtime et E7 formel au MÊME contrat.)*

---

## 17. PROOF OBLIGATIONS

Chaque kernel peut générer des obligations de preuve : `prove_no_public_api_change · prove_no_permission_widening · prove_no_secret_exposure · prove_no_hidden_side_effect · prove_contract_satisfied · prove_invariant_projected · prove_rollback_available · prove_mcp_readonly · prove_agent_does_not_act_outside_scope · prove_memory_not_raw · prove_doc_aligned` (la paire s2↔s9 !).

**Tant qu'une proof obligation requise manque : `kernel_status = under_proven`.**

---

## 18. KERNEL GRAPH ET CODE GRAPH

Deux graphes reliés. **Code Graph** : fichiers, symboles, fonctions, classes, imports, calls, dependencies, tests, entrypoints. **Kernel Graph** : raw signals, kernels, contracts, invariants, policies, agents, skills, harnesses, context packs, memories, decisions, projections, evidence, drift, runtime observations.

**Liens** : `derived_from · proposes · accepted_as · implements · refines · decomposes_into · composed_by · projects_to · generated_by · tested_by · verified_by · observed_by · secured_by · governed_by · depends_on · impacts · calls · exposes · consumes · mutates · reads · writes · uses_secret · requires_capability · requires_approval · contradicts · drifts_from · replaces · deprecated_by`.

Le système répond à : *pourquoi cette ligne existe ? quel kernel la justifie ? quel invariant elle implémente ? quelle preuve la valide ? quelle policy la protège ? quel agent l'a générée ? quel harness l'a autorisée ? quelle mémoire l'a influencée ? quel changement l'impacte ?*

```
$ kernel explain src/returns/dedupe.ts:42
  kernel: code.function.dedupe_by_id (accepted v3)
  intent: "garder l'occurrence la plus récente par id"   [s1]
  contract: pure, total, ordre stable                     [s2-s4]
  evidence: E5 observed (property+mutation 0.91)          [s6]
  policies: pure-function.no-io                           secured_by: harness.function.pure-ts
  generated_by: agent.right.code.function.implementer run#812
  decisions: DC-0214 (tie-break = timestamp puis index)
```

---

## 19. KERNEL MANIFEST FORMAT (KMF) ET KIR

**KMF** = la représentation versionnée (fichier). **KIR** (Kernel Intermediate Representation) = la représentation intermédiaire content-adressée utilisée par les cerveaux et les projection engines (en pratique : l'AST en base, append-only ; le KMF est sa matérialisation lisible).

Le manifest est **organisé par la symétrie** :

```yaml
kernel:
  id: api.returns.create_return_request
  type: endpoint_kernel
  layer: api
  version: 4
  status: { truth: accepted, evidence: under_proven, lifecycle: active }
  owner: team.returns
  raw_sources: [signal.chat.2026-06-02#412, signal.ticket.RET-119]

  above_wall:                       # s1..s4 — l'humain possède
    s1_spec:
      intent: "Un client crée une demande de retour pour une commande livrée"
      goals: [retour en < 3 clics]
      non_goals: [remboursement automatique]
      assumptions: [commande livrée depuis < 30 jours]
      risks: [fraude au retour]
    s2_behavior:        # ubiquitaire (BDD)
      use_cases:
        - "Étant donné une commande livrée, quand le client demande un retour, alors une demande pending est créée"
      errors_expected: [ORDER_NOT_DELIVERED, RETURN_WINDOW_EXPIRED]
    s3_model:           # ubiquitaire (sens humain)
      entities: { ReturnRequest: [id, order_ref, reason, status: pending|approved|rejected] }
    s4_proof_contract:  # ubiquitaire
      scenarios: [create_return_request_should_create_pending_return]
      expected_evidence: { minimum: E4, includes: [contract_tests, auth_tests, policy_tests] }
    security_intent: { permissions: [customer:create_own], forbidden: [create_for_other_customer] }

  below_wall:                       # s5..s10 — l'agent reflète
    s5_test_code: { ref: tests/returns/create.spec.ts, hash: 9af2… }
    s6_evidence_observed: []        # rempli par le runner
    s7_data_projection: { ddl: migrations/0142_return_requests.sql, hash: 77c1… }
    s8_code: { ref: src/returns/create.ts, hash: 51bd…, optional: false }
    s9_doc_derived: { ref: docs/gen/returns-create.md, must_match: s2_behavior }
    s10_doc: { ref: docs/returns.md }
    security_impl: { authz: own_records_only, allowlist: [id, status, reason] }

  harness: harness.api.standard      context_pack: ctx.returns.v7
  policies: [no_undeclared_side_effects, production_requires_approval]
  memory: [mem.convention.return-window-30d]
  consciousness: { last_report: aligned, pairs: { s2_s9: ok, s3_s7: ok, s4_s56: under_proven } }
  governance: { decisions: [DC-0192], lock: above_wall_locked_v4 }
  links: { implements: intent.returns.easy-returns, depends_on: [entity.order] }
  lifecycle: active
  hash: { content: c41a…, links: 02fe…, evidence: —, context: 8b03… }
```

---

## 20. PROJECTIONS

Un kernel se projette vers : code, tests, docs, API schema, OpenAPI, SQL, migration, Terraform/Pulumi, Docker, Kubernetes, pipeline CI/CD, prompt, skill, agent config, MCP schema, MCP tool, policy-as-code, dashboard, logs, metrics, memory-bank, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`.

**Règle : `AGENTS.md`, `CLAUDE.md`, memory-bank, `.cursorrules` et `SKILL.md` NE SONT PAS la vérité.** Ce sont des **projections générées** depuis : Policy Kernels, Memory Kernels, Style Kernels, Architecture Kernels, Evidence Kernels, Agent Profile Kernels. (Toute projection est régénérable, hash-protégée, jamais hand-éditée.)

---

## 21. LANGAGE UBIQUITAIRE INTER-COUCHES

Un concept doit être **reconnaissable dans toutes les couches** : humain, BDD, code, test, DB, API, event, log, metric, MCP, skill, agent, doc, CI/CD, policy, memory.

```yaml
lexicon_kernel:
  concept: ReturnRequest
  human_fr: demande de retour
  bdd: create_return_request
  code_function: createReturnRequest        code_type: ReturnRequest
  db_table: return_requests                 api: POST /return-requests
  event: ReturnRequestCreated               test: create_return_request_should_create_pending_return
  agent: return_request_agent               skill: analyze_return_request
  mcp: returns.create_return_request        pipeline: test_return_request_kernel
  policy: return_request_access_policy      metric: return_request_created_total
```

Le **Lexicon Kernel** est vérifiable par calcul : un symbole hors lexique dans une couche = drift de langue.

---

## 22. TYPES DE KERNELS (familles)

- **Exploration** : vibe_lab, spike, prototype.
- **Intent** : intent, goal, requirement, story, decision.
- **Contract** : contract, invariant, constraint, assumption, non_goal.
- **Behavior** : use_case, bdd_scenario, rule, edge_case, abuse_case.
- **Code** : function, class, module, service, adapter, repository, validator, error.
- **Data** : entity, value_object, field, state, transition, event, projection, query, table, migration.
- **Interface** : api, endpoint, cli, ui, screen, component, form.
- **AI** : agent, agent_profile, agent_run, skill, prompt, model, memory, eval, reasoning_policy.
- **MCP** : mcp_server, mcp_tool, mcp_resource, mcp_prompt, mcp_gateway, mcp_permission.
- **Workflow** : workflow, job, scheduler, queue_consumer, event_handler, automation.
- **Infra** : docker, kubernetes, terraform/pulumi, network, deployment, environment, backup, restore.
- **Security** : security_policy, police, permission, capability, secret, audit, compliance, threat, abuse_case, sandbox, side_effect, runtime_security, supply_chain.
- **Evidence** : test, test_result, evidence_contract, proof_obligation, benchmark, scan, eval, review.
- **Governance** : governor (intent/security/runtime/architecture/evidence/memory), promotion_gate, decision_card.
- **Documentation** : documentation, generated_doc, doc_alignment, changelog.
- **Runtime** : observation, metric, log, trace, alert, incident, rollback, kill_switch.

---

## 23. FRACTALITÉ

**La même structure existe à tous les niveaux** : projet, feature, module, service, API, fonction, test, MCP, skill, agent, policy, infra, workflow, documentation. Chaque kernel contient : raw sources, above wall, below wall, evidence, security, memory, consciousness, links — **la même anatomie symétrique, à toutes les échelles** (et à travers les *plans* : le système qui construit suit la même anatomie que le système construit).

**Cycle fractal :**
```
raw signal → left brain → above-wall proposal → validation → right brain
→ projections → evidence → police → consciousness → decision → memory → graph update
```

Chaque niveau descend jusqu'aux kernels plus petits — pour le code, jusqu'au plus bas niveau utile : fonction atomique, invariant, side effect isolé, validation, adapter, projection.

**Lois de composition : les couches hautes composent. Les couches basses exécutent. Les invariants remontent. Les preuves réconcilient.** (Et la règle anti-explosion : le kernel effondré, §1.3.)

---

## 24. DÉCOMPOSITION FONCTIONNELLE

Le code descend au niveau le plus bas utile. Une **fonction atomique** a : une intention, une responsabilité, des entrées, des sorties, des invariants, pas d'effet de bord si possible, des tests, de l'evidence, sa sécurité, ses liens. Une **fonction composée** orchestre des atomiques. **Interdit** : `processData()`, `handleThing()`, `doStuff()` — le langage doit être précis (lexicon, §21).

- *Pure* : `dedupeById(items) → items` — contrat total, property tests, zéro IO.
- *À effet de bord* : `sendReturnConfirmationEmail(req)` — effet **déclaré** (`side_effect: email`), police email, dry-run en test.
- *Refactor* : kernel `refactor.extract-validator` — contrat = « comportement inchangé », evidence = tests verts avant/après + semantic diff vide.
- *Bugfix* : kernel `bugfix.return-window-off-by-one` — d'abord un test rouge reproduisant, puis le fix, puis la conscience vérifie qu'aucun contrat n'a bougé.
- *Optimisation* : kernel `optimization.dedupe-O(n)` — contrat inchangé, evidence += benchmark (E5), invariant « même sortie ».

---

## 25. MCP, AGENTS, SKILLS

**Un MCP est une frontière de sécurité.** Il déclare : read/write, side effects, schemas, allowed fields, forbidden fields, auth, rate limits, audit, tests, evals, policies, security wall.
**Un agent déclare** : rôle, autonomie, capabilities, forbidden actions, tools, skills, MCP access, memory access, harness, context pack, policies, evidence, evals, logs, kill switch.
**Une skill déclare** : méthode, input, output, side effects, forbidden actions, applicability, evals, security.

**Skills define the method. Automations define the cadence. Harness defines the safe execution. Police enforces the law.**

---

## 26. REVIEWABILITY

La revue est LE goulot du code IA. Un changement IA doit être **reviewable** : diff limité, scope clair, pas de mélange feature/refactor/formatting, mapping kernels→fichiers, guide de lecture, invariants à vérifier, preuves, risques, decision cards.

**Bloquer** : diff trop large, changement non relié, tests supprimés, permission élargie, absence d'evidence, absence d'owner, changement impossible à relire. (Le Reviewability Kernel est une police : fail-closed sur ces conditions.)

---

## 27. DOOM LOOP DETECTOR

Détecte : corrections répétées, même erreur qui revient, contexte pollué, modèle qui supprime des tests, dépendances ajoutées au hasard, diff qui grossit sans progrès, hypothèses non validées, contraintes oubliées, patchs contradictoires.

**Après 2 échecs sérieux : stop → diagnosis kernel → rebuild context pack → consciousness review → éventuellement question utilisateur.** La détection est une **fonction pure de l'historique d'itérations** (oscillation rouge↔vert, hash de diff répété, zéro preuve nouvellement verte) — jamais un jugement LLM.

---

## 28. SEMANTIC DIFF, SECURITY DIFF, EVIDENCE DIFF

Le diff Git est insuffisant. Chaque changement IA produit : code diff, **kernel diff**, **semantic diff** (règle cachée, contrat changé, invariant ajouté/supprimé, comportement changé), **security diff** (permission widened, new secret access, new side effect, MCP scope broadened, audit removed, policy weakened), **permission diff**, **evidence diff** (preuve ajoutée/supprimée/manquante, tests affaiblis), **memory diff**, **context diff**, **blast radius**, decision cards.

---

## 29. BLAST RADIUS ET IMPACT ENGINE

Chaque changement calcule son impact : fichiers, kernels, APIs, DB, MCP, agents, skills, policies, tests, docs, runtime, observabilité, users, environnements. **Blast radius : `low · medium · high · critical`.** Plus il est haut, plus il faut : evidence, review, approval, rollback, dry-run, security wall, runtime wall.

---

## 30. DRIFT

Drifts : `semantic · contract · security · memory · documentation · test · evidence · API · MCP-contract · agent-behavior · prompt · runtime · performance · permission`.

**Un drift n'est pas toujours un bug.** Il peut révéler : un bug sous le mur, une spec incomplète, une règle cachée, une hypothèse à valider, un risque sécurité, une doc obsolète. La conscience classe et propose : `fix_below_wall · change_above_wall · ask_user_decision · block · keep_experimental · deprecate`.

```yaml
drift_report:
  id: drift.returns.window-check
  kernel: api.returns.create_return_request
  pair: s2_behavior <-> s9_doc_derived          # la paire qui diverge
  kind: semantic_drift
  observed: "le code accepte 31 jours ; le contrat dit 30"
  hypothesis: hidden_rule_in_code
  blast_radius: medium
  proposal: ask_user_decision    # 30 (fix below) ou 31 (change above + décision) ?
  decision_card: DC-0215
```

---

## 31. DECISION CARDS

Une Decision Card contient : titre, contexte, ce qui était validé, ce qui a été observé, l'écart, le risque, les options, la recommandation, l'impact, l'evidence, l'owner, l'expiration. Options : `accept · reject · amend · defer · ask_more_evidence · keep_experimental · promote · rollback`.

```yaml
decision_card:
  id: DC-0215
  title: "Fenêtre de retour : 30 ou 31 jours ?"
  validated: "30 jours (s2_behavior v4)"
  observed: "le code accepte 31 (test au bord vert par erreur)"
  gap: semantic_drift              risk: medium (politique commerciale)
  options:
    - { choice: fix_below_to_30, impact: "3 tests, 1 fonction" }
    - { choice: amend_above_to_31, impact: "contrat v5 + doc + 1 décision" }
  recommendation: fix_below_to_30
  evidence: drift.returns.window-check
  owner: s.vigneron
  expires: 2026-06-21
```

---

## 32. EVENT SOURCING

Chaque action importante est un événement : `SignalCaptured · VibePrototypeCreated · LeftBrainProposalCreated · ProposalAccepted/Rejected · KernelLocked · ContextPackBuilt · AgentResolved · HarnessStarted · ProjectionGenerated · EvidenceExpected/Observed · SecurityWallChecked · PoliceBlockedAction · ConsciousnessReviewCreated · DriftDetected · DecisionRequested/Accepted · KernelPromoted/Deprecated · MemoryWritten · PolicyUpdated · RuntimeObserved · IncidentCreated`.

**Git dit ce qui est. L'Event Store dit comment on y est arrivé. Le Kernel Graph dit pourquoi c'est relié. L'Evidence Store dit ce qui est prouvé. Le Memory Store dit ce qui est retenu.**

---

## 33. VERSIONING, HASHES, REPRODUCTIBILITÉ

Chaque kernel a : version, content hash, links hash, evidence hash, context pack hash, agent run hash. Chaque génération enregistre : target kernel, agent profile, harness, skills, context pack, modèle, commandes, outputs, evidence, décisions — **même si le modèle est non déterministe, la TRACE est stable** (et la projection, elle, est byte-identique : même kernel → mêmes octets).

**Kernel Lock :** quand le dessus du mur est accepté, il est **verrouillé**. Toute modification exige `proposal + decision` (optimistic-lock sur head : deux applies concurrents → le second refusé, jamais last-write-wins).

```yaml
agent_run_kernel:
  id: run.812
  target: code.function.dedupe_by_id
  agent: agent.right.code.function.implementer
  harness: harness.function.pure-typescript
  context_pack: { id: ctx.dedupe.v2, hash: 8b03… }
  model: claude-opus-4-8
  outputs: [src/returns/dedupe.ts@51bd…]
  evidence_observed: [unit:pass, property:pass, mutation:0.91]
  decisions: [DC-0214]
```

---

## 34. AUTONOMIE PROGRESSIVE

L'autonomie augmente avec : risk level, réversibilité, blast radius, historique d'evidence, maturité, classification sécurité, historique d'incidents, confiance humaine. **Maturity : `experimental → beta → stable → critical`.**

**Règle : l'autonomie augmente par PREUVE, jamais par confiance déclarée.** (Un agent monte de A3 à A5 parce que ses N derniers runs sont E4+ verts et zéro incident — un fait calculé, pas un sentiment.)

---

## 35. RUNTIME FEEDBACK LOOP — la boucle qui referme la symétrie

Après déploiement, **le kernel continue de vivre**. Observations runtime : logs, metrics, traces, audit, erreurs, latence, denial rate, tool calls, confiance agent, corrections utilisateur, blocages policy, incidents.

La conscience runtime peut **rouvrir un kernel** : contract gap, unexpected input, performance drift, security denial spike, agent misbehavior, documentation gap. **C'est la boucle au-dessus du mur** : ce qui a été implémenté/observé peut révéler que s1/s2/s3/s4 doivent changer — et cette traversée passe TOUJOURS par la porte légale (proposition → décision humaine), jamais en douce. Le monde enseigne ; l'agent ne s'enseigne pas lui-même.

---

## 36. LEGACY KERNELIZER

Pour le code existant :
```
repo existant → code graph → extraction de symboles → inférence de kernels (trust=inferred)
→ hidden rules detection → links probables → decision cards → validation utilisateur
→ promotion en kernels acceptés
```
**Règle : un kernel inféré n'est pas une vérité — il doit être validé.** (Patron strangler-fig : geler une cellule legacy avec des miroirs de caractérisation, puis refactorer dedans.)

---

## 37. PR KERNELISÉE

```markdown
## PR — [kernel(s)] <ids>
**Intention** (s1) : …               **Above-wall changes** : aucun | proposal DC-xxxx
**Below-wall changes** : fichiers + mapping kernel→fichier
**Semantic diff** : néant | détail    **Security diff** : néant | détail
**Evidence diff** : +property(x2), mutation 0.85→0.91   **Blast radius** : low
**Guide de lecture** : commencer par tests/…, puis src/…
**Proofs** : [CI run, rapports]       **Decision cards ouvertes** : DC-0215
**Consciousness report** : aligned | drifts listés      **Rollback** : n/a | plan
```

---

## 38. CLI / IDE / DASHBOARD

```
kernel status                    kernel explain <file:line>      kernel impact <kernel>
kernel verify <kernel>           kernel drift --since main       kernel promote <vibe_output>
kernel build-context <kernel>    kernel resolve-agent <kernel>   kernel run-agent <profile> <kernel>
kernel security-check <kernel>   kernel memory search            kernel policy test
kernel graph                     kernel decisions                kernel evidence
kernel rollback
```

**IDE** : afficher le kernel d'une fonction, son contrat, ses preuves, ses policies, sa mémoire, ses agent runs, ses drifts, son blast radius. **Dashboard** : kernels par statut, drifts ouverts, evidence gaps, security gaps, contradictions mémoire, agents overpowered, MCP risqués, reviewability des PR, kernel debt, couverture sémantique, couverture sécurité.

---

## 39. KERNEL DEBT

Dette : kernels sans preuves, code sans kernel, tests sans lien, règles cachées, side effects non déclarés, mémoires contradictoires, policies non projetées, MCP sans tests sécurité, agents sans harness, prompts non versionnés, docs contradictoires, context packs trop larges, décisions manquantes.

**Kernel Debt Score** = f(intent clarity, contract completeness, evidence strength, security alignment, traceability, reviewability, observability, memory quality). Le jardinage (`trim`) **propose, ne supprime jamais** — agir repasse par la porte.

---

## 40. ANTI-PATTERNS

raw vibe → production · prompt → code sans kernel · code généré sans contrat · tests supprimés pour passer · agent trop puissant · MCP trop permissif · skill sans eval · prompt non versionné · policy seulement dans un prompt · sécurité ajoutée après coup · mémoire brute injectée au cerveau droit · secrets visibles par agent · context pack trop large · fonction vague `processData` · effet de bord non déclaré · règle cachée dans le code · doc non alignée · CI/CD sans lien kernel · PR énorme non reviewable · correction répétée sans diagnostic · confiance modèle utilisée comme preuve · gouvernance implicite · absence d'owner · absence de promotion gate.

---

## 41. CINQ EXEMPLES CONCRETS

### 41.1 Fonction pure — « dédupliquer une liste d'objets par id en gardant le plus récent »
**Raw signal** : une phrase de chat. **Left brain (s1-s4)** : intent « une seule occurrence par id, la plus récente gagne » ; contrat `dedupeById<T extends {id:string; updatedAt:Date}>(items:T[]) → T[]` pur/total ; invariants : pas de perte du plus récent, résultat indépendant de l'ordre d'entrée, idempotence ; hypothèse à trancher : tie-break à `updatedAt` égal → **DC-0214** (réponse : timestamp puis index). **Evidence contract** : E1+E2+E5 (property + mutation ≥ 0.85). **Right brain (s5-s8)** : tests d'abord (rouges), puis implémentation Map-based O(n). **Conscience** : paires s4↔s5/s6 vertes, s2↔s9 alignées → `aligned`.

### 41.2 MCP tool read-only — « exposer les issues GitHub à un agent »
`mcp_tool_kernel: github.issues.list` — **au-dessus** : capability read-only, schéma de sortie, **field allowlist** `[number,title,state,labels,created_at]` (jamais body brut sans redaction — prompt-injection), permissions « aucun write, aucun secret en sortie ». **Police** : intercepte chaque tool call, vérifie allowlist + rate limit + audit Merkle. **Harness** : `harness.mcp-tool.secure-readonly` (egress = api.github.com uniquement). **Evidence** : schema tests, allowlist tests (un champ interdit dans la sortie → rouge), eval anti-injection (issue piégée → l'agent ne suit pas l'instruction). **Security wall** : `require_approval` pour tout élargissement de scope.

### 41.3 Agent — « un agent de review de PR »
`agent_profile: agent.reviewer.code.pr` — brain_role `reviewer`, autonomy **A1 (suggest_only)**, skills `[review_diff, detect_semantic_drift, detect_hidden_rule]`, forbidden `[push, merge, edit_files]`, memory access : conventions + anti-patterns (accepted only), harness `shadow-mode` puis `comment-only`, evidence : evals de précision sur corpus de PR annotées + audit de chaque commentaire, **kill switch** : `police.reviewer.kill` (un commentaire hors scope → A0). Montée A1→A4 **par preuve** (§34).

### 41.4 Refactor — « refactorer un module sans changer son comportement »
`refactor_kernel` — **contrat** : comportement public inchangé (le non-objectif EST le contrat). **Forbidden changes** : API publique, messages d'erreur, ordre des effets. **Evidence** : tests verts avant/après inchangés, **semantic diff = ∅**, mutation score non dégradé, benchmark non dégradé. **Reviewability** : diff pur-refactor (pas de feature mêlée). **Conscience** : toute paire qui bouge (s2↔s9 différent) = échec du refactor par définition.

### 41.5 Migration DB — « ajouter une colonne et backfiller »
`migration_kernel` — **au-dessus** : intent, invariant de donnée « zéro perte, zéro ligne orpheline », fenêtre, réversibilité. **Harness** : `dry-run-required` + backup prouvé AVANT (restore test = la preuve que le backup marche). **Pipeline** : expand-contract, forward-only ; étape destructive → `require_human_decision` (security wall) ; **runtime wall** : quotas + heure creuse. **Evidence** : dry-run vert, intégrité post-migration (comptages, FK), rollback testé. **Approval** : decision card avec blast radius.

---

## 42. MANIFESTS — index

Les seize manifests canoniques et leur section : **Kernel Manifest générique** §19 · **Vibe Lab** §3 · **Promotion Gate** §4 · **Agent Profile** §11 (formule + profils) · **Agent Run** §33 · **Skill** §12 · **Harness** §13 (six exemples) · **Context Pack** §15 (contenu/exclusions ; le pack est hashé §19) · **Memory** §9 · **Policy** §10 · **Police** §8 · **Evidence Contract** §16 · **Drift Report** §30 · **Decision Card** §31 · **PR Kernelisée** §37 · **Agent Factory Resolution** §14. Tous partagent la même colonne vertébrale : id, type, statut de confiance, above/below quand pertinent, evidence, security, links, lifecycle, hash.

---

## 43. MATRICE UNIVERSELLE

| Artefact | Dessus du mur | Dessous du mur | Preuves | Sécurité |
|---|---|---|---|---|
| **Fonction** | contrat, invariants | code, tests | unit/property | no side effects |
| **API** | contrat, erreurs, permissions | endpoint, OpenAPI | contract tests, auth tests | authz, rate limit |
| **MCP** | capability, schemas, permissions | implémentation tool | schema/allowlist tests, security evals | gateway, allowlist, audit |
| **Agent** | rôle, limites, autonomie | prompt, tools, memory, harness | evals, shadow mode, audit | kill switch, capabilities |
| **Infra** | intention, contraintes, risques | Pulumi/Terraform/Docker/K8s | plan/preview, scan, dry-run | runtime wall, approval |
| **Migration** | intent, invariants de donnée | SQL migration | backup, dry-run, rollback, intégrité | human-gated destructif |
| **Refactor** | comportement inchangé | diff code | tests, semantic diff vide, API unchanged | reviewability |
| **Documentation** | public visé, vérité attendue | markdown/site | doc alignment (s2↔s9, s1↔s10) | pas de secret/PII |

---

## 44. FORMULES FINALES

**Définition courte.** *« Fractal Kernel Engineering est une approche universelle du code IA où le vibe génère l'élan, les kernels structurent l'intention, les agents réalisent sous harness, la police encadre les actions, les preuves remplacent la confiance, la mémoire conserve les apprentissages validés, et la conscience réconcilie ce qui est voulu, construit, prouvé et autorisé. »*

**Définition longue.** *« Fractal Kernel Engineering transforme le développement IA en un processus fractal de compilation d'intentions. Les chats, tickets, logs, documents, prototypes et vibes sont capturés comme signaux bruts. Un cerveau gauche les transforme en propositions de kernels au-dessus du mur : intention, contrat, invariants, contraintes, sécurité et preuves attendues. Après validation, un cerveau droit réalise sous le mur les artefacts nécessaires : code, tests, prompts, agents, skills, MCP, workflows, infra, documentation et policies — chaque slot d'en bas étant le reflet vérifiable d'un slot d'en haut. Chaque agent est paramétré par son rôle cognitif, sa couche, son type de kernel, ses skills, son harness, son contexte, ses policies et son niveau d'autonomie. Une police déterministe contrôle les accès, outils, MCP, mémoire, secrets, permissions et effets de bord. Une conscience compare en permanence le voulu, le construit, le prouvé et l'autorisé, détecte les drifts et produit des décisions. Le résultat est un graphe vivant de kernels versionnés, sécurisés, testés, observables et explicables. »*

**Phrase très courte.** *« Le vibe donne l'idée. Le kernel donne le contrat. Le harness donne le cadre. La police donne les limites. L'evidence donne la confiance. La conscience donne l'alignement. »*

**Autre.** *« Fractal Kernel Engineering n'est pas du prompt-to-code. C'est du vibe-to-kernel-to-evidence. »*

---

## 45. FKE × KRD / AIDOS — l'implémentation de référence et les deltas

FKE ⊃ KRD ⊃ AIDOS : **FKE est la discipline universelle ; KRD en est la méthode produit-logiciel ; AIDOS en est le premier runtime.** La quasi-totalité des organes FKE existe déjà dans AIDOS — c'est la preuve par construction que le modèle tient :

| Organe FKE | Existant AIDOS/KRD |
|---|---|
| Intent Wall | le mur (hook PreToolUse + GRANTs Postgres, deux couches) |
| Vibe Lab / Promotion Gate | `/spike` (ratchet OFF, confiné) · `/harvest` + `/grill` + `/goal` |
| Raw→Accepted Truth | ideas (provenance) → grill → ChangeSet `proposed` → approbation ; truth-typing/scope/authority |
| Cerveau gauche | `/grill`, `/grill-with-docs`, l'interview forcée EL (compound du besoin, schémas par niveau) |
| Cerveau droit | la boucle-build (S83) : ContextPack → LLM → sandbox → miroirs → AgentRun |
| Conscience (partielle) | step-verifier + complétude/monstre + SemanticDiff + RealityMirror — **distribuée, pas unifiée** |
| Police | agentlayer 5 axes + enforcers fail-closed + BlockReason + ledger Merkle (GV) |
| Policy-as-code | GV05 : policy.yaml → GateAction, équivalence prouvée |
| Memory Wall | memory firewall (`ToKernel` toujours bloqué, `ViaIdea` seul chemin) + pgvector + claude-mem (plan A) |
| Context Pack/Firewall | ContextRouter (« un algorithme, pas un prompt ») + headroom (compression) + budget S51 |
| Evidence | miroirs N0-N5 + cert_language + mutation + fault-injection + « done is computed » |
| Doom Loop | `BUILD_LOOP_NO_PROGRESS` (fonction pure de l'historique, S83) |
| Semantic diff / blast radius | SemanticDiff S21 + red wave / impact S22 |
| Event sourcing / hashes | changesets append-only + DAG + provenance + `records.Hash/Canonicalize` + émission byte-identique |
| Runtime loop | RealityMirror → `/learn` (incident → idea → miroir, template déterministe) |
| Legacy kernelizer | strangler-fig + miroirs de caractérisation (S104) |
| Kernel debt / trim | S41 `/trim` (suggère, ne supprime jamais) |
| Autonomie par preuve | AdoptionStage ladder + agentlayer + promotion-gate des élites QD |
| Graphe vivant | links S17 + truth-tree + WorkbenchGraph + index call-graph FN05 |

**Les deltas — ce que FKE AJOUTE à l'existant (tout additif, rien à reconstruire) :**

1. **L'anatomie symétrique 10-slots comme loi de complétude renforcée** (§1.3) : aujourd'hui la complétude vérifie « vérité ↔ miroir vivant » (la paire s4↔s5/s6 seulement). FKE exige les **quatre familles de paires** — donc deux nouvelles familles de miroirs : le **doc-miroir** (s2↔s9 : doc dérivée du code comparée au use case déclaré) et le **spec-miroir** (s1↔s10), plus la **déclaration** du data-miroir (s3↔s7) comme comparaison explicite.
2. **La conscience comme organe NOMMÉ et unifié** : un seul rapport de réconciliation par kernel (aujourd'hui distribué entre verifier, complétude, semantic-diff, reality). Avec sa taxonomie de verdicts (§6.3) et ses Decision Cards (§31 — formalise l'approbation ChangeSet existante en *carte* : options/reco/impact/expiration).
3. **L'échelle des 7 vérités** (§5) — raffine `idea→truth` en gradations explicites (notamment *Interpreted* vs *Proposed*, et *Reconciled* comme état terminal).
4. **E0-E7 unifiés** (§16) — mappe N0-N5 et intègre **sécurité (E4), runtime (E6), formel (E7)** dans le MÊME contrat de preuve par kernel.
5. **A0-A8 + maturité** (§11/§34) — niveau d'autonomie **déclaré par agent** et montée **par preuve calculée** (étend les 5 axes agentlayer).
6. **Agent Factory déclarative** (§14) — la résolution profil/harness/skills/policies comme fonction pure publiée (généralise MatchRole/ContextRouter).
7. **Kernel Lock explicite** (§33) + **PR kernelisée** (§37) + **Reviewability police** (§26) — formats nouveaux sur mécanismes existants.
8. **Lexicon Kernel inter-couches** (§21) — le langage ubiquitaire devient *vérifiable par calcul* à travers les 16 couches.
9. **Kernel effondré** (§1.3) — le gabarit anti-explosion (gouverné par AdoptionStage + HarnessCostBudget).
10. **Les projections d'outillage** (§20) — `CLAUDE.md`/`AGENTS.md`/`.cursorrules`/`SKILL.md` officiellement *générés* depuis des kernels (aujourd'hui hand-édités).

**Route d'atterrissage :** ce document = une **Idée (provenance humaine)** → grill → ADR « FKE — anatomie fractale du kernel » → les deltas deviennent une piste `FK01..` (ou s'insèrent dans les épics en cours : E5 construit déjà s4/s5/s6 par user, E6 construit s3, la conscience unifiée s'appuie sur le verifier). **Le build S53→S117 continue tel quel** — FKE le décrit, il ne l'interrompt pas.

---

*FKE v0.1 — fractal · universel · agentique · sécurisé · gouverné · memory-aware · policy-driven · evidence-first · context-controlled · vibe-compatible · production-aware · explicable · traçable · extensible.*
