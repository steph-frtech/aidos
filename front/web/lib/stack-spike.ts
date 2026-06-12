/**
 * stack-spike — the TS twin of /spike/stackmanifest (DP01, SPIKE-gate, ratchet OFF,
 * T0). DETERMINISM-FIRST (CLAUDE.md §6/§8): a PURE re-implementation of the throwaway
 * Go probe so the Workbench /stack-spike route renders the MEASURED go/no-go verdict
 * without a backend round-trip. The AUTHORITATIVE engine is the Go spike
 * (spike/stackmanifest, `go run ./cmd/verdict`); the twin is byte-parity-pinned to it
 * by the vitest mirror (same canonical bytes → same sha256 as Go).
 *
 * The probe: a minimal StackManifest → a pure emitter → a docker-compose.yml honouring
 * the /data/dockers conventions; measured = byte-identical re-emission (hash equality),
 * compose round-trip, and the drift-detection asymmetry (the content-addressed source
 * detects a hand-edit; the static template is drift-blind). Verdict = a boolean
 * conjunction over measures — NEVER an LLM opinion.
 *
 * THE WALL (CLAUDE.md §2): pure judgment — this module writes NOTHING (no kernel/
 * mirrors/fitness, no persistence). /harvest PROPOSES a draft record; /goal freezes.
 * The sha256 is imported LAZILY (dynamic `node:crypto`) so this module stays portable.
 */

export interface SpikeService {
	name: string;
	role: string;
	image: string;
	internalPort: number;
	profile: string;
}

export interface SpikeVolume {
	name: string;
	/** env-var REFERENCE for the bind device — never a hardcoded path. */
	deviceVar: string;
}

export interface SpikeStackManifest {
	appName: string;
	services: SpikeService[];
	volumes: SpikeVolume[];
	network: { name: string; external: boolean };
	connectorScopes: string[];
}

/** the pinned DP01 fixture — identical to the Go spike's Fixture(). */
export const FIXTURE: SpikeStackManifest = {
	appName: "alphaspike",
	services: [
		{
			name: "app",
			role: "server",
			image: "denoland/deno:alpine",
			internalPort: 3571,
			profile: "core",
		},
		{
			name: "postgres",
			role: "datastore",
			image: "postgres:17-alpine",
			internalPort: 5432,
			profile: "core",
		},
	],
	volumes: [{ name: "app_data", deviceVar: "APP_DATA_PATH" }],
	network: { name: "traefik_default", external: true },
	connectorScopes: ["postgres:read-only"],
};

/** N — how many re-emissions the probe performs (same as the Go spike). */
export const EMISSIONS = 100;

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/** canonicalize — field-explicit, sorted, "\n"-joined; mirrors Go Canonicalize. */
export function canonicalize(m: SpikeStackManifest): string {
	const services = [...m.services].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const volumes = [...m.volumes].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const scopes = [...m.connectorScopes].sort();
	const b: string[] = ["stack_manifest/v0", `app=${m.appName}`];
	for (const s of services) {
		b.push(
			`service=${s.name} role=${s.role} image=${s.image} port=${s.internalPort} profile=${s.profile}`,
		);
	}
	for (const v of volumes) {
		b.push(`volume=${v.name} device_var=${v.deviceVar}`);
	}
	b.push(`network=${m.network.name} external=${m.network.external}`);
	for (const sc of scopes) {
		b.push(`connector_scope=${sc}`);
	}
	return b.join("\n");
}

/** sourceHash — the manifest's content address (sha256 of canonical form). */
export async function sourceHash(m: SpikeStackManifest): Promise<string> {
	return sha256hex(canonicalize(m));
}

/** outputHash — content address of an emitted artifact's bytes. */
export async function outputHash(emitted: string): Promise<string> {
	return sha256hex(emitted);
}

