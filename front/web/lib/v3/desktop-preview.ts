/**
 * « Voir Electron » — LE DÉCODEUR DE LA SORTIE MOTEUR (ADR 0093, capacité « voir Electron »).
 *
 * Le MOTEUR Go (back/mcp/desktop-preview) émet l'enfant desktop Electron, sait le booter (headless
 * Xvfb) et capturer sa fenêtre via CDP. Ses DEUX sorties one-shot sont du JSON :
 *   - `-children` → {project, master_hash, children:[{target, parent_id, artifacts[]}]} (PUR) ;
 *   - `-capture <out>` → écrit UNE frame JPEG + imprime `OK <octets> <W>x<H> <bundleHash>` (E/S gatée).
 *
 * RÉUTILISE, NE RÉINVENTE PAS (CLAUDE.md §6 / ADR 0092). Le moteur est la SOURCE : ce module ne
 * ré-émet RIEN, ne réimplémente AUCUNE logique d'émission. Il ne fait qu'une chose — DÉCODER, de
 * façon DÉTERMINISTE & TOTALE & SANS LLM, le texte que le binaire imprime vers la forme typée que
 * la lentille rend. La server action (app/v3/emetteurs/desktop-actions.ts) execFile le binaire ;
 * elle passe sa sortie à CES décodeurs purs. Le code juge ; l'agent n'entre jamais.
 *
 * DÉTERMINISME-FIRST (§6/§8). decodeDesktopChildren et parseCaptureLine sont des fonctions PURES :
 * même entrée → même sortie, pas d'horloge, pas d'aléa, pas d'E/S. Fail-closed : un JSON malformé,
 * un champ manquant, un type inattendu → un verdict d'échec typé (jamais un throw, jamais une forme
 * inventée). Le miroir de reproductibilité (desktop-preview.test.ts) épingle le décodage d'un
 * échantillon réel + le refus du bruit. La capture LIVE (le pixel) est couverte par le miroir
 * MOTEUR (back/runtime/desktoppreview/runner_electronlive_test.go) — ici on ne décode que sa LIGNE.
 *
 * LE MUR (§2). Ce module LIT une projection (les enfants émis, la frame) et la TYPE ; il n'écrit
 * AUCUNE vérité. Les enfants/artefacts/frame sont des projections below-the-line. Modifier une
 * source PROPOSE → idée → /goal, jamais une écriture depuis l'écran.
 */

/** Les trois cibles d'enfant que le moteur émet depuis la maître (le jeu clos, ADR 0093). */
export type DesktopTarget = "web-app" | "mobile-app" | "desktop-app";

const TARGETS: readonly DesktopTarget[] = [
	"web-app",
	"mobile-app",
	"desktop-app",
];

/** Un enfant émis : sa cible, l'adresse-contenu de la maître parente, ses chemins d'artefacts. */
export interface DesktopChild {
	readonly target: DesktopTarget;
	readonly parentId: string;
	readonly artifacts: readonly string[];
}

/** La forme décodée de `-children` : le projet, la maître content-adressée, ses trois enfants. */
export interface DesktopChildren {
	readonly project: string;
	readonly masterHash: string;
	readonly children: readonly DesktopChild[];
}

/** Le verdict du décodage de `-children` : la forme typée, ou une raison d'échec (fail-closed). */
export type DecodeChildrenResult =
	| { readonly ok: true; readonly value: DesktopChildren }
	| { readonly ok: false; readonly reason: string };

function isTarget(v: unknown): v is DesktopTarget {
	return typeof v === "string" && (TARGETS as readonly string[]).includes(v);
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * decodeDesktopChildren — DÉCODE le JSON `-children` du moteur vers la forme typée. PUR & TOTAL :
 * un JSON invalide, un champ absent, une cible hors-jeu → {ok:false, reason} (jamais un throw). Les
 * clés snake_case du moteur (master_hash, parent_id) sont mappées vers le camelCase du front. Aucune
 * logique d'émission — un simple parse + une validation de forme fail-closed.
 */
export function decodeDesktopChildren(raw: string): DecodeChildrenResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: "sortie -children non-JSON" };
	}
	if (parsed === null || typeof parsed !== "object") {
		return { ok: false, reason: "racine -children non-objet" };
	}
	const o = parsed as {
		project?: unknown;
		master_hash?: unknown;
		children?: unknown;
	};
	if (typeof o.project !== "string" || o.project === "") {
		return { ok: false, reason: "project absent ou vide" };
	}
	if (typeof o.master_hash !== "string" || o.master_hash === "") {
		return { ok: false, reason: "master_hash absent ou vide" };
	}
	if (!Array.isArray(o.children)) {
		return { ok: false, reason: "children absent ou non-tableau" };
	}
	const children: DesktopChild[] = [];
	for (const c of o.children) {
		if (c === null || typeof c !== "object") {
			return { ok: false, reason: "enfant non-objet" };
		}
		const cc = c as {
			target?: unknown;
			parent_id?: unknown;
			artifacts?: unknown;
		};
		if (!isTarget(cc.target)) {
			return { ok: false, reason: "cible d'enfant hors-jeu" };
		}
		if (typeof cc.parent_id !== "string" || cc.parent_id === "") {
			return { ok: false, reason: "parent_id absent ou vide" };
		}
		if (!isStringArray(cc.artifacts)) {
			return {
				ok: false,
				reason: "artifacts absent ou non-tableau-de-chaînes",
			};
		}
		children.push({
			target: cc.target,
			parentId: cc.parent_id,
			artifacts: cc.artifacts,
		});
	}
	return {
		ok: true,
		value: { project: o.project, masterHash: o.master_hash, children },
	};
}

/** La capture décodée depuis la ligne `OK <octets> <W>x<H> <bundleHash>` imprimée par `-capture`. */
export interface CaptureLine {
	readonly bytes: number;
	readonly width: number;
	readonly height: number;
	readonly bundleHash: string;
}

/**
 * parseCaptureLine — DÉCODE la ligne stdout de `-capture` (`OK <octets> <W>x<H> <bundleHash>`) en
 * dimensions + empreinte. PUR & TOTAL : aucune ligne `OK …` bien formée → null (l'appelant retombe
 * sur les seules dimensions de l'image, non bloquant). Les octets ne servent qu'à recouper la taille
 * du JPEG lu par l'appelant ; l'autorité du pixel reste le fichier capturé.
 */
export function parseCaptureLine(stdout: string): CaptureLine | null {
	for (const line of stdout.split("\n")) {
		const f = line.trim().split(/\s+/);
		if (f.length === 4 && f[0] === "OK") {
			const bytes = Number.parseInt(f[1] ?? "", 10);
			const dims = (f[2] ?? "").split("x");
			const width = Number.parseInt(dims[0] ?? "", 10);
			const height = Number.parseInt(dims[1] ?? "", 10);
			const bundleHash = f[3] ?? "";
			if (
				Number.isFinite(bytes) &&
				Number.isFinite(width) &&
				Number.isFinite(height) &&
				bundleHash !== ""
			) {
				return { bytes, width, height, bundleHash };
			}
		}
	}
	return null;
}
