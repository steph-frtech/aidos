/**
 * bootstrap-spike — the TS twin of /spike/bootstrap (DP10, SPIKE-gate, ratchet OFF,
 * T0). DETERMINISM-FIRST (CLAUDE.md §6/§8): a PURE re-implementation of the
 * throwaway Go probe's decision core so the Workbench /bootstrap-spike route renders
 * the MEASURED go/no-go verdict + the real startup log without a backend round-trip.
 * The AUTHORITATIVE engine is the Go spike (spike/bootstrap, `go run ./cmd/verdict`,
 * two REAL docker runs); the twin is parity-pinned to it by the vitest mirror: the
 * same canonical verdict form hashes to the SAME sha256 the Go probe printed.
 *
 * The probe: an emitted bundle + a throwaway bootstrap really started
 * traefik→datastore→serveur in order on the local daemon, healthchecks green
 * (tcp / pg_isready / running), URL answered 200 through the spike traefik, twice,
 * reproducibly — while deploy.sh's bytes measure 7 interactive prompts and 3
 * hardcoded /data/dockers references. Port resolution and start order are PURE
 * functions of the observed state (ss + docker ps AS DATA) — never a prompt.
 * Verdict = a boolean conjunction over measures, NEVER an LLM opinion.
 *
 * THE WALL (CLAUDE.md §2): pure judgment — this module writes NOTHING (no kernel/
 * mirrors/fitness, no persistence). /harvest PROPOSES a draft record; /goal freezes.
 * The sha256 is imported LAZILY (dynamic `node:crypto`) so the module stays portable.
 */

export interface SpikeService {
	name: string;
	role: "traefik" | "datastore" | "server";
	image: string;
	internalPort: number;
}

export interface SpikeBundle {
	appName: string;
	services: SpikeService[];
	network: string;
	hostRule: string;
}

export interface ObservedState {
	ssOutput: string;
	dockerPsOutput: string;
}

export interface SpikePlan {
	network: string;
	resolvedPort: number;
	order: string[];
	urls: string[];
}

export interface SpikeEvent {
	seq: number;
	kind: string;
	detail: string;
}

export interface RunResult {
	events: SpikeEvent[];
	resolvedPort: number;
	orderedOk: boolean;
	healthyAll: boolean;
	urlProbe: boolean;
	urls: string[];
}

export interface ScriptMeasures {
	promptCount: number;
	dataDockersRefs: number;
	scriptLineCount: number;
}

export interface Candidate {
	id: "native-go" | "wrapper" | "deploy-sh";
	label: string;
	features: Record<string, boolean>;
	score: number;
}

export interface Measurement {
	planDeterministic: boolean;
	orderDeterministic: boolean;
	run1: RunResult;
	run2: RunResult;
	runsReproducible: boolean;
	script: ScriptMeasures;
	candidates: Candidate[];
}

export interface SpikeVerdict {
	go: boolean;
	reasons: string[];
	winner: string;
	measurement: Measurement;
	verdictHash: string;
}

export interface HarvestRecord {
	proposes: string;
	intent: string;
	go: boolean;
	verdictHash: string;
	provenanceKind: string;
	provenanceFrom: string;
	status: string;
	hasMirror: boolean;
	hasVersion: boolean;
	recordHash: string;
	openQuestions: string[];
}

/** the declared base port for the spike traefik web entrypoint (Go BasePort). */
export const BASE_PORT = 18080;

/** the pinned DP10 emitted-bundle fixture — identical to the Go spike's Fixture(). */
export const FIXTURE_BUNDLE: SpikeBundle = {
	appName: "dp10spike",
	services: [
		{
			name: "server",
			role: "server",
			image: "caddy:2-alpine",
			internalPort: 80,
		},
		{
			name: "traefik",
			role: "traefik",
			image: "traefik:latest",
			internalPort: 80,
		},
		{
			name: "postgres",
			role: "datastore",
			image: "postgres:16-alpine",
			internalPort: 5432,
		},
	],
	network: "dp10spike_net",
	hostRule: "dp10spike.localhost",
};

/** the EXACT verdict address the authoritative Go probe measured (2 real runs). */
export const MEASURED_GO_VERDICT_HASH =
	"a2f23a64ab7769597ed983eb6413239db526995233924b27c4b3122288662dd0";