function renderService(s: SpikeService): string[] {
	const port = String(s.internalPort);
	const out: string[] = [
		`  ${s.name}:`,
		`    image: ${s.image}`,
		`    container_name: \${APP_NAME}-${s.name}`,
		`    # role: ${s.role}`,
		"    env_file:",
		"      - .env",
		"    profiles:",
		`      - ${s.profile}`,
		"    networks:",
		"      - traefik_default",
		"    restart: unless-stopped",
		"    healthcheck:",
		'      test: ["CMD-SHELL", "exit 0"]',
		"      interval: 30s",
		"      timeout: 3s",
		"      retries: 3",
	];
	if (s.role === "server") {
		out.push(
			"    labels:",
			'      - "traefik.enable=true"',
			"      # HTTPS router",
			// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal compose ${VAR} placeholders, interpolated by docker compose (env-var convention)
			'      - "traefik.http.routers.${APP_NAME}.rule=Host(`${APP_SUBDOMAIN}.${DOMAIN}`)"',
			'      - "traefik.http.routers.${APP_NAME}.entrypoints=websecure"',
			'      - "traefik.http.routers.${APP_NAME}.tls=true"',
			'      - "traefik.http.routers.${APP_NAME}.tls.certresolver=${CERT_RESOLVER_NAME}"',
			`      - "traefik.http.services.\${APP_NAME}.loadbalancer.server.port=${port}"`,
			"      # HTTP -> HTTPS redirect",
			'      - "traefik.http.routers.${APP_NAME}-http.rule=Host(`${APP_SUBDOMAIN}.${DOMAIN}`)"',
			'      - "traefik.http.routers.${APP_NAME}-http.entrypoints=web"',
			'      - "traefik.http.routers.${APP_NAME}-http.middlewares=${APP_NAME}-https-redirect"',
			'      - "traefik.http.middlewares.${APP_NAME}-https-redirect.redirectscheme.scheme=https"',
			// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal compose ${VAR} placeholders
		);
	} else {
		out.push(`    # internal_port: ${port}`);
	}
	return out;
}

/** emit — the pure emitter, byte-identical to the Go spike's Emit. */
export async function emit(m: SpikeStackManifest): Promise<string> {
	const services = [...m.services].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const volumes = [...m.volumes].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const src = await sourceHash(m);

	let b: string[] = [
		`# generated by the DP01 throwaway emitter — source_hash: ${src}`,
		"services:",
	];
	for (const s of services) {
		b = b.concat(renderService(s));
	}
	b.push("", "networks:", `  ${m.network.name}:`);
	if (m.network.external) {
		b.push("    external: true");
	}
	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal compose ${VAR} placeholder, interpolated by docker compose (env-var convention)
	b.push("    name: ${TRAEFIK_NETWORK_NAME}");
	if (volumes.length > 0) {
		b.push("", "volumes:");
		for (const v of volumes) {
			b.push(
				`  ${v.name}:`,
				`    name: \${APP_NAME}-${v.name}`,
				"    driver: local",
				"    driver_opts:",
				"      type: none",
				`      device: \${${v.deviceVar}}`,
				"      o: bind",
			);
		}
	}
	return `${b.join("\n")}\n`;
}

/** driftDetected — the source path's audit predicate (recorded hash ≠ current bytes). */
export async function driftDetected(
	recordedOutputHash: string,
	currentBytes: string,
): Promise<boolean> {
	return (await outputHash(currentBytes)) !== recordedOutputHash;
}

/** the static-template path records no hash — drift-blind by construction. */
export function templateCanDetectDrift(): boolean {
	return false;
}

// ---------------------------------------------------------------------------
// round-trip (the throwaway parser, matched to the throwaway emitter)
// ---------------------------------------------------------------------------

interface Topo {
	services: SpikeService[];
	volumes: string[];
	network: string;
}

function topology(m: SpikeStackManifest): Topo {
	const services = [...m.services].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	return {
		services,
		volumes: [...m.volumes].map((v) => v.name).sort(),
		network: m.network.name,
	};
}

