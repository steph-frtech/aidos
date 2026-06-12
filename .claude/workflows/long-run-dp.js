// .claude/workflows/long-run-dp.js
// Piste DP (provisioning & déploiement réel, DP01→DP33) — variante DP de long-run.js.
// Différences avec long-run.js :
//   1. Le détail d'étape est INLINE dans docs/plan/ROADMAP-provisioning-deploy.md
//      (il n'existe PAS de docs/plan/DPnn.md) ; la spec canonique est SPEC-stack-2026.md.
//   2. Un CONTRAT DP (spec gravée + les 2 exigences utilisateur absolues + anti-overwrite)
//      est injecté dans CHAQUE prompt d'exécution et de vérification.
//   3. Dispatch DIRECT à step-executor (pas d'agent dédié step-dpNN — décision utilisateur).
//   4. La boucle d'AUTO-RELANCE vit DANS le script : cale infra (plan:parse 5x consécutifs
//      OU même étape 3x) → relance depuis le curseur ; vrai échec de vérification ou
//      BLOCKED → stop définitif (on rend la main).
// State, gating et resume vivent ici — pas dans le contexte de conversation.
export const meta = {
  name: 'long-run-dp',
  description: "Piste DP01→DP33 (provisioning & déploiement réel) : step-executor implémente, step-verifier valide, auto-relance sur cale infra, stop sur vrai échec/BLOCKED.",
  whenToUse: "Piste DP uniquement. {startFrom:'DP05'} pour reprendre ; {stopAfter:'DP10'} pour borner ; {maxRetries:N} retries par étape (défaut 2).",
  phases: [
    { title: 'Plan', detail: 'parse ROADMAP-provisioning-deploy.md' },
    { title: 'Run', detail: 'executor + verifier par étape DP, séquentiel, auto-relance' },
  ],
}

const PLAN_PATH = (args && args.planPath) || 'docs/plan/ROADMAP-provisioning-deploy.md'
const MAX_RETRIES = (args && args.maxRetries) ?? 2
const START_FROM = (args && args.startFrom) || 'DP01'
const STOP_AFTER = (args && args.stopAfter) || null
const MAX_PLAN_STALLS = 5   // STOP stoppedAt='plan' consécutifs avant abandon
const MAX_STEP_STALLS = 3   // cales infra sur UNE MÊME étape avant abandon
const MAX_ROUNDS = 60       // garde anti-runaway de la boucle d'auto-relance

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          objectif: { type: 'string' },
          inputs: { type: 'array', items: { type: 'string' } },
          criteres: { type: 'string' },
        },
        required: ['id', 'objectif', 'criteres'],
      },
    },
  },
  required: ['steps'],
}

const EXEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    step: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    outputs: { type: 'array', items: { type: 'string' } },
    files_changed: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['step', 'status', 'files_changed'],
}

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    step: { type: 'string' },
    verification_status: { type: 'string', enum: ['passed', 'failed'] },
    corrections_applied: { type: 'array', items: { type: 'string' } },
    residual_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['step', 'verification_status', 'residual_issues'],
}

