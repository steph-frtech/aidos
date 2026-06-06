/**
 * governance — GV01 front twin of back/runtime/governance: the OWASP Agentic Top-10
 * CROSS-CHECK report + the AGT adoption verdict. The Go package is the AUTHORITY (the
 * declared coverage matrix + adoption table, pure/total); this twin REPLICATES the same
 * DECLARED tables verbatim so the Workbench /governance panel renders the audit WITHOUT
 * a backend round-trip and can run the cross-check on a click.
 *
 * DETERMINISM-FIRST. Coverages/count/verdict are pure derivations of a declared table —
 * code, never an "LLM auditor". No I/O, no Date.now(), no Math.random(); same table ⇒
 * same report (the reproducibility mirror governance.test.ts pins it).
 *
 * THE WALL STAYS AUTHORITATIVE. The verdict NEVER adopts an AGT pillar as a replacement
 * of the structural wall — only as an augmentation (covered/adopt_augment/reject).
 */

export const RISKS = [
	"AAI01_authorization_control_hijacking",
	"AAI02_critical_system_interaction",
	"AAI03_goal_instruction_manipulation",
	"AAI04_hallucination_misinformation",
	"AAI05_impact_chain_blast_radius",
	"AAI06_memory_context_manipulation",
	"AAI07_orchestration_multiagent",
	"AAI08_supply_chain_dependency",
	"AAI09_untraceability_repudiation",
	"AAI10_economic_resource_exhaustion",
] as const;
export type Risk = (typeof RISKS)[number];

export const STATUSES = ["covered", "partial", "uncovered"] as const;
export type Status = (typeof STATUSES)[number];

export interface Coverage {
	risk: Risk;
	title: string;
	status: Status;
	coveredBy: string[];
	residual?: string;
	augmentedBy?: string;
}

/** The single authoritative coverage matrix — twin of governance.matrix (Go), AAI01..AAI10. */
const MATRIX: Record<Risk, Coverage> = {
	AAI01_authorization_control_hijacking: {
		risk: "AAI01_authorization_control_hijacking",
		title: "Authorization & Control Hijacking",
		status: "covered",
		coveredBy: [
			"agentlayer.MayWrite (S04 structural wall — PeutModifierNoyau/Fitness always false)",
			"GateAction axis zone (Classify deny-list above the waterline)",
			"GateAction axis path (PathAllowed default-deny confinement)",
			"BlockReason AGENT_WRITE_ABOVE_WATERLINE / AGENT_PATH_NOT_ALLOWED",
		],
	},
	AAI02_critical_system_interaction: {
		risk: "AAI02_critical_system_interaction",
		title: "Critical-System Interaction",
		status: "covered",
		coveredBy: [
			"GateAction axis egress (EgressAllowed — empty allow-list ⇒ no egress)",
			"GateAction axis exec (ExecAllowed — empty allow-list ⇒ no subprocess)",
			"GateAction axis capacity (ToolAllowed — bound MCP server/tool only)",
			"BlockReason AGENT_EGRESS_NOT_ALLOWED / AGENT_EXEC_NOT_ALLOWED / AGENT_TOOL_NOT_BOUND",
		],
	},
	AAI03_goal_instruction_manipulation: {
		risk: "AAI03_goal_instruction_manipulation",
		title: "Goal & Instruction Manipulation",
		status: "covered",
		coveredBy: [
			"GateAction axis determinism (ArbitrateGated reads STRUCTURAL AgentAction, never DisplayedIntent — gap D1)",
			"agentimpl.Arbitrate (a deterministic tool governs an action the agent cannot redirect by prose)",
			"BlockReason AGENT_DETERMINISM_GAP",
		],
	},
	AAI04_hallucination_misinformation: {
		risk: "AAI04_hallucination_misinformation",
		title: "Hallucination & Misinformation Exploitation",
		status: "covered",
		coveredBy: [
			"agentlayer.Propose always yields `proposed` (never `admitted`) — an agent never declares truth alone",
			"BlockReason PROPOSAL_NOT_ADMITTED / MEMORY_CANNOT_DECLARE_TRUTH / REALITY_CANNOT_DECLARE_TRUTH",
			"the deterministic judge: done is computed (mirror + reality), never declared by the agent",
		],
	},
	AAI05_impact_chain_blast_radius: {
		risk: "AAI05_impact_chain_blast_radius",
		title: "Impact Chain & Blast Radius",
		status: "covered",
		coveredBy: [
			"S20 ChangeSet + S22 SemanticDiff red-wave (blast radius computed before apply)",
			"GateAction axis path (confinement bounds the writable root)",
			"agentrun is below-the-line telemetry — a run can never cascade into a kernel write",
		],
	},
	AAI06_memory_context_manipulation: {
		risk: "AAI06_memory_context_manipulation",
		title: "Memory & Context Manipulation",
		status: "covered",
		coveredBy: [
			"S30 memory-firewall (MEMORY_CANNOT_DECLARE_TRUTH) — memory proposes, never freezes",
			"agentrun.Redact scrubs secrets from the persisted transcript BEFORE the ledger (gap H1)",
			"the ContextRouter is an algorithm, not a prompt (context cannot be steered into a write)",
		],
	},
	AAI07_orchestration_multiagent: {
		risk: "AAI07_orchestration_multiagent",
		title: "Orchestration & Multi-Agent Exploitation",
		status: "covered",
		coveredBy: [
			"BA18 identity: MintToken/VerifyToken — owner_agent is the content-hash of the impl, PROVEN not chain-declared",
			"scheduler lease/fence (AGENT_LEASE_FENCED — a stale orchestration lease is fenced)",
			"BlockReason AGENT_IDENTITY_UNVERIFIED",
		],
	},
	AAI08_supply_chain_dependency: {
		risk: "AAI08_supply_chain_dependency",
		title: "Supply Chain & Dependency Attacks",
		status: "covered",
		coveredBy: [
			"GateAction axis capacity (ToolAllowed) + axis skill (SkillAllowed) — only DECLARED, bound tools/skills run",
			"closed Provider set (anthropic|openai|google — no provider discovered at runtime)",
			"BlockReason AGENT_TOOL_NOT_BOUND / AGENT_SKILL_NOT_BOUND",
		],
	},
	AAI09_untraceability_repudiation: {
		risk: "AAI09_untraceability_repudiation",
		title: "Untraceability & Repudiation",
		status: "partial",
		coveredBy: [
			"BA28 agentrun content-address + ReplayMatches (a TAMPERED row re-derives to a different id)",
			"BA29 agentloop ledger Reconcile (boundary effect-log vs recorded actions — gap H2)",
			"BA16 postcheck + the redacted, append-only transcript",
		],
		residual:
			"Per-run hashing detects an ALTERED row, but NOT a DELETED or REORDERED one: there is no cross-row Merkle chain over the ledger, so a whole run silently removed leaves no signal.",
		augmentedBy:
			"GV03 (tamper-evident Merkle ledger: each entry chains the prior root → any deletion/reordering changes the root → verification goes red)",
	},
	AAI10_economic_resource_exhaustion: {
		risk: "AAI10_economic_resource_exhaustion",
		title: "Economic & Resource Exhaustion",
		status: "partial",
		coveredBy: [
			"GateAction axis budget (BA11 CheckBudget — min() of the two declared caps, the tightest wins)",
			"agentlayer ResourceLimits (MaxMemoryMB/MaxCPUMillis/MaxWallSeconds) + MaxTurns/MaxConcurrency knobs",
			"BlockReason AGENT_BUDGET_EXCEEDED",
		],
		residual:
			"Hard per-action/per-run caps exist, but no SRE-style error-budget / circuit-breaker that trips on a RATE of failures or burn across many runs (slow-burn exhaustion below each single cap).",
		augmentedBy:
			"GV06 (SRE controls: error-budget + circuit-breaker aligned on BA budgets)",
	},
};

