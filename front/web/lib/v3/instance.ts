/**
 * V3 — le TWIN de la CONFIG D'INSTANCE (ADR 0062) : « paramétrer toutes les infos
 * de l'instance (BDD, monitoring…) — on pourrait paramétrer dans le cloud ». Le jeu
 * d'OUTILS est DÉCLARÉ et clos (un outil = une clé + un libellé + une URL par
 * défaut) ; la config persistée est un aller-retour SANS PERTE, fail-closed (du
 * bruit → les défauts — jamais une invention). La couche impure (action serveur)
 * lit/écrit le fichier ; ce twin ne fait que déclarer/parser. Miroir : instance.test.ts.
 */

/** Un OUTIL d'instance déclaré : la clé de config + le libellé i18n + le défaut. */
export interface InstanceTool {
	readonly key: string;
	readonly labelKey: string;
	/** L'URL par défaut de CETTE instance (surchargée par la config persistée). */
	readonly defaultUrl: string;
	/** L'outil se sonde-t-il en HTTP (la tuile de statut) ? */
	readonly probe: boolean;
}

/** LE JEU DÉCLARÉ — étendre l'instance = déclarer un outil ici (une donnée). */
export const INSTANCE_TOOLS: readonly InstanceTool[] = [
	{
		key: "workbench",
		labelKey: "instWorkbench",
		defaultUrl: "https://aidos.sagedesk.fr",
		probe: true,
	},
	{
		key: "db",
		labelKey: "instDb",
		defaultUrl: "postgres://localhost:5432/aidos",
		probe: false,
	},
	{
		key: "monitoring",
		labelKey: "instMonitoring",
		defaultUrl: "",
		probe: true,
	},
	{
		key: "traefik",
		labelKey: "instTraefik",
		defaultUrl: "http://172.17.0.1:8080",
		probe: true,
	},
	{
		key: "vscode",
		labelKey: "instVscode",
		defaultUrl: "https://vscode.sagedesk.fr",
		probe: true,
	},
	{
		key: "docs",
		labelKey: "instDocs",
		defaultUrl: "https://aidos.mintlify.app",
		probe: true,
	},
	{
		key: "shop",
		labelKey: "instShop",
		defaultUrl: "https://alphashop.sagedesk.fr",
		probe: true,
	},
] as const;

export type InstanceConfig = Readonly<Record<string, string>>;

/** Les défauts déclarés (clé → URL par défaut). */
export function defaultInstanceConfig(): InstanceConfig {
	return Object.fromEntries(INSTANCE_TOOLS.map((t) => [t.key, t.defaultUrl]));
}

/** SÉRIALISE la config (JSON canonique indenté). */
export function serializeInstanceConfig(c: InstanceConfig): string {
	return `${JSON.stringify(c, null, "\t")}\n`;
}

/**
 * PARSE la config — TOTAL & FAIL-CLOSED : toute forme inattendue → LES DÉFAUTS ;
 * une valeur non-textuelle invalide TOUT (jamais une config moitié-inventée) ;
 * les clés inconnues sont ignorées, les absentes complétées par les défauts.
 */
export function parseInstanceConfig(raw: string): InstanceConfig {
	const defaults = defaultInstanceConfig();
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return defaults;
	}
	if (typeof v !== "object" || v === null || Array.isArray(v)) return defaults;
	const o = v as Record<string, unknown>;
	const out: Record<string, string> = { ...defaults };
	for (const t of INSTANCE_TOOLS) {
		const val = o[t.key];
		if (val !== undefined && typeof val !== "string") return defaults;
		if (typeof val === "string") out[t.key] = val;
	}
	// L'échelle (`ladder`) et les surcharges de stack (`stack.<service>`) — textuelles.
	if (o.ladder !== undefined) {
		if (typeof o.ladder !== "string") return defaults;
		out.ladder = o.ladder;
	}
	for (const [k, v] of Object.entries(o)) {
		if (!k.startsWith("stack.")) continue;
		if (typeof v !== "string") return defaults;
		out[k] = v;
	}
	return out;
}

// ── L'ÉCHELLE PARAMÉTRABLE + LA STACK PAR ENVIRONNEMENT (DP14, ADR 0062 add.) ──

/** L'échelle par défaut (déclarée) — surchargée par la config (`ladder`, CSV). */
export const DEFAULT_LADDER: readonly string[] = ["dev", "staging", "prod"];

/**
 * L'ÉCHELLE configurée de l'instance : la clé `ladder` (CSV ordonné, ex.
 * « dev, preprod, prod »). FAIL-CLOSED : vide/bruit → l'échelle par défaut —
 * jamais une échelle vide ou inventée. Le nombre d'environnements est une
 * DONNÉE de l'instance, plus jamais une constante de code.
 */