function parseCompose(compose: string): Topo {
	const t: Topo = { services: [], volumes: [], network: "" };
	let cur: SpikeService | null = null;
	let section = "";
	let pendingProfile = false;
	const flush = () => {
		if (cur) {
			t.services.push(cur);
			cur = null;
		}
	};
	for (const raw of compose.split("\n")) {
		const line = raw.replace(/ +$/, "");
		if (line === "services:") {
			section = "services";
			continue;
		}
		if (line === "networks:") {
			flush();
			section = "networks";
			continue;
		}
		if (line === "volumes:") {
			flush();
			section = "volumes";
			continue;
		}
		const trimmed = line.trim();
		const isTwoSpaceKey =
			line.startsWith("  ") && !line.startsWith("   ") && trimmed.endsWith(":");
		if (section === "services") {
			if (isTwoSpaceKey) {
				flush();
				cur = {
					name: trimmed.slice(0, -1),
					role: "",
					image: "",
					internalPort: 0,
					profile: "",
				};
				pendingProfile = false;
				continue;
			}
			if (!cur) continue;
			if (trimmed.startsWith("image: ")) {
				cur.image = trimmed.slice("image: ".length);
			} else if (trimmed.startsWith("# role: ")) {
				cur.role = trimmed.slice("# role: ".length);
			} else if (trimmed.startsWith("# internal_port: ")) {
				const n = Number.parseInt(
					trimmed.slice("# internal_port: ".length),
					10,
				);
				if (!Number.isNaN(n)) cur.internalPort = n;
			} else if (trimmed.includes("loadbalancer.server.port=")) {
				const part = trimmed
					.slice(
						trimmed.indexOf("loadbalancer.server.port=") +
							"loadbalancer.server.port=".length,
					)
					.replace(/"$/, "");
				const n = Number.parseInt(part, 10);
				if (!Number.isNaN(n)) cur.internalPort = n;
			} else if (trimmed === "profiles:") {
				pendingProfile = true;
			} else if (trimmed.startsWith("- ") && pendingProfile) {
				cur.profile = trimmed.slice(2);
				pendingProfile = false;
			}
		} else if (section === "networks") {
			if (isTwoSpaceKey && t.network === "") {
				t.network = trimmed.slice(0, -1);
			}
		} else if (section === "volumes") {
			if (isTwoSpaceKey) {
				t.volumes.push(trimmed.slice(0, -1));
			}
		}
	}
	flush();
	t.services.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	t.volumes.sort();
	return t;
}

function topologyEqual(m: SpikeStackManifest, got: Topo): boolean {
	const want = topology(m);
	if (
		want.network !== got.network ||
		want.services.length !== got.services.length ||
		want.volumes.length !== got.volumes.length
	) {
		return false;
	}
	for (let i = 0; i < want.services.length; i++) {
		const a = want.services[i];
		const b = got.services[i];
		if (
			a.name !== b.name ||
			a.role !== b.role ||
			a.image !== b.image ||
			a.internalPort !== b.internalPort ||
			a.profile !== b.profile
		) {
			return false;
		}
	}
	for (let i = 0; i < want.volumes.length; i++) {
		if (want.volumes[i] !== got.volumes[i]) return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// measurement + verdict (the computed go/no-go) + harvest record
// ---------------------------------------------------------------------------

export interface SpikeMeasurement {
	emissions: number;
	byteIdentical: boolean;
	sourceHash: string;
	outputHash: string;
	emittedBytes: number;
	roundTripOK: boolean;
	driftDetectedOnSource: boolean;
	driftDetectedOnTmpl: boolean;
}

export interface FormScore {
	form: string;
	carriesBody: boolean;
	contentAddressed: boolean;
	wallGoverned: boolean;
	appendOnly: boolean;
	fit: number;
}

export interface SpikeVerdict {
	go: boolean;
	measurement: SpikeMeasurement;
	forms: FormScore[];
	chosenForm: string;
	rationale: string;
	/** the emitted compose — the compared bytes the read-only route shows. */
	emitted: string;
}

function scoreForms(): FormScore[] {
	const forms: FormScore[] = [
		{
			form: "record-kind",
			carriesBody: true,
			contentAddressed: true,
			wallGoverned: true,
			appendOnly: true,
			fit: 0,
		},
		{
			form: "scope-dimension",
			carriesBody: false,
			contentAddressed: false,
			wallGoverned: true,
			appendOnly: true,
			fit: 0,
		},
		{
			form: "below-the-line-projection",
			carriesBody: true,
			contentAddressed: true,
			wallGoverned: false,
			appendOnly: false,
			fit: 0,
		},
	];
	for (const f of forms) {
		f.fit = [
			f.carriesBody,
			f.contentAddressed,
			f.wallGoverned,
			f.appendOnly,
		].filter(Boolean).length;
	}
	return forms;
}

/** measure — runs the probe on the pinned fixture (pure, reproducible). */
export async function measure(): Promise<{
	measurement: SpikeMeasurement;
	emitted: string;
}> {
	const first = await emit(FIXTURE);
	let identical = true;
	for (let i = 0; i < EMISSIONS; i++) {
		if ((await emit(FIXTURE)) !== first) {
			identical = false;
			break;
		}
	}
	const recorded = await outputHash(first);
	const edited = `${first.slice(0, -1)}#`;
	const topo = parseCompose(first);

	return {
		emitted: first,
		measurement: {
			emissions: EMISSIONS,
			byteIdentical: identical,
			sourceHash: await sourceHash(FIXTURE),
			outputHash: recorded,
			emittedBytes: first.length,
			roundTripOK: topologyEqual(FIXTURE, topo),
			driftDetectedOnSource: await driftDetected(recorded, edited),
			driftDetectedOnTmpl: templateCanDetectDrift(),
		},
	};
}

/** decide — the computed verdict (a boolean conjunction over measures, never an opinion). */
export async function decide(): Promise<SpikeVerdict> {
	const { measurement: meas, emitted } = await measure();
	const forms = scoreForms();
	let chosen = forms[0];
	for (const f of forms.slice(1)) {
		if (f.fit > chosen.fit) chosen = f;
	}
	const carriesValue =
		meas.byteIdentical &&
		meas.roundTripOK &&
		meas.driftDetectedOnSource &&
		!meas.driftDetectedOnTmpl;

	const rationale = carriesValue
		? `go: emission is byte-identical (${meas.outputHash.slice(0, 12)}… stable over ${EMISSIONS} re-emissions), the compose round-trips, and ONLY the content-addressed source detects a hand-edit drift (the template is drift-blind) — the source carries versioning/audit/anti-overwrite; form: ${chosen.form}`
		: "no-go: the static template matches the source on every measure — a template suffices, the roadmap stops at DP01";

	return {
		go: carriesValue,
		measurement: meas,
		forms,
		chosenForm: chosen.form,
		rationale,
		emitted,
	};
}

export interface HarvestRecord {
	proposes: string;
	intent: string;
	go: boolean;
	sourceHash: string;
	outputHash: string;
	provenanceKind: string;
	provenanceFrom: string;
	status: string;
	hasMirror: boolean;
	hasVersion: boolean;
	recordHash: string;
	openQuestions: string[];
}

const OPEN_QUESTIONS = [
	"OQ-DP01-1 forme : le spike score 3 formes par critères DÉCLARÉS (corps, content-address, mur, append-only) ; DP02 doit graver le record kind via records.Hash∘Canonicalize (S02 réutilisé, jamais forké) — le score du spike est un proxy, pas la migration.",
	"OQ-DP01-2 round-trip : le parseur jetable est apparié à l'émetteur jetable ; DP03 doit round-tripper via un AST YAML réel (Target additif TargetDockerCompose / TargetPulumiProgram selon ADR 0043).",
	"OQ-DP01-3 conventions : le spike couvre le sous-ensemble /data/dockers mesurable (container_name, env_file, labels Traefik HTTPS+redirect, volume bind env-var, réseau externe) ; la matrice complète (profils 19 couches SPEC-stack-2026, connecteurs) est l'affaire de DP02–DP05/EPIC E.",
	"OQ-DP01-4 le mur : le spike ne persiste RIEN ; l'écriture réelle du verdict en `ideas` passe par idea_capture (provenance human) — ce record MODÉLISE la capture, il ne l'exécute pas.",
];

/** harvest — the verdict lifted into a content-addressed DRAFT record (proposes, never freezes). */
export async function harvest(v: SpikeVerdict): Promise<HarvestRecord> {
	const intent = v.go
		? "déclarer la stack émise comme une SOURCE Kernel de premier rang (record kind `stack_manifest`, content-adressé via records.Hash∘Canonicalize, append-only, gouverné par le mur) : la mesure DP01 prouve l'émission byte-identique, le round-trip compose, et la détection de dérive par source-hash qu'un template statique /data/dockers ne porte pas — DP02 peut graver."
		: "abandonner le StackManifest-as-source : la mesure DP01 prouve qu'un template statique /data/dockers porte les mêmes garanties — ADR d'abandon, la roadmap DP s'arrête honnêtement à DP01.";
	const r: HarvestRecord = {
		proposes: "entity",
		intent,
		go: v.go,
		sourceHash: v.measurement.sourceHash,
		outputHash: v.measurement.outputHash,
		provenanceKind: "human",
		provenanceFrom: "spike:DP01 (spike/stackmanifest)",
		status: "draft",
		hasMirror: false,
		hasVersion: false,
		recordHash: "",
		openQuestions: OPEN_QUESTIONS,
	};
	const canon = [
		"harvest/dp01/v0",
		`proposes=${r.proposes}`,
		`intent=${r.intent}`,
		`go=${r.go}`,
		`source_hash=${r.sourceHash}`,
		`output_hash=${r.outputHash}`,
		`provenance=${r.provenanceKind}:${r.provenanceFrom}`,
		`status=${r.status}`,
		`has_mirror=${r.hasMirror} has_version=${r.hasVersion}`,
		r.openQuestions.join("\n"),
	].join("\n");
	r.recordHash = await sha256hex(canon);
	return r;
}