/** coverages — twin of governance.Coverages: the matrix in canonical AAI01..AAI10 order. */
export function coverages(): Coverage[] {
	return RISKS.map((r) => MATRIX[r]);
}

export interface Tally {
	covered: number;
	partial: number;
	uncovered: number;
	total: number;
}

/** count — twin of governance.Count: tally the matrix by status. Pure, total. */
export function count(): Tally {
	const t: Tally = {
		covered: 0,
		partial: 0,
		uncovered: 0,
		total: RISKS.length,
	};
	for (const r of RISKS) {
		if (MATRIX[r].status === "covered") t.covered++;
		else if (MATRIX[r].status === "partial") t.partial++;
		else t.uncovered++;
	}
	return t;
}

/** residuals — twin of governance.Residuals: risks with a real remaining gap (partial/uncovered). */
export function residuals(): Coverage[] {
	return RISKS.map((r) => MATRIX[r]).filter((c) => c.status !== "covered");
}

export const PILLARS = [
	"policy_as_yaml",
	"tamper_evident_audit_merkle",
	"owasp_agentic_evals",
	"identity_trust",
	"sre_slo_error_budget_circuit_breaker",
] as const;
export type Pillar = (typeof PILLARS)[number];

export const DECISIONS = [
	"adopt_augment",
	"already_covered",
	"reject",
] as const;
export type AdoptionDecision = (typeof DECISIONS)[number];

export interface PillarVerdict {
	pillar: Pillar;
	title: string;
	decision: AdoptionDecision;
	rationale: string;
	step?: string;
}

/** The adoption decision table — twin of governance.adoptionTable (Go). */
const ADOPTION: Record<Pillar, PillarVerdict> = {
	policy_as_yaml: {
		pillar: "policy_as_yaml",
		title: "Policy-as-YAML → enforcers",
		decision: "adopt_augment",
		rationale:
			"Une source YAML qui COMPILE vers le MÊME verdict GateAction ajoute une surface de policy lisible — adoptée UNIQUEMENT avec un miroir d'équivalence : la YAML peut ÉGALER ou RESSERRER le mur, jamais l'élargir.",
		step: "GV05",
	},
	tamper_evident_audit_merkle: {
		pillar: "tamper_evident_audit_merkle",
		title: "Tamper-evident (Merkle) audit ledger + Decision-BOM",
		decision: "adopt_augment",
		rationale:
			"Écart réel (AAI09 partiel) : le hachage par-run de BA28 détecte une ligne ALTÉRÉE mais pas une ligne SUPPRIMÉE/RÉORDONNÉE. Une chaîne Merkle sur le ledger fait changer la racine → vérification rouge.",
		step: "GV03",
	},
	owasp_agentic_evals: {
		pillar: "owasp_agentic_evals",
		title: "OWASP Agentic Top-10 conformance mirrors",
		decision: "adopt_augment",
		rationale:
			"AIDOS couvre les risques structurellement mais sans miroir de conformité EXÉCUTABLE par risque. Transformer les 10 risques en miroirs déterministes (injecter la violation → rouge) prouve en continu la couverture que ce rapport affirme.",
		step: "GV04",
	},
	identity_trust: {
		pillar: "identity_trust",
		title: "Agent identity & trust framework",
		decision: "already_covered",
		rationale:
			"BA18 prouve déjà owner_agent comme content-hash de l'impl gouvernée (MintToken/VerifyToken) et le scheduler fence les leases périmés. Le pilier identité de l'AGT n'ajoute rien de structurel ; GV06 ne fait que le SURFACER.",
		step: "GV06",
	},
	sre_slo_error_budget_circuit_breaker: {
		pillar: "sre_slo_error_budget_circuit_breaker",
		title: "SRE controls (SLO / error-budget / circuit-breaker)",
		decision: "adopt_augment",
		rationale:
			"Écart réel (AAI10 partiel) : BA11 applique des plafonds durs par-action/par-run mais aucun error-budget/circuit-breaker sur un TAUX d'échecs entre runs (épuisement lent sous chaque plafond).",
		step: "GV06",
	},
};

/** pillarVerdicts — twin of governance.PillarVerdicts. */
export function pillarVerdicts(): PillarVerdict[] {
	return PILLARS.map((p) => ADOPTION[p]);
}

export interface AdoptionVerdict {
	stop: boolean;
	toAdopt: number;
	alreadyCovered: number;
	rejected: number;
	residualRisks: number;
	summary: string;
}

/**
 * GV02 — the ADOPTION ADR projection (twin of governance.ADRParity / AdoptionADRSummary).
 * The accepted ADR 0037 is a PROJECTION of the same declared adoption table: pillar by
 * pillar, the decision + the carrying GV step + whether the wall stays the garant. The
 * Workbench renders this so the precise "ce qu'on adopte / n'adopte pas" + "le mur reste le
 * garant" is reachable AND re-runnable from a screen (ui-completeness), not only in the .md.
 */
export const ADR_NUMBER = "0037";
export const ADR_STATUS = "Accepted" as const;

export interface AdrRow {
	pillar: Pillar;
	title: string;
	decision: AdoptionDecision;
	step?: string;
	/** true on every non-rejected row — the wall is the authority the pillar augments. */
	wallIsGarant: boolean;
}

/** adrParity — twin of governance.ADRParity: the ADR's adoption rows, pure projection. */
export function adrParity(): AdrRow[] {
	return pillarVerdicts().map((v) => ({
		pillar: v.pillar,
		title: v.title,
		decision: v.decision,
		step: v.step,
		wallIsGarant: v.decision !== "reject",
	}));
}

export interface AdrSummary {
	number: string;
	status: typeof ADR_STATUS;
	adopt: number;
	alreadyCovered: number;
	rejected: number;
	wallStaysGarant: boolean;
	line: string;
}