// ---------------------------------------------------------------------------
// PURE core — twins of spike/bootstrap ports.go / plan.go / candidates.go
// ---------------------------------------------------------------------------

const SS_ADDR_RE = /:(\d+)\s/g;
const PS_MAP_RE = /:(\d+)->/g;

/** parse listening ports from raw `ss -ltn` output. Pure. */
export function parseSS(out: string): number[] {
	const seen = new Set<number>();
	for (const line of out.split("\n")) {
		if (!line.includes("LISTEN")) continue;
		for (const m of `${line} `.matchAll(SS_ADDR_RE)) {
			seen.add(Number(m[1]));
		}
	}
	return [...seen].sort((a, b) => a - b);
}

/** parse host-mapped ports from raw `docker ps -a --format '{{.Ports}}'`. Pure. */
export function parseDockerPS(out: string): number[] {
	const seen = new Set<number>();
	for (const m of out.matchAll(PS_MAP_RE)) {
		seen.add(Number(m[1]));
	}
	return [...seen].sort((a, b) => a - b);
}

/** the occupied set = ss ∪ docker ps (the deploy.sh check, as a pure function). */
export function occupiedFrom(state: ObservedState): Set<number> {
	return new Set([
		...parseSS(state.ssOutput),
		...parseDockerPS(state.dockerPsOutput),
	]);
}

/** first free port ≥ base. PURE — never a prompt: same occupied set → same port. */
export function resolvePort(occupied: Set<number>, base: number): number {
	let p = base;
	while (occupied.has(p)) p++;
	return p;
}

const ROLE_RANK: Record<SpikeService["role"], number> = {
	traefik: 0,
	datastore: 1,
	server: 2,
};

/** deterministic start order: rank by role, tie-break by name. Permutation-stable. */
export function startOrder(services: SpikeService[]): string[] {
	return [...services]
		.sort((a, b) =>
			ROLE_RANK[a.role] !== ROLE_RANK[b.role]
				? ROLE_RANK[a.role] - ROLE_RANK[b.role]
				: a.name < b.name
					? -1
					: a.name > b.name
						? 1
						: 0,
		)
		.map((s) => s.name);
}

/** the bootstrap plan — PURE function of (bundle, observed snapshot). Plan = data. */
export function buildPlan(b: SpikeBundle, state: ObservedState): SpikePlan {
	const port = resolvePort(occupiedFrom(state), BASE_PORT);
	return {
		network: b.network,
		resolvedPort: port,
		order: startOrder(b.services),
		urls: [`http://127.0.0.1:${port}/ (Host: ${b.hostRule})`],
	};
}

/** the DECLARED criterion list (order is part of the declaration). */
export const CRITERIA = [
	"zero_prompt_in_path",
	"non_interactive_invocation",
	"independent_of_data_dockers",
	"plan_is_data",
	"future_cloud_portable",
] as const;

/** score the ≤3 candidates from the measured script facts — a feature COUNT. Pure. */
export function scoreCandidates(script: ScriptMeasures): Candidate[] {
	const promptFree = script.promptCount === 0;
	const pathFree = script.dataDockersRefs === 0;
	const mk = (
		id: Candidate["id"],
		label: string,
		features: Record<string, boolean>,
	): Candidate => ({
		id,
		label,
		features,
		score: CRITERIA.reduce((n, c) => n + (features[c] ? 1 : 0), 0),
	});
	return [
		mk("native-go", "émetteur bootstrap natif Go déterministe", {
			zero_prompt_in_path: true,
			non_interactive_invocation: true,
			independent_of_data_dockers: true,
			plan_is_data: true,
			future_cloud_portable: true,
		}),
		mk("wrapper", "wrapper non-interactif autour de deploy.sh", {
			zero_prompt_in_path: promptFree,
			non_interactive_invocation: true,
			independent_of_data_dockers: pathFree,
			plan_is_data: false,
			future_cloud_portable: false,
		}),
		mk("deploy-sh", "appel direct de /data/dockers/deploy.sh", {
			zero_prompt_in_path: promptFree,
			non_interactive_invocation: false,
			independent_of_data_dockers: pathFree,
			plan_is_data: false,
			future_cloud_portable: false,
		}),
	];
}