// Le contrat DP — s'applique à CHAQUE étape, en plus de sa spec propre.
const DP_CONTRACT =
  `\n⚖️ CONTRAT DP (s'applique à CETTE étape comme à toutes, en plus de sa spec) :\n` +
  `- SPEC CANONIQUE : docs/plan/SPEC-stack-2026.md (gravée verbatim — relis-la) : 19 couches, connecteurs première classe, one-shot bootstrap + compose à profils, niveaux 1/2/3, Windmill JAMAIS Temporal, PAS de Coolify ni Drizzle, Postgres en prod / Doltgres en non-prod, AUCUNE URL/secret en dur — tout par variables d'environnement.\n` +
  `- EXIGENCE UTILISATEUR 1 (absolue, à câbler au plus tôt, à maintenir à chaque étape) : chaque déploiement dev d'un projet produit une VRAIE application visible — conteneur réel + route Traefik https://<projet>-dev.sagedesk.fr, conventions /data/dockers (modèle alphashop) — que l'utilisateur peut OUVRIR dans son navigateur.\n` +
  `- EXIGENCE UTILISATEUR 2 (absolue, à câbler au plus tôt, à maintenir à chaque étape) : PORTE DE VALIDATION HUMAINE sur dev — après chaque déploiement dev, l'utilisateur VALIDE ou REFUSE : bouton dans la lentille V3 Environnements + événement « validation_humaine » dans le réducteur lib/v2/builder.ts, avec sa loi AU MIROIR : monter en staging est REFUSÉ tant que le déploiement dev courant n'est pas validé par l'humain (le cliquet s'étend à la validation humaine).\n` +
  `- ANTI-OVERWRITE : les twins lib/v2 et lib/v3 existants ne se cassent pas — vitest (2054+/2054+ au départ) et les e2e v3 (16/16) RESTENT verts à chaque étape.\n` +
  `- KRD strict : miroir d'abord (rouge→vert), déterminisme-first (émetteurs purs — JAMAIS un LLM dans un chemin déterministe), le mur intact (aucune écriture kernel/mirrors/fitness hors idée→miroir→/goal).\n` +
  `- e2e : le port :3000 est la PROD publique — n'y touche pas, ne la redémarre pas ; lance les e2e avec PLAYWRIGHT_WEB_PORT=3210 (le config Playwright lance son propre dev server), depuis la racine du repo.\n` +
  `- SPIKE-gates (DP01, DP10, DP14, DP19) : ratchet OFF, code confiné /spike/ uniquement ; un verdict négatif RÉDUIT le sujet — il ne l'arrête que si le cœur du sujet est tué ; le verdict est harvesté (/harvest) + ADR.\n` +
  `- Avant CHAQUE commit : supprime tout binaire Go parasite (exécutables non suivis à la racine ou dans back/). Commit groupé + push sur build/s00-s47.\n` +
  `- Docs : 2 pages Mintlify par étape — steps/concept/dpNN-*.mdx + steps/internals/dpNN-*.mdx dans le clone .aidos-docs, mint validate (et broken-links) AVANT push sur steph-frtech/docs main.`

// Boucle d'auto-relance : chaque tour re-parse le plan et reprend au curseur.
const stepStalls = {}
let planStalls = 0
let cursor = START_FROM
const done = []
const rounds = []
let prevOutputs = []
const norm = (x) => String(x ?? '').trim().toUpperCase()