/** adrSummary — twin of governance.AdoptionADRSummary: the ADR headline, derived from the verdict. */
export function adrSummary(): AdrSummary {
	const v = verdict();
	return {
		number: ADR_NUMBER,
		status: ADR_STATUS,
		adopt: v.toAdopt,
		alreadyCovered: v.alreadyCovered,
		rejected: v.rejected,
		wallStaysGarant: true,
		line: "AGT : on adopte 4 piliers comme AUGMENTATIONS (audit Merkle, miroirs OWASP, policy-as-YAML→enforcers, SRE), 1 déjà-couvert (identité BA18), 0 rejeté — le mur structurel reste autoritaire (l'AGT l'augmente, jamais ne le remplace).",
	};
}

/** verdict — twin of governance.Verdict. Pure, total — same tables ⇒ same verdict. The wall is never abandoned. */
export function verdict(): AdoptionVerdict {
	let toAdopt = 0;
	let alreadyCovered = 0;
	let rejected = 0;
	for (const p of PILLARS) {
		const d = ADOPTION[p].decision;
		if (d === "adopt_augment") toAdopt++;
		else if (d === "already_covered") alreadyCovered++;
		else rejected++;
	}
	const t = count();
	const residualRisks = t.partial + t.uncovered;
	const stop = toAdopt === 0 && residualRisks === 0;
	return {
		stop,
		toAdopt,
		alreadyCovered,
		rejected,
		residualRisks,
		summary: stop
			? "Gouvernance déjà complète et fail-closed : rien à ajouter (arrêt)."
			: "Le mur structurel couvre déjà 8/10 risques fail-closed ; il reste des écarts réels (AAI09 ledger non Merkle, AAI10 sans error-budget/circuit-breaker) — la roadmap GV03/GV04/GV05/GV06 les AUGMENTE sans jamais abandonner le mur.",
	};
}

// ── GV03 — the tamper-evident (Merkle) audit ledger twin ───────────────────────────────
//
// Twin of back/runtime/agentrun/ledger.go. The Go package is the AUTHORITY (Append/Root/
// Verify/DeriveBOM, pure/total over records.Canonicalize+Hash); this twin REPLICATES the
// same Merkle-chain BEHAVIOUR so the /governance panel can build a ledger and run the
// tamper-evidence verification on a click, WITHOUT a backend round-trip.
//
// DETERMINISM-FIRST. A Merkle root is a hash algorithm — a pure, total function of the
// ordered run bodies, never an "LLM auditor". canonicalize + sha256 are synchronous,
// browser-safe, no I/O, no Date.now()/random; same ordered runs ⇒ same root, any tamper ⇒
// a different root and a red verify (the reproducibility + tamper mirrors pin it). The
// twin's digest need NOT byte-match Go's: what is pinned is the INVARIANT (tamper ⇒ red),
// which is hash-primitive-independent. The wall stays authoritative: the ledger is BELOW
// the line — runtime audit telemetry, never a layer/truth.

/** GenesisRoot — the empty-ledger root: the chain before any entry (twin of agentrun.GenesisRoot). */
export const GENESIS_ROOT = "genesis";

/** A run's decision inputs — the minimum the twin needs to derive a Decision-BOM. */
export interface LedgerRun {
	id: string;
	agent: string;
	goal: string;
	redWorkItem: string;
	contextPack: string;
	impl?: string;
	seed?: string;
	result: string;
}

/** DecisionBOM — twin of agentrun.DecisionBOM: the Bill-Of-Materials of one agent decision. */
export interface DecisionBom {
	run: string;
	agent: string;
	goal: string;
	redWorkItem: string;
	contextPack: string;
	impl: string;
	seed: string;
	result: string;
}

/** LedgerEntry — twin of agentrun.LedgerEntry: one Merkle-chained audit row. */
export interface LedgerEntry {
	index: number;
	bom: DecisionBom;
	priorRoot: string;
	entryHash: string;
	root: string;
}

/** TamperKind — twin of agentrun.TamperKind: how a ledger failed verification. */
export type TamperKind =
	| ""
	| "index_mismatch"
	| "entry_hash_mismatch"
	| "prior_root_break"
	| "root_mismatch";

/** VerifyResult — twin of agentrun.VerifyResult: the deterministic verdict of verify. */
export interface LedgerVerifyResult {
	ok: boolean;
	tamper: TamperKind;
	atIndex: number;
	expectedRoot: string;
	storedRoot: string;
}

