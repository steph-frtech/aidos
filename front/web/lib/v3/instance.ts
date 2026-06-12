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
	return out;
}