// ---------------------------------------------------------------------------
// the MEASURED fixture — the real startup logs the Go probe captured
// (spike/bootstrap/verdict-measured.json, 2026-06-13, two live docker runs).
// ---------------------------------------------------------------------------

const MEASURED_EVENTS: SpikeEvent[] = [
	{ seq: 1, kind: "network-created", detail: "dp10spike_net" },
	{ seq: 2, kind: "traefik-up", detail: "dp10spike-traefik" },
	{ seq: 3, kind: "healthy:traefik", detail: "tcp 127.0.0.1:18080" },
	{ seq: 4, kind: "datastore-up", detail: "dp10spike-postgres" },
	{ seq: 5, kind: "healthy:postgres", detail: "pg_isready" },
	{ seq: 6, kind: "server-up", detail: "dp10spike-server" },
	{ seq: 7, kind: "healthy:server", detail: "running" },
	{
		seq: 8,
		kind: "url-probed",
		detail: "GET http://127.0.0.1:18080/ (Host: dp10spike.localhost) → 200",
	},
	{
		seq: 9,
		kind: "urls-printed",
		detail: "http://127.0.0.1:18080/ (Host: dp10spike.localhost)",
	},
];

const MEASURED_RUN: RunResult = {
	events: MEASURED_EVENTS,
	resolvedPort: 18080,
	orderedOk: true,
	healthyAll: true,
	urlProbe: true,
	urls: ["http://127.0.0.1:18080/ (Host: dp10spike.localhost)"],
};

const MEASURED_SCRIPT: ScriptMeasures = {
	promptCount: 7,
	dataDockersRefs: 3,
	scriptLineCount: 322,
};

/** the full measurement the Go probe printed — the twin re-decides over it. */
export const MEASURED: Measurement = {
	planDeterministic: true,
	orderDeterministic: true,
	run1: MEASURED_RUN,
	run2: structuredClone(MEASURED_RUN),
	runsReproducible: true,
	script: MEASURED_SCRIPT,
	candidates: scoreCandidates(MEASURED_SCRIPT),
};

// ---------------------------------------------------------------------------
// verdict — twin of spike/bootstrap verdict.go (same canonical form, same sha256)
// ---------------------------------------------------------------------------

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

function eventKinds(events: SpikeEvent[]): string[] {
	return events.map((e) => e.kind);
}