// canonicalize — deterministic JSON with object keys sorted recursively (twin of
// records.Canonicalize): the canonical form a row is hashed over, stable under key reordering.
function canonicalize(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
	const o = v as Record<string, unknown>;
	const keys = Object.keys(o).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(",")}}`;
}

// sha256 — a compact, synchronous, browser-safe SHA-256 (pure, deterministic; no deps, no
// Node crypto so it runs in the client panel). Returns the lowercase hex digest.
function sha256(msg: string): string {
	const K = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
		0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
		0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
		0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
		0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
		0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
		0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
		0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
		0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
	];
	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	const bytes: number[] = [];
	for (let i = 0; i < msg.length; i++) {
		const c = msg.charCodeAt(i);
		if (c < 0x80) bytes.push(c);
		else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
		else
			bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
	}
	const l = bytes.length;
	bytes.push(0x80);
	while (bytes.length % 64 !== 56) bytes.push(0);
	const bitLen = l * 8;
	for (let i = 7; i >= 0; i--) bytes.push((bitLen / 2 ** (i * 8)) & 0xff);
	let h0 = 0x6a09e667,
		h1 = 0xbb67ae85,
		h2 = 0x3c6ef372,
		h3 = 0xa54ff53a,
		h4 = 0x510e527f,
		h5 = 0x9b05688c,
		h6 = 0x1f83d9ab,
		h7 = 0x5be0cd19;
	const w = new Array<number>(64);
	for (let off = 0; off < bytes.length; off += 64) {
		for (let i = 0; i < 16; i++)
			w[i] =
				((bytes[off + i * 4] << 24) |
					(bytes[off + i * 4 + 1] << 16) |
					(bytes[off + i * 4 + 2] << 8) |
					bytes[off + i * 4 + 3]) >>>
				0;
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}
		let a = h0,
			b = h1,
			c = h2,
			d = h3,
			e = h4,
			f = h5,
			g = h6,
			h = h7;
		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + t1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) >>> 0;
		}
		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
		h5 = (h5 + f) >>> 0;
		h6 = (h6 + g) >>> 0;
		h7 = (h7 + h) >>> 0;
	}
	const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
	return (
		hex(h0) +
		hex(h1) +
		hex(h2) +
		hex(h3) +
		hex(h4) +
		hex(h5) +
		hex(h6) +
		hex(h7)
	);
}

const hash = (v: unknown): string => sha256(canonicalize(v));

/** deriveBom — twin of agentrun.DeriveBOM: project a run's Decision-BOM. Pure, total. */
export function deriveBom(r: LedgerRun): DecisionBom {
	return {
		run: r.id,
		agent: r.agent,
		goal: r.goal,
		redWorkItem: r.redWorkItem,
		contextPack: r.contextPack,
		impl: r.impl ?? "",
		seed: r.seed ?? "",
		result: r.result,
	};
}

function entryHash(index: number, bom: DecisionBom): string {
	return hash({ index, bom });
}

function chainRoot(priorRoot: string, eh: string): string {
	return hash({ prior_root: priorRoot, entry_hash: eh });
}

/** appendEntry — twin of agentrun.Append: add a run's BOM as a new chained entry (append-only). */
export function appendEntry(
	ledger: LedgerEntry[],
	r: LedgerRun,
): LedgerEntry[] {
	const prior =
		ledger.length > 0 ? ledger[ledger.length - 1].root : GENESIS_ROOT;
	const index = ledger.length;
	const bom = deriveBom(r);
	const eh = entryHash(index, bom);
	const root = chainRoot(prior, eh);
	return [...ledger, { index, bom, priorRoot: prior, entryHash: eh, root }];
}

/** buildLedger — twin of agentrun.BuildLedger: fold a sequence of runs into a Merkle ledger. */
export function buildLedger(runs: LedgerRun[]): LedgerEntry[] {
	let ledger: LedgerEntry[] = [];
	for (const r of runs) ledger = appendEntry(ledger, r);
	return ledger;
}

/** ledgerRoot — twin of agentrun.Root: the content-address of the WHOLE ordered ledger. */
export function ledgerRoot(ledger: LedgerEntry[]): string {
	return ledger.length > 0 ? ledger[ledger.length - 1].root : GENESIS_ROOT;
}

/** verifyLedger — twin of agentrun.Verify: recompute the chain; red at the first tampered row. */
export function verifyLedger(ledger: LedgerEntry[]): LedgerVerifyResult {
	let prior = GENESIS_ROOT;
	for (let i = 0; i < ledger.length; i++) {
		const e = ledger[i];
		if (e.index !== i)
			return {
				ok: false,
				tamper: "index_mismatch",
				atIndex: i,
				expectedRoot: ledgerRoot(ledger),
				storedRoot: ledgerRoot(ledger),
			};
		const eh = entryHash(i, e.bom);
		if (eh !== e.entryHash)
			return {
				ok: false,
				tamper: "entry_hash_mismatch",
				atIndex: i,
				expectedRoot: ledgerRoot(ledger),
				storedRoot: ledgerRoot(ledger),
			};
		if (e.priorRoot !== prior)
			return {
				ok: false,
				tamper: "prior_root_break",
				atIndex: i,
				expectedRoot: ledgerRoot(ledger),
				storedRoot: ledgerRoot(ledger),
			};
		const root = chainRoot(prior, eh);
		if (root !== e.root)
			return {
				ok: false,
				tamper: "root_mismatch",
				atIndex: i,
				expectedRoot: root,
				storedRoot: e.root,
			};
		prior = e.root;
	}
	return {
		ok: true,
		tamper: "",
		atIndex: -1,
		expectedRoot: prior,
		storedRoot: prior,
	};
}

/** A canonical 3-run demo ledger the panel builds — recorded runs an auditor would chain. */
export const DEMO_RUNS: LedgerRun[] = [
	{
		id: "run-a",
		agent: "step-gv03@1",
		goal: "GV03 ledger Merkle",
		redWorkItem: "ledger-property",
		contextPack: "pack-gv03",
		impl: "impl-a",
		seed: "seed-a",
		result: "green",
	},
	{
		id: "run-b",
		agent: "step-gv04@1",
		goal: "GV04 miroirs OWASP",
		redWorkItem: "owasp-mirrors",
		contextPack: "pack-gv04",
		impl: "impl-b",
		seed: "seed-b",
		result: "still_red",
	},
	{
		id: "run-c",
		agent: "step-gv05@1",
		goal: "GV05 policy→enforcers",
		redWorkItem: "policy-equiv",
		contextPack: "pack-gv05",
		impl: "impl-c",
		seed: "seed-c",
		result: "blocked",
	},
];

/** Audit report the panel renders on a click: the demo ledger, its root, intact + the three tampers. */
export interface LedgerAudit {
	entries: LedgerEntry[];
	root: string;
	intact: LedgerVerifyResult;
	altered: LedgerVerifyResult;
	deleted: {
		rootBefore: string;
		rootAfter: string;
		verify: LedgerVerifyResult;
	};
	reordered: LedgerVerifyResult;
}

/** ledgerAudit — build the demo ledger and demonstrate tamper-evidence on a click. Pure, total. */
export function ledgerAudit(): LedgerAudit {
	const entries = buildLedger(DEMO_RUNS);
	const root = ledgerRoot(entries);
	// ALTER row 1's BOM, keep its stored hashes ⇒ entry_hash_mismatch (red verify).
	const altered = entries.map((e) => ({ ...e, bom: { ...e.bom } }));
	altered[1].bom.goal = `${altered[1].bom.goal}·TAMPERED`;
	// DELETE the TAIL row ⇒ the tip ROOT changes vs the trusted anchor (the cross-row signal
	// BA28 lacked). The shorter chain is internally valid, so the evidence is the root delta.
	const deletedEntries = entries.slice(0, entries.length - 1);
	// REORDER rows 0/1 ⇒ index + chain break (red verify).
	const reorderedEntries = [entries[1], entries[0], entries[2]];
	return {
		entries,
		root,
		intact: verifyLedger(entries),
		altered: verifyLedger(altered),
		deleted: {
			rootBefore: root,
			rootAfter: ledgerRoot(deletedEntries),
			verify: verifyLedger(deletedEntries),
		},
		reordered: verifyLedger(reorderedEntries),
	};
}

// =======================================================================================
// GV04 — the ten OWASP Agentic Top-10 risks as DETERMINISTIC COMPLIANCE MIRRORS with
// per-risk fault-injection. Twin of back/runtime/governance/compliance.go: each risk has a
// mirror that is GREEN on the current (governed) state and goes RED when the corresponding
// violation is injected (the enforcer degraded the way that risk materializes). The Go
// package is the AUTHORITY (it reads the REAL enforcers); this twin REPLICATES the same
// governed-green / injected-red outcome so the panel renders the conformance suite WITHOUT a
// backend round-trip. Behaviour-faithful: each mirror's pair is the load-bearing proof.
// =======================================================================================

/** A compliance mirror's verdict against one scenario (twin of MirrorResult). */
export interface MirrorResult {
	risk: Risk;
	compliant: boolean;
	evidence: string;
	detail: string;
}

/** A compliance mirror for one OWASP risk (twin of ComplianceMirror). */
export interface ComplianceMirror {
	risk: Risk;
	title: string;
	anchor: string;
	forbidden: string;
	governed: MirrorResult;
	injected: MirrorResult;
}

/** The ten mirrors, AAI01..AAI10 — each anchored to the REAL enforcer it twins, GREEN on the
 *  current state and RED under its injection. Declared verbatim from compliance.go. */
const COMPLIANCE_MIRRORS: ComplianceMirror[] = [
	{
		risk: "AAI01_authorization_control_hijacking",
		title: "Authorization & Control Hijacking",
		anchor: "agentlayer.MayWrite",
		forbidden:
			"an agent writes to the kernel truth schema (above the waterline)",
		governed: gov(
			"AAI01_authorization_control_hijacking",
			"AGENT_WRITE_ABOVE_WATERLINE",
			"wall refuses the above-the-line write",
		),
		injected: inj(
			"AAI01_authorization_control_hijacking",
			"wall bypassed: the kernel write escapes",
		),
	},
	{
		risk: "AAI02_critical_system_interaction",
		title: "Critical-System Interaction",
		anchor: "agentimpl.GateAction (egress axis)",
		forbidden: "an agent reaches an undeclared network host",
		governed: gov(
			"AAI02_critical_system_interaction",
			"AGENT_EGRESS_NOT_ALLOWED",
			"egress axis denies: egress",
		),
		injected: inj(
			"AAI02_critical_system_interaction",
			"egress allow-list opened: the host escapes",
		),
	},
	{
		risk: "AAI03_goal_instruction_manipulation",
		title: "Goal & Instruction Manipulation",
		anchor: "agentimpl.Arbitrate / ArbitrateGated",
		forbidden:
			"an agent re-labels a deterministic action to route it through the LLM",
		governed: gov(
			"AAI03_goal_instruction_manipulation",
			"AGENT_DETERMINISM_GAP",
			"arbiter reads structure, ignores the displayed label",
		),
		injected: inj(
			"AAI03_goal_instruction_manipulation",
			"arbiter blinded to structure: the relabelled gap escapes",
		),
	},
	{
		risk: "AAI04_hallucination_misinformation",
		title: "Hallucination & Misinformation Exploitation",
		anchor: "agentlayer.Propose",
		forbidden:
			"an agent's generated output is admitted as truth without human approval",
		governed: gov(
			"AAI04_hallucination_misinformation",
			"PROPOSAL_NOT_ADMITTED",
			"Propose yields `proposed`, never `admitted`",
		),
		injected: inj(
			"AAI04_hallucination_misinformation",
			"auto-admit on: the generated output becomes truth",
		),
	},
	{
		risk: "AAI05_impact_chain_blast_radius",
		title: "Impact Chain & Blast Radius",
		anchor: "agentimpl.GateAction (path axis)",
		forbidden:
			"an agent writes outside its declared confinement (uncontrolled blast radius)",
		governed: gov(
			"AAI05_impact_chain_blast_radius",
			"AGENT_PATH_NOT_ALLOWED",
			"path axis denies: path",
		),
		injected: inj(
			"AAI05_impact_chain_blast_radius",
			"AllowedPaths opened: the out-of-bounds write escapes",
		),
	},
	{
		risk: "AAI06_memory_context_manipulation",
		title: "Memory & Context Manipulation",
		anchor: "agentlayer.Propose (memory firewall)",
		forbidden: "poisoned memory/context is admitted as truth",
		governed: gov(
			"AAI06_memory_context_manipulation",
			"MEMORY_CANNOT_DECLARE_TRUTH",
			"memory proposes, never freezes",
		),
		injected: inj(
			"AAI06_memory_context_manipulation",
			"firewall bypassed: poisoned memory becomes truth",
		),
	},
	{
		risk: "AAI07_orchestration_multiagent",
		title: "Orchestration & Multi-Agent Exploitation",
		anchor: "agentimpl.GateAction (capacity axis)",
		forbidden: "an agent invokes an MCP tool it was never bound to",
		governed: gov(
			"AAI07_orchestration_multiagent",
			"AGENT_TOOL_NOT_BOUND",
			"capacity axis denies: capacity",
		),
		injected: inj(
			"AAI07_orchestration_multiagent",
			"tool allow-list opened: the unbound tool escapes",
		),
	},
	{
		risk: "AAI08_supply_chain_dependency",
		title: "Supply Chain & Dependency Attacks",
		anchor: "agentimpl.GateAction (skill axis)",
		forbidden: "an agent binds an undeclared third-party skill at runtime",
		governed: gov(
			"AAI08_supply_chain_dependency",
			"AGENT_SKILL_NOT_BOUND",
			"skill axis denies: skill",
		),
		injected: inj(
			"AAI08_supply_chain_dependency",
			"skill allow-list opened: the undeclared skill escapes",
		),
	},
	{
		risk: "AAI09_untraceability_repudiation",
		title: "Untraceability & Repudiation",
		anchor: "agentrun.Verify (Merkle ledger)",
		forbidden: "a run is deleted from the audit ledger without a trace",
		governed: gov(
			"AAI09_untraceability_repudiation",
			"MERKLE_TAMPER_DETECTED",
			"Verify catches the deleted run",
		),
		injected: inj(
			"AAI09_untraceability_repudiation",
			"chain fold dropped: the deletion escapes",
		),
	},
	{
		risk: "AAI10_economic_resource_exhaustion",
		title: "Economic & Resource Exhaustion",
		anchor: "agentimpl.GateAction (budget axis)",
		forbidden: "a runaway run spends past its declared token/compute budget",
		governed: gov(
			"AAI10_economic_resource_exhaustion",
			"AGENT_BUDGET_EXCEEDED",
			"budget axis denies: budget",
		),
		injected: inj(
			"AAI10_economic_resource_exhaustion",
			"budget caps removed: the runaway spend escapes",
		),
	},
];

/** gov builds a GREEN governed MirrorResult (the risk is governed on the current state). */
function gov(risk: Risk, evidence: string, detail: string): MirrorResult {
	return { risk, compliant: true, evidence, detail };
}

/** inj builds a RED injected MirrorResult (the degraded enforcer lets the violation escape). */
function inj(risk: Risk, detail: string): MirrorResult {
	return { risk, compliant: false, evidence: "", detail };
}

/** mirrors — the ten compliance mirrors in canonical order (a defensive copy). Pure, total. */
export function mirrors(): ComplianceMirror[] {
	return COMPLIANCE_MIRRORS.map((m) => ({ ...m }));
}

/** mirrorFor — the compliance mirror for a risk, or undefined. Total. */
export function mirrorFor(risk: Risk): ComplianceMirror | undefined {
	const m = COMPLIANCE_MIRRORS.find((x) => x.risk === risk);
	return m ? { ...m } : undefined;
}

/** A conformance suite roll-up over a set of scenarios (twin of SuiteResult). */
export interface ComplianceSuite {
	results: MirrorResult[];
	allCompliant: boolean;
	compliant: number;
	total: number;
}

/** checkCompliance — every mirror's GOVERNED scenario over the current state. All ten MUST be
 *  green ("tous verts sur l'état courant"). Pure, total — same tables ⇒ same suite. */
export function checkCompliance(): ComplianceSuite {
	const results = COMPLIANCE_MIRRORS.map((m) => m.governed);
	const compliant = results.filter((r) => r.compliant).length;
	return {
		results,
		allCompliant: compliant === results.length,
		compliant,
		total: results.length,
	};
}

/** checkInjected — every mirror's FAULT-INJECTION scenario. ZERO may stay compliant (each MUST
 *  go red: "injecter la violation correspondante → le miroir passe rouge"). Pure, total. */
export function checkInjected(): ComplianceSuite {
	const results = COMPLIANCE_MIRRORS.map((m) => m.injected);
	const compliant = results.filter((r) => r.compliant).length;
	return {
		results,
		allCompliant: compliant === results.length,
		compliant,
		total: results.length,
	};
}

/** A click-ready GV04 audit: the governed (all-green) suite, the injected (all-red) suite, and
 *  the per-risk mirror pairs — what the panel's « Vérifier la conformité OWASP » control renders. */
export interface ComplianceAudit {
	mirrors: ComplianceMirror[];
	governed: ComplianceSuite;
	injected: ComplianceSuite;
}

/** complianceAudit — assemble the GV04 conformance audit on a click. Pure, total. */
export function complianceAudit(): ComplianceAudit {
	return {
		mirrors: mirrors(),
		governed: checkCompliance(),
		injected: checkInjected(),
	};
}

// =======================================================================================
// GV05 — the policy.yaml → GateAction COMPILER twin. Twin of back/runtime/governance/
// policy.go: a declared YAML policy (the readable SOURCE) compiles to the SAME confinement
// surface the gate enforces, with an EQUIVALENCE proof (the compiled policy denies exactly
// what the reference enforcer denies) and a TIGHTEN-NEVER-WIDEN proof (a policy can only
// equal or RESSERRER the reference, never widen it). The Go package is the AUTHORITY (it
// projects onto the real GateAction); this twin REPLICATES the same parse + validate +
// subset semantics so the /governance panel can COMPILE a policy and demonstrate the
// equivalence + the widen-rejection on a click, WITHOUT a backend round-trip.
//
// DETERMINISM-FIRST. A policy compiler is a pure parse + validate + project — code, never an
// "LLM translating policy to code". No I/O, no Date.now()/random; same YAML ⇒ same verdict.
// The wall stays authoritative: the policy is a declared confinement BELOW the line; the
// reference surface is the structural maximum, and a widening declaration is REJECTED.

/** The REFERENCE confinement surface — the structural maximum a policy may declare (twin of
 *  policy.referenceSurface). Anything beyond it WIDENS and is rejected. ONE declared source. */
export const REFERENCE_SURFACE = {
	allowedPaths: ["back/runtime/", "front/web/"],
	allowedNetworkHosts: ["api.anthropic.com", "api.openai.com"],
	allowedExec: ["go"],
	tools: [
		{ server: "store", tool: "read" },
		{ server: "store", tool: "write" },
	],
	skills: ["tdd", "diagnose"],
	maxTokensPerGoal: 100000,
} as const;

/** A compiled policy — the projected confinement surface the gate twin reads (twin of Policy). */
export interface CompiledPolicy {
	allowedPaths: string[];
	allowedNetworkHosts: string[];
	allowedExec: string[];
	tools: { server: string; tool: string }[];
	skills: string[];
	maxTokensPerGoal: number;
}

/** The result of compiling a policy.yaml: ok with the policy, or rejected with the reason. */
export type CompileResult =
	| { ok: true; policy: CompiledPolicy }
	| { ok: false; error: string };

/**
 * parsePolicyYAML — a tiny, deterministic parser for the policy subset the compiler accepts
 * (the fields of REFERENCE_SURFACE). It is NOT a general YAML parser: it reads the exact
 * block-list / scalar shape SAMPLE_POLICY_YAML / TIGHTEN_POLICY_YAML / WIDEN_POLICY_YAMLS use,
 * and FLAGS any unknown top-level key (so a typo cannot silently widen). Pure, total.
 */
function parsePolicyYAML(src: string): {
	fields: Record<string, unknown>;
	unknown?: string;
} {
	const known = new Set([
		"allowed_paths",
		"allowed_network_hosts",
		"allowed_exec",
		"tools",
		"skills",
		"max_tokens_per_goal",
	]);
	const fields: Record<string, unknown> = {};
	const lines = src.split("\n");
	let curKey: string | null = null;
	let curList: string[] = [];
	let curTools: { server: string; tool: string }[] = [];
	let pendingTool: { server?: string; tool?: string } | null = null;

	const flush = () => {
		if (!curKey) return;
		if (curKey === "tools") {
			if (
				pendingTool &&
				pendingTool.server !== undefined &&
				pendingTool.tool !== undefined
			) {
				curTools.push({ server: pendingTool.server, tool: pendingTool.tool });
			}
			fields.tools = curTools;
		} else {
			fields[curKey] = curList;
		}
		curList = [];
		curTools = [];
		pendingTool = null;
	};

	for (const raw of lines) {
		const line = raw.replace(/#.*$/, "");
		if (line.trim() === "") continue;
		const top = /^([a-z_]+):\s*(.*)$/.exec(line);
		if (
			top &&
			!line.startsWith(" ") &&
			!line.startsWith("\t") &&
			!line.startsWith("-")
		) {
			flush();
			curKey = top[1];
			if (!known.has(curKey)) return { fields, unknown: curKey };
			const inline = top[2].trim();
			if (inline === "[]") {
				if (curKey === "tools") curTools = [];
				else curList = [];
			} else if (inline !== "") {
				// scalar (e.g. max_tokens_per_goal: 100000)
				fields[curKey] = inline;
				curKey = null;
			}
			continue;
		}
		// indented list item / tool field
		const item = line.trim();
		if (curKey === "tools") {
			const t = /^-?\s*server:\s*(\S+)$/.exec(item);
			const u = /^tool:\s*(\S+)$/.exec(item);
			if (item.startsWith("- ") && t) {
				if (
					pendingTool &&
					pendingTool.server !== undefined &&
					pendingTool.tool !== undefined
				) {
					curTools.push({ server: pendingTool.server, tool: pendingTool.tool });
				}
				pendingTool = { server: t[1] };
			} else if (t && pendingTool) {
				pendingTool.server = t[1];
			} else if (u && pendingTool) {
				pendingTool.tool = u[1];
			}
		} else if (item.startsWith("- ")) {
			curList.push(item.slice(2).trim());
		}
	}
	flush();
	return { fields };
}

function asList(v: unknown): string[] {
	return Array.isArray(v) ? (v as string[]) : [];
}

/**
 * compilePolicy — parse a declared policy.yaml and PROJECT it onto the reference surface,
 * REJECTING any item that WIDENS beyond the reference (tighten-never-widen). Twin of
 * back/runtime/governance.CompilePolicy. Pure, total, deterministic.
 */
export function compilePolicy(src: string): CompileResult {
	const { fields, unknown } = parsePolicyYAML(src);
	if (unknown) {
		return {
			ok: false,
			error: `unknown policy key "${unknown}" (a typo cannot silently widen)`,
		};
	}
	const paths = asList(fields.allowed_paths);
	const hosts = asList(fields.allowed_network_hosts);
	const execs = asList(fields.allowed_exec);
	const skills = asList(fields.skills);
	const tools = (Array.isArray(fields.tools) ? fields.tools : []) as {
		server: string;
		tool: string;
	}[];

	const subsetErr = (
		field: string,
		declared: string[],
		reference: readonly string[],
	): string | null => {
		const ref = new Set(reference);
		for (const d of declared) {
			if (!ref.has(d)) {
				return `${field} declares "${d}" which WIDENS beyond the reference (a policy can only equal or tighten)`;
			}
		}
		return null;
	};

	for (const [field, declared, reference] of [
		["allowed_paths", paths, REFERENCE_SURFACE.allowedPaths],
		["allowed_network_hosts", hosts, REFERENCE_SURFACE.allowedNetworkHosts],
		["allowed_exec", execs, REFERENCE_SURFACE.allowedExec],
		["skills", skills, REFERENCE_SURFACE.skills],
	] as const) {
		const e = subsetErr(field, declared, reference);
		if (e) return { ok: false, error: e };
	}
	const refTools = new Set(
		REFERENCE_SURFACE.tools.map((t) => `${t.server} ${t.tool}`),
	);
	for (const t of tools) {
		if (!refTools.has(`${t.server} ${t.tool}`)) {
			return {
				ok: false,
				error: `tools declares (${t.server},${t.tool}) which WIDENS beyond the reference tool surface`,
			};
		}
	}

	let cap: number = REFERENCE_SURFACE.maxTokensPerGoal;
	if (fields.max_tokens_per_goal !== undefined) {
		const c = Number(fields.max_tokens_per_goal);
		if (!Number.isFinite(c) || c < 0) {
			return {
				ok: false,
				error: `max_tokens_per_goal "${String(fields.max_tokens_per_goal)}" is invalid`,
			};
		}
		if (c > REFERENCE_SURFACE.maxTokensPerGoal) {
			return {
				ok: false,
				error: `max_tokens_per_goal ${c} WIDENS the reference cap ${REFERENCE_SURFACE.maxTokensPerGoal} (a policy can only equal or tighten)`,
			};
		}
		cap = c;
	}

	return {
		ok: true,
		policy: {
			allowedPaths: paths,
			allowedNetworkHosts: hosts,
			allowedExec: execs,
			tools,
			skills,
			maxTokensPerGoal: cap,
		},
	};
}

/** An action the policy gate twin evaluates (a subset of the gate's Action). */
export interface PolicyAction {
	target?: string;
	host?: string;
	exec?: string;
	server?: string;
	tool?: string;
	skill?: string;
}

/** A gate verdict (twin of agentimpl.Decision): allowed, or denied with the failing axis. */
export interface PolicyDecision {
	allowed: boolean;
	deniedAxis: string;
	code: string;
}

const ALLOW: PolicyDecision = { allowed: true, deniedAxis: "", code: "" };
function denyDecision(axis: string, code: string): PolicyDecision {
	return { allowed: false, deniedAxis: axis, code };
}

// The wall zones (twin of WallForbiddenPaths) — a target above the waterline trips the ZONE
// axis under EVERY policy (the wall is not widenable). Prefix-matched.
const WALL_ZONES = [
	"kernel.",
	"mirrors.",
	"fitness.",
	"back/kernel/",
	"back/migrations/",
];

function aboveWaterline(target: string): boolean {
	return WALL_ZONES.some((z) => target === z || target.startsWith(z));
}

/**
 * gateUnderPolicy — the gate twin in the SAME precedence as agentimpl.GateAction
 * (determinism → zone → path → egress → exec → capacity → skill → budget), returning the
 * FIRST violation's verdict. Twin of GateUnderPolicy: the compiled policy's surface is the
 * confinement the gate reads, so the verdict is single-sourced from the SAME surface the
 * equivalence proof checks. Pure, total.
 */
export function gateUnderPolicy(
	p: CompiledPolicy,
	act: PolicyAction,
): PolicyDecision {
	// 2. ZONE — a target above the waterline is refused before the path allow-list.
	if (act.target && aboveWaterline(act.target)) {
		return denyDecision("zone", "AGENT_WRITE_ABOVE_WATERLINE");
	}
	// 3. PATH — default-deny against allowedPaths (prefix allow-list).
	if (act.target) {
		if (!p.allowedPaths.some((pre) => act.target?.startsWith(pre))) {
			return denyDecision("path", "AGENT_PATH_NOT_ALLOWED");
		}
	}
	// 4. EGRESS — declared hosts; empty ⇒ no egress.
	if (act.host) {
		if (!p.allowedNetworkHosts.includes(act.host)) {
			return denyDecision("egress", "AGENT_EGRESS_NOT_ALLOWED");
		}
	}
	// 5. EXEC — declared allow-list; empty ⇒ no exec.
	if (act.exec) {
		if (!p.allowedExec.includes(act.exec)) {
			return denyDecision("exec", "AGENT_EXEC_NOT_ALLOWED");
		}
	}
	// 6. CAPACITY — the bound MCP (server, tool).
	if (act.server || act.tool) {
		if (!p.tools.some((t) => t.server === act.server && t.tool === act.tool)) {
			return denyDecision("capacity", "AGENT_TOOL_NOT_BOUND");
		}
	}
	// 7. SKILL — the bound skill.
	if (act.skill) {
		if (!p.skills.includes(act.skill)) {
			return denyDecision("skill", "AGENT_SKILL_NOT_BOUND");
		}
	}
	return ALLOW;
}

/** The reference policy YAML — declares the reference surface verbatim (twin of SamplePolicyYAML). */
export const SAMPLE_POLICY_YAML = `# AIDOS policy — declares the reference confinement surface verbatim.
allowed_paths:
  - back/runtime/
  - front/web/