export function ladderOf(cfg: InstanceConfig): readonly string[] {
	const raw = cfg.ladder ?? "";
	const envs = raw
		.split(",")
		.map((e) =>
			e
				.trim()
				.normalize("NFD")
				.replace(/[̀-ͯ]/g, "")
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, ""),
		)
		.filter((e) => e.length > 0);
	return envs.length > 0 ? [...new Set(envs)] : DEFAULT_LADDER;
}

/** Un SERVICE de la stack d'un environnement — le substrat déclaré (DP14). */
export interface StackService {
	readonly key: string;
	readonly labelKey: string;
	/** Le motif d'URL (%env% substitué) — vide = non provisionné sur cette instance. */
	readonly urlPattern: string;
	/** Le motif spécifique PROD (ex. ADR 0006 : Postgres en prod, Doltgres en non-prod). */
	readonly prodPattern?: string;
	/** Le niveau de la spec stack-2026 : 1 = core prod, 2 = activable, 3 = hors prod/option. */
	readonly level: 1 | 2 | 3;
}

/**
 * LA STACK DÉCLARÉE PAR ENVIRONNEMENT — la palette substrat DP14/DP30 :
 * l'app émise, sa donnée (Doltgres non-prod / Postgres prod — ADR 0006), la
 * télémétrie (OTel→Postgres, lecteur S/MCP telemetry-reader), les docs de
 * L'APP ÉMISE (Fumadocs + Scalar + Pagefind — DP30, distinct du Mintlify
 * d'AIDOS), l'auth (Better-Auth), le bus (NATS), les workflows (Windmill),
 * les erreurs (GlitchTip). Étendre la stack = déclarer un service ici.
 */
export const STACK_SERVICES: readonly StackService[] = [
	{
		key: "app",
		labelKey: "stackApp",
		urlPattern: "https://app-%env%.sagedesk.fr",
		level: 1,
	},
	{
		key: "api",
		labelKey: "stackApi",
		urlPattern: "http://api-hono-%env%:3001",
		level: 1,
	},
	{
		key: "db",
		labelKey: "stackDb",
		urlPattern: "doltgres://172.17.0.1:5433/%env%",
		prodPattern: "postgres://localhost:5432/app_prod",
		level: 1,
	},
	{
		key: "cache",
		labelKey: "stackCache",
		urlPattern: "redis://valkey-%env%:6379",
		level: 1,
	},
	{
		key: "workflows",
		labelKey: "stackWorkflows",
		urlPattern: "http://windmill:8000",
		level: 1,
	},
	{
		key: "bus",
		labelKey: "stackBus",
		urlPattern: "nats://nats:4222",
		level: 1,
	},
	{
		key: "telemetry",
		labelKey: "stackTelemetry",
		urlPattern: "http://opentelemetry-collector:4318",
		level: 1,
	},
	{
		key: "docs",
		labelKey: "stackDocs",
		urlPattern: "https://docs-%env%.sagedesk.fr",
		level: 1,
	},
	{
		key: "auth",
		labelKey: "stackAuth",
		urlPattern: "https://auth.sagedesk.fr",
		level: 1,
	},
	{ key: "errors", labelKey: "stackErrors", urlPattern: "", level: 2 },
	{ key: "tickets", labelKey: "stackTickets", urlPattern: "", level: 2 },
	{ key: "git", labelKey: "stackGit", urlPattern: "", level: 2 },
	{
		key: "connectors",
		labelKey: "stackConnectors",
		urlPattern: "http://mcp-gateway:3000",
		level: 2,
	},
] as const;

/** Une ligne de stack résolue pour UN environnement. */
export interface EnvStackEntry {
	readonly key: string;
	readonly labelKey: string;
	readonly url: string;
}

/**
 * LA STACK D'UN ENVIRONNEMENT — résolue depuis les motifs déclarés (la config
 * peut surcharger chaque motif via la clé `stack.<service>`). %env% substitué ;
 * la prod prend le motif prod s'il existe (ADR 0006). PURE & TOTALE & DÉTERMINISTE.
 */
export function envStackOf(env: string, cfg: InstanceConfig): EnvStackEntry[] {
	return STACK_SERVICES.map((s) => {
		const override = cfg[`stack.${s.key}`];
		const pattern =
			override !== undefined && override !== ""
				? override
				: env === "prod" && s.prodPattern !== undefined
					? s.prodPattern
					: s.urlPattern;
		return {
			key: s.key,
			labelKey: s.labelKey,
			url: pattern.replaceAll("%env%", env),
		};
	});
}