for (let round = 0; round < MAX_ROUNDS; round++) {
  // 1. Parse du plan (le script ne lit aucun fichier : l'agent lit).
  phase('Plan')
  let plan = null
  for (let pa = 0; pa < 3 && !plan; pa++) {
    try {
      plan = await agent(
        `Read ${PLAN_PATH} and return each step (sections '## DPnn — …'): id (e.g. 'DP07'), objectif, inputs, done criteria (résumé des 'Critères de done'). Execute no step.`,
        { label: `plan:parse:r${round}:${pa}`, phase: 'Plan', schema: PLAN_SCHEMA, model: 'fable' },
      )
    } catch (e) {
      log(`⚠ plan:parse round ${round} attempt ${pa} failed (${String(e?.message ?? e).slice(0, 80)}); retrying`)
    }
  }
  if (!plan) {
    planStalls++
    rounds.push({ round, event: 'plan-stall', planStalls })
    log(`⚠ cale infra plan:parse (${planStalls}/${MAX_PLAN_STALLS} consécutifs) — relance`)
    if (planStalls >= MAX_PLAN_STALLS) {
      return { verdict: 'STOP', stoppedAt: 'plan', message: `plan:parse a calé ${MAX_PLAN_STALLS}x consécutifs (infra)`, ranBefore: done, rounds }
    }
    continue
  }
  planStalls = 0

  // Borne la course : curseur (reprise) puis stopAfter.
  let steps = plan.steps
  const ci = steps.findIndex((s) => norm(s.id) === norm(cursor))
  if (ci >= 0) steps = steps.slice(ci)
  else log(`⚠ curseur '${cursor}' introuvable parmi [${steps.slice(0, 5).map((s) => s.id).join(', ')}…] ; plan complet depuis le début.`)
  if (STOP_AFTER) {
    const idx = steps.findIndex((s) => norm(s.id) === norm(STOP_AFTER))
    if (idx >= 0) steps = steps.slice(0, idx + 1)
    else { log(`⚠ stopAfter='${STOP_AFTER}' introuvable ; UNE seule étape pour éviter un runaway.`); steps = steps.slice(0, 1) }
  }
  log(`tour ${round} : ${plan.steps.length} étapes au plan ; ${steps.length} à courir depuis ${cursor} : ${steps.map((s) => s.id).join(', ')}`)

  // 2. Boucle séquentielle : les étapes dépendent l'une de l'autre → aucun parallélisme.
  phase('Run')
  let relaunchAt = null

  for (let si = 0; si < steps.length; si++) {
    const s = steps[si]
    let report, verdict, attempt = 0

    while (attempt <= MAX_RETRIES) {
      try {
        const retryCtx = attempt > 0
          ? `\nRetry ${attempt}. Residual issues to fix:\n- ${verdict.residual_issues.join('\n- ')}`
          : ''

        const execPrompt =
          `Step ${s.id} (piste DP — provisioning & déploiement réel)\nObjective: ${s.objectif}\n` +
          `Detailed spec: lis la section « ## ${s.id} » de ${PLAN_PATH} (le détail est INLINE dans le roadmap — il n'existe PAS de docs/plan/${s.id}.md) ET la spec canonique docs/plan/SPEC-stack-2026.md ; suis CLAUDE.md §6 (the per-step KRD loop: grill→BDD mirror→tdd→sensors→diagnose→UI+Playwright→improve).\n` +
          `Inputs: ${(s.inputs ?? []).concat(prevOutputs).join(', ') || '(none)'}\n` +
          `Done criteria: ${s.criteres}${retryCtx}\n` +
          DP_CONTRACT + `\n\n` +
          `⛔ REPORTING DISCIPLINE (a hard rule — violating it has wasted entire steps). Your turn budget is FINITE and you do NOT reliably sense when it is near. Therefore: the MOMENT your done-criteria above are met, call StructuredOutput as your VERY NEXT action — BEFORE any final-polish pass. Do NOT, after the work is done, run redundant verification (re-running biome/go test/git status, re-reading files you just wrote, "let me do one last check"): that endless final-checking is exactly what burned the turn budget on a prior step and left no turn to report. Reserve your last few turns for the StructuredOutput call. If you have NOT finished, still emit StructuredOutput with status:'blocked' and notes listing precisely what remains. Never end with a plain-text message.\n` +
          `If much of this step already exists on disk from a prior interrupted attempt (files present, Linear issue already Done), do NOT redo it — verify it meets the done-criteria and report status:'done' quickly.`

        // Dispatch DIRECT à step-executor (pas d'agent dédié DP — décision utilisateur).
        report = await agent(execPrompt, { label: `exec:${s.id}:${attempt}`, phase: 'Run', schema: EXEC_SCHEMA, agentType: 'step-executor' })

        if (report.status === 'blocked') {
          return { verdict: 'BLOCKED', stoppedAt: s.id, reason: report.notes, ranBefore: done, rounds }
        }

        verdict = await agent(
          `step-executor report for ${s.id} (piste DP):\n${JSON.stringify(report, null, 2)}\n` +
          `Done criteria: ${s.criteres}\nRe-read the changed files, fix any gap, return your verdict.\n` +
          `CONTRAT DP à vérifier RÉELLEMENT (commandes, pas sur parole) :\n` +
          `- vitest twins verts : \`cd front/web && npx vitest run\` → 0 échec (2054+ tests) ;\n` +
          `- si l'étape a touché front/web (lib/, app/, components/) : les e2e v3 restent verts — \`PLAYWRIGHT_WEB_PORT=3210 npx playwright test\` (spec v3) depuis la racine, JAMAIS contre la prod :3000 ;\n` +
          `- aucune URL/secret en dur dans le code ajouté (tout par variables d'environnement) ; Windmill jamais Temporal ; pas de Coolify ni Drizzle ;\n` +
          `- aucun binaire Go parasite non suivi ; le mur intact (aucune écriture kernel/mirrors/fitness directe) ;\n` +
          `- les 2 exigences utilisateur (vraie app dev visible via Traefik <projet>-dev.sagedesk.fr ; porte de validation humaine — événement « validation_humaine » dans lib/v2/builder.ts + loi au miroir « staging refusé sans validation du dev courant ») ne sont PAS régressées si elles existent déjà.\n` +
          `SPIKE RULE : pour les SPIKE-gates (DP01, DP10, DP14, DP19), un verdict no-go MESURÉ + harvesté + ADR est un PASS (le spike a fait son travail) ; ne bloque jamais un spike pour absence de ratchet — le ratchet y est OFF par design.\n` +
          `BOOTSTRAP RULE (CLAUDE.md §6): a by-design forward-dependency — substrate owned by a LATER step — is an OpenQuestion, NOT a residual issue. PASS the step if its OWN done-criteria are met. residual_issues holds ONLY blocking gaps fixable now; never block a step for what it cannot fix by design.`,
          { label: `verify:${s.id}:${attempt}`, phase: 'Run', agentType: 'step-verifier', schema: VERIFY_SCHEMA },
        )

        if (verdict.verification_status === 'passed' && verdict.residual_issues.length === 0) break
      } catch (e) {
        // Un agent a fini sans StructuredOutput (ou autre erreur infra). Ne tue pas la
        // course — l'essai compte comme un échec INFRA et on retente l'étape.
        log(`⚠ ${s.id} attempt ${attempt}: agent infra error (${String(e?.message ?? e).slice(0, 90)}); retrying the step`)
        verdict = { verification_status: 'failed', residual_issues: [`infra: agent did not report — ${String(e?.message ?? e).slice(0, 100)}`] }
      }
      attempt++
    }

    // 3. Échec après retries : infra → auto-relance bornée ; réel → stop définitif.
    if (!verdict || verdict.verification_status !== 'passed' || verdict.residual_issues.length) {
      const issues = verdict ? verdict.residual_issues : ['no verdict (agent never reported after retries)']
      const isInfra = !verdict || /infra:|did not report|no verdict|never returned|StructuredOutput/i.test(issues.join(' | '))
      if (!isInfra) {
        return {
          verdict: 'STOP', stoppedAt: s.id, residual_issues: issues, ranBefore: done, rounds,
          message: `Step ${s.id} : VRAI échec de vérification après ${MAX_RETRIES} retries — on rend la main (pas d'auto-relance sur un échec réel).`,
        }
      }
      stepStalls[s.id] = (stepStalls[s.id] || 0) + 1
      rounds.push({ round, event: 'step-stall', step: s.id, count: stepStalls[s.id] })
      if (stepStalls[s.id] >= MAX_STEP_STALLS) {
        return {
          verdict: 'STOP', stoppedAt: s.id, residual_issues: issues, ranBefore: done, rounds,
          message: `Step ${s.id} a calé ${MAX_STEP_STALLS}x (infra) — abandon, vérification manuelle requise.`,
        }
      }
      log(`⚠ cale infra sur ${s.id} (${stepStalls[s.id]}/${MAX_STEP_STALLS}) — auto-relance depuis ${s.id}`)
      relaunchAt = s.id
      break
    }

    done.push(s.id)
    prevOutputs = report.outputs ?? []
    cursor = si + 1 < steps.length ? steps[si + 1].id : s.id
    log(`✓ ${s.id} validated (${done.length} au total)`)
  }

  if (relaunchAt) { cursor = relaunchAt; continue }
  return { verdict: 'DONE', steps: done.length, completed: done, rounds }
}

return { verdict: 'STOP', stoppedAt: cursor, message: `garde anti-runaway : ${MAX_ROUNDS} tours d'auto-relance atteints`, ranBefore: done, rounds }