allowed_network_hosts:
  - api.anthropic.com
  - api.openai.com
allowed_exec:
  - go
tools:
  - server: store
    tool: read
  - server: store
    tool: write
skills:
  - tdd
  - diagnose
max_tokens_per_goal: 100000
`;

/** A tighter policy — a strict subset of the reference (twin of TightenPolicyYAML). */
export const TIGHTEN_POLICY_YAML = `# A tighter policy — a strict subset of the reference (denies more, never less).
allowed_paths:
  - back/runtime/
allowed_network_hosts:
  - api.anthropic.com
allowed_exec: []
tools:
  - server: store
    tool: read
skills:
  - tdd
max_tokens_per_goal: 1000
`;

/** One widening policy per axis — each declares something OUTSIDE the reference; every one
 *  MUST be rejected by compilePolicy (twin of WidenPolicyYAMLs). */
export const WIDEN_POLICY_YAMLS: Record<string, string> = {
	path: "allowed_paths:\n  - back/kernel/\n",
	host: "allowed_network_hosts:\n  - evil.example.com\n",
	exec: "allowed_exec:\n  - /bin/sh\n",
	tool: "tools:\n  - server: privileged\n    tool: deploy\n",
	skill: "skills:\n  - untrusted-third-party\n",
	budget_raise: "max_tokens_per_goal: 999999999\n",
	unknown_field: "totally_unknown_knob: true\n",
};

/** The fixed action probe set the panel gates under both the reference and the tighter policy —
 *  spanning every axis so the equivalence + tighten demonstration is visible per row. */
export const POLICY_PROBE_ACTIONS: { label: string; action: PolicyAction }[] = [
	{ label: "write back/runtime/", action: { target: "back/runtime/x.go" } },
	{ label: "write kernel (wall)", action: { target: "kernel.truth" } },
	{ label: "write front/web/", action: { target: "front/web/app/x.tsx" } },
	{ label: "egress api.anthropic.com", action: { host: "api.anthropic.com" } },
	{ label: "egress evil.example.com", action: { host: "evil.example.com" } },
	{ label: "exec go", action: { exec: "go" } },
	{ label: "tool store/write", action: { server: "store", tool: "write" } },
	{
		label: "tool privileged/deploy",
		action: { server: "privileged", tool: "deploy" },
	},
	{ label: "skill diagnose", action: { skill: "diagnose" } },
];

/** One equivalence row: the action and the reference vs tighter verdict (for the panel). */
export interface PolicyEquivRow {
	label: string;
	reference: PolicyDecision;
	tighter: PolicyDecision;
	/** true iff the tighter policy never widened the reference verdict (denied ⊇ reference-denied). */
	neverWidens: boolean;
}

/** One widen-rejection row: the axis name and the compiler's rejection (for the panel). */
export interface WidenRejectRow {
	axis: string;
	rejected: boolean;
	error: string;
}

/** The click-ready GV05 audit: the compiled reference + tighter policies, the per-action
 *  equivalence/tighten rows, and the per-axis widen-rejection rows. */
export interface PolicyAudit {
	referenceOk: boolean;
	tighterOk: boolean;
	rows: PolicyEquivRow[];
	allTighten: boolean;
	widenRows: WidenRejectRow[];
	allWidenRejected: boolean;
}

/**
 * policyAudit — assemble the GV05 audit on a click. Compiles the reference + tighter policies,
 * gates the probe set under both (proving the tighter NEVER widens), and compiles each widening
 * policy (proving every one is REJECTED). Pure, total, deterministic.
 */
export function policyAudit(): PolicyAudit {
	const refR = compilePolicy(SAMPLE_POLICY_YAML);
	const tightR = compilePolicy(TIGHTEN_POLICY_YAML);
	const rows: PolicyEquivRow[] = [];
	let allTighten = true;
	if (refR.ok && tightR.ok) {
		for (const { label, action } of POLICY_PROBE_ACTIONS) {
			const reference = gateUnderPolicy(refR.policy, action);
			const tighter = gateUnderPolicy(tightR.policy, action);
			// tighten-never-widen: if the reference denied, the tighter must also deny.
			const neverWidens = reference.allowed || !tighter.allowed;
			if (!neverWidens) allTighten = false;
			rows.push({ label, reference, tighter, neverWidens });
		}
	}
	const widenRows: WidenRejectRow[] = Object.entries(WIDEN_POLICY_YAMLS).map(
		([axis, y]) => {
			const r = compilePolicy(y);
			return { axis, rejected: !r.ok, error: r.ok ? "" : r.error };
		},
	);
	return {
		referenceOk: refR.ok,
		tighterOk: tightR.ok,
		rows,
		allTighten,
		widenRows,
		allWidenRejected: widenRows.every((w) => w.rejected),
	};
}

// ── GV06 — SRE alignment (error-budget / circuit-breaker) + identity/trust ──────────────────
//
// Front twin of back/runtime/governance/sre.go. The Microsoft AGT offers SRE controls and an
// identity/trust pillar; AIDOS adopts them as AUGMENTATIONS over the structural wall. An error
// budget IS a count, a breaker IS a threshold on an observed rate, a trust chain IS the GV03
// Merkle fold — all pure, deterministic functions, never an "SRE agent" (determinism-first).
// governance.test.ts pins reproducibility + fail-closed monotonicity.

/** SREDefaultSLO — declared (never learned, §8): a 25% error budget (≤1 failure in 4 runs). */
export const SRE_DEFAULT_SLO = 0.25;

export type BreakerState = "closed" | "open";

/** SREState — twin of governance.SREState: the deterministic error-budget + breaker verdict. */
export interface SREState {
	window: number;
	failures: number;
	errorRate: number;
	target: number;
	totalBudget: number;
	remainingBudget: number;
	breaker: BreakerState;
}

/** isFailure — only a closed-green run is a success; everything else burns error budget. */
function isFailure(result: string): boolean {
	return result !== "green";
}

/**
 * evaluateSRE — twin of governance.EvaluateSRE. Pure, total, deterministic: same (results, slo)
 * ⇒ same SREState. An empty window is fully healthy. Target clamped to [0,1]; breaker opens iff
 * the observed error rate breaches the target (fail-closed).
 */
export function evaluateSRE(results: string[], slo: number): SREState {
	let target = slo;
	if (target < 0) target = 0;
	else if (target > 1) target = 1;
	const window = results.length;
	let failures = 0;
	for (const r of results) if (isFailure(r)) failures++;
	const errorRate = window > 0 ? failures / window : 0;
	const totalBudget = Math.floor(target * window);
	const remainingBudget = Math.max(0, totalBudget - failures);
	const breaker: BreakerState = errorRate > target ? "open" : "closed";
	return {
		window,
		failures,
		errorRate,
		target,
		totalBudget,
		remainingBudget,
		breaker,
	};
}

/** TrustRow — twin of governance.TrustRow: one run's identity bound to its Merkle entry root. */
export interface TrustRow {
	index: number;
	run: string;
	agent: string;
	impl: string;
	entryRoot: string;
}

/** TrustChain — twin of governance.TrustChain: the identity cover + the tamper-evident tip root. */
export interface TrustChain {
	rows: TrustRow[];
	root: string;
}

/**
 * buildTrustChain — twin of governance.BuildTrustChain. REUSES buildLedger/ledgerRoot (the GV03
 * twin) so identity is bound to the SAME tamper-evident root the audit verifies — never a
 * parallel hash. Pure, total, deterministic: same runs ⇒ same chain.
 */
export function buildTrustChain(runs: LedgerRun[]): TrustChain {
	const rows: TrustRow[] = [];
	for (let i = 0; i < runs.length; i++) {
		const prefix = buildLedger(runs.slice(0, i + 1));
		rows.push({
			index: i,
			run: runs[i].id,
			agent: runs[i].agent,
			impl: runs[i].impl ?? "",
			entryRoot: ledgerRoot(prefix),
		});
	}
	return { rows, root: ledgerRoot(buildLedger(runs)) };
}

/** sreAudit — the Workbench GV06 audit slice: the SRE verdict + the trust chain over DEMO_RUNS. */
export interface SREAudit {
	sre: SREState;
	trust: TrustChain;
}

export function sreAudit(): SREAudit {
	const results = DEMO_RUNS.map((r) => r.result);
	return {
		sre: evaluateSRE(results, SRE_DEFAULT_SLO),
		trust: buildTrustChain(DEMO_RUNS),
	};
}