/** two runs are reproducible ⇔ same resolved port + identical ordered kinds. Pure. */
export function reproducible(a: RunResult, b: RunResult): boolean {
	if (a.resolvedPort !== b.resolvedPort) return false;
	const ka = eventKinds(a.events);
	const kb = eventKinds(b.events);
	return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

function topCandidate(cs: Candidate[]): { winner: string; strict: boolean } {
	let winner = "";
	let best = -1;
	let strict = false;
	for (const c of cs) {
		if (c.score > best) {
			winner = c.id;
			best = c.score;
			strict = true;
		} else if (c.score === best) {
			strict = false;
		}
	}
	return { winner, strict };
}

/** the go/no-go: a PURE conjunction over the measurement (Go Decide twin). */
export async function decide(m: Measurement): Promise<SpikeVerdict> {
	const { winner, strict } = topCandidate(m.candidates);
	const conj: Array<[boolean, string]> = [
		[
			m.planDeterministic,
			"résolution de ports pure (même snapshot → même plan)",
		],
		[m.orderDeterministic, "ordre de démarrage pur (permutation → même ordre)"],
		[
			m.run1.orderedOk && m.run2.orderedOk,
			"démarrage ordonné traefik→datastore→serveur (2 runs réels)",
		],
		[
			m.run1.healthyAll && m.run2.healthyAll,
			"healthchecks verts (2 runs réels)",
		],
		[
			m.run1.urlProbe && m.run2.urlProbe,
			"URL imprimée répond 200 via traefik (2 runs réels)",
		],
		[
			m.runsReproducible,
			"reproductibilité (mêmes événements ordonnés, même port résolu)",
		],
		[
			strict && winner === "native-go",
			"le candidat natif Go score strictement le plus haut",
		],
	];
	let go = true;
	const reasons: string[] = [];
	for (const [ok, name] of conj) {
		if (!ok) go = false;
		reasons.push(`${ok ? "✓" : "✗"} ${name}`);
	}
	const verdictHash = await hashVerdict(go, winner, reasons, m);
	return { go, reasons, winner, measurement: m, verdictHash };
}

/** canonical form IDENTICAL to Go hashVerdict — the parity pin. */
async function hashVerdict(
	go: boolean,
	winner: string,
	reasons: string[],
	m: Measurement,
): Promise<string> {
	let b = `go=${go}\nwinner=${winner}\n`;
	for (const r of reasons) b += `reason=${r}\n`;
	b += `port1=${m.run1.resolvedPort}\nport2=${m.run2.resolvedPort}\nprompts=${m.script.promptCount}\nrefs=${m.script.dataDockersRefs}\n`;
	for (const e of m.run1.events) b += `e1=${e.seq}:${e.kind}\n`;
	for (const e of m.run2.events) b += `e2=${e.seq}:${e.kind}\n`;
	for (const c of m.candidates) b += `c=${c.id}:${c.score}\n`;
	return sha256hex(b);
}

// ---------------------------------------------------------------------------
// harvest — twin of spike/bootstrap harvest.go (proposes, never freezes)
// ---------------------------------------------------------------------------

const OPEN_QUESTIONS = [
	"OQ-DP10-1 secrets-check : le spike couvre réseau→ports→ordre→healthchecks→URLs ; la matérialisation .env + secret-store + gitleaks-scan est l'affaire de DP12/S91 (le mot de passe jetable vient d'une variable d'environnement, jamais en dur).",
	"OQ-DP10-2 volumes : le spike ne monte aucun volume bind (probe éphémère) ; les volumes nommés bind ${APP_DATA_PATH} (convention /data/dockers) sont émis par DP03/DP12.",
	"OQ-DP10-3 traefik prod : le traefik jetable porte un constraint Label(dp10.spike.expose) et son propre réseau — le traefik de prod (traefik_default) n'est jamais touché ; DP12 cible le VRAI traefik_default (exigence utilisateur 1 : https://<projet>-dev.sagedesk.fr).",
	"OQ-DP10-4 le mur : le spike ne persiste RIEN ; l'écriture réelle du verdict en `ideas` passe par idea_capture (provenance human) — ce record MODÉLISE la capture, il ne l'exécute pas.",
];

/** lift the verdict into a DRAFT candidate-Idea record. Pure (modulo sha256). */
export async function harvest(v: SpikeVerdict): Promise<HarvestRecord> {
	const intent = v.go
		? `émettre le bootstrap one-shot déterministe (DP12) : la mesure DP10 prouve qu'un plan-as-data pur (résolution de ports sur ss+docker ps, ordre traefik→datastore→serveur, healthchecks bloquants, print-URLs) démarre une stack réelle de façon REPRODUCTIBLE (2 runs, mêmes événements ordonnés, même port) là où deploy.sh impose ${v.measurement.script.promptCount} prompts interactifs et ${v.measurement.script.dataDockersRefs} références /data/dockers en dur — DP11-DP13 peuvent s'écrire.`
		: "réutiliser deploy.sh directement : la mesure DP10 ne prouve pas la valeur du bootstrap natif — ADR de réutilisation documentée, DP11-DP13 ne s'écrivent pas.";
	const r: Omit<HarvestRecord, "recordHash"> = {
		proposes: "operation",
		intent,
		go: v.go,
		verdictHash: v.verdictHash,
		provenanceKind: "human",
		provenanceFrom: "spike:DP10 (spike/bootstrap)",
		status: "draft",
		hasMirror: false,
		hasVersion: false,
		openQuestions: OPEN_QUESTIONS,
	};
	let b = `proposes=${r.proposes}\nintent=${r.intent}\ngo=${r.go}\nverdict=${r.verdictHash}\nprovenance=${r.provenanceKind}/${r.provenanceFrom}\nstatus=${r.status}\nhas_mirror=${r.hasMirror}\nhas_version=${r.hasVersion}\n`;
	for (const q of r.openQuestions) b += `oq=${q}\n`;
	return { ...r, recordHash: await sha256hex(b) };
}
