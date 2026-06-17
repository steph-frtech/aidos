"use server";

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	type DesktopChildren,
	decodeDesktopChildren,
	parseCaptureLine,
} from "@/lib/v3/desktop-preview";

const execFileP = promisify(execFile);

/**
 * /v3/emetteurs — APERÇU DESKTOP (Electron) : la capacité « voir Electron » (ADR 0093) câblée dans
 * la lentille émetteurs. Ces server actions execFile le BINAIRE MOTEUR (back/mcp/desktop-preview) —
 * jamais une réimplémentation TS de l'émission (le MOTEUR Go est la source, ADR 0092). C'est le MÊME
 * précédent prouvé que app/v3/design/actions.ts et environnements/deploy-actions.ts : un binaire
 * AIDOS_*_BIN, execFile (node:child_process + promisify), cwd = la racine du repo.
 *
 * DEUX portes one-shot du moteur :
 *   - `-children` → {project, master_hash, children[]} (PUR) : les 3 enfants émis de la maître démo ;
 *   - `-capture <tmp>` → écrit UNE frame JPEG + imprime `OK <octets> <W>x<H> <bundleHash>` (E/S gatée,
 *     boote l'enfant desktop Electron headless sous Xvfb via CDP). Exit 3 = pas de toolchain/affichage
 *     → fallback GRACIEUX (jamais un throw — ADR 0074 : la vue ne casse pas, elle montre les fichiers).
 *
 * LE MUR (§2). Ces actions LISENT une projection (les enfants émis, la frame) et la RENDENT ; elles
 * n'écrivent AUCUNE vérité. Le DÉCODAGE de la sortie moteur est délégué au décodeur PUR
 * lib/v3/desktop-preview (le code juge ; aucun LLM n'entre, §6/§8). Toute panne → un verdict typé.
 */

/** La racine du repo — le cwd du binaire (même précédent que design/actions.ts). */
const REPO_DIR = "/data/dev/aidos";

/**
 * Le binaire moteur « voir Electron ». Par défaut : back/bin/desktop-preview sous le repo (le chemin
 * où `cd back && go build -o bin/desktop-preview ./mcp/desktop-preview` écrit). Surchargeable via
 * AIDOS_DESKTOP_PREVIEW_BIN (le calque de AIDOS_*_BIN).
 */
const DESKTOP_PREVIEW_BIN =
	process.env.AIDOS_DESKTOP_PREVIEW_BIN ||
	join(REPO_DIR, "back", "bin", "desktop-preview");

/**
 * Le node_modules de la toolchain de capture (electron+esbuild+react, déjà installé, gitignoré). Le
 * moteur le lit via AIDOS_DESKTOP_PREVIEW_NM ; on le pointe par défaut sur le .toolchain du runtime.
 */
const DESKTOP_PREVIEW_NM =
	process.env.AIDOS_DESKTOP_PREVIEW_NM ||
	join(
		REPO_DIR,
		"back",
		"runtime",
		"desktoppreview",
		".toolchain",
		"node_modules",
	);

/** Le verdict de getDesktopChildren : les 3 enfants décodés, ou une raison d'échec (jamais un throw). */
export type DesktopChildrenResult =
	| { readonly ok: true; readonly children: DesktopChildren }
	| { readonly ok: false; readonly reason: string };

/**
 * getDesktopChildren — execFile `desktop-preview -children`, puis DÉCODE sa sortie via le décodeur
 * pur (le code juge). PUR côté moteur : pas d'E/S lourde, ~instantané. Toute panne (binaire absent,
 * sortie illisible) → {ok:false, reason} — la vue retombe gracieusement, jamais un throw.
 */
export async function getDesktopChildren(): Promise<DesktopChildrenResult> {
	try {
		const { stdout } = await execFileP(DESKTOP_PREVIEW_BIN, ["-children"], {
			cwd: REPO_DIR,
			timeout: 30_000,
			maxBuffer: 8 * 1024 * 1024,
		});
		const decoded = decodeDesktopChildren(stdout);
		if (!decoded.ok) return { ok: false, reason: decoded.reason };
		return { ok: true, children: decoded.value };
	} catch {
		return { ok: false, reason: "binaire desktop-preview injoignable" };
	}
}

/** Le verdict de captureDesktopFrame : la frame disponible (data-url), ou l'indisponibilité (gracieux). */
export type DesktopFrameResult =
	| {
			readonly available: true;
			readonly dataUrl: string;
			readonly width: number;
			readonly height: number;
			readonly bundleHash: string;
	  }
	| { readonly available: false; readonly reason: string };

/**
 * captureDesktopFrame — boote l'enfant desktop Electron headless (Xvfb) et capture UNE frame de sa
 * fenêtre via CDP : execFile `desktop-preview -capture <tmp>`. Le moteur écrit le JPEG dans <tmp> et
 * imprime `OK <octets> <W>x<H> <bundleHash>`.
 *
 *   - exit 0 → on LIT le JPEG → data:image/jpeg;base64,… {available:true, dataUrl, width, height, bundleHash} ;
 *   - exit 3 → pas de toolchain/affichage → {available:false, reason} (GRACIEUX — ADR 0074, jamais un throw) ;
 *   - exit 1 / panne → {available:false, reason}.
 *
 * Le tmp est TOUJOURS nettoyé (finally). Le booter Electron prend ~3-5 s → timeout 60 s + maxBuffer
 * généreux. AIDOS_DESKTOP_PREVIEW_NM est passé au moteur (la toolchain de capture). DÉCODAGE de la
 * ligne OK délégué au décodeur pur (le code juge ; aucun LLM, §6/§8). LE MUR (§2) : lecture + rendu.
 */
export async function captureDesktopFrame(): Promise<DesktopFrameResult> {
	const dir = mkdtempSync(join(tmpdir(), "aidos-desktop-frame-"));
	const out = join(dir, "frame.jpg");
	try {
		const { stdout } = await execFileP(DESKTOP_PREVIEW_BIN, ["-capture", out], {
			cwd: REPO_DIR,
			timeout: 60_000,
			maxBuffer: 16 * 1024 * 1024,
			env: { ...process.env, AIDOS_DESKTOP_PREVIEW_NM: DESKTOP_PREVIEW_NM },
		});
		// exit 0 : le moteur a écrit une vraie frame + imprimé la ligne OK.
		const line = parseCaptureLine(stdout);
		const jpeg = readFileSync(out);
		if (jpeg.length === 0) {
			return { available: false, reason: "frame vide" };
		}
		return {
			available: true,
			dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
			width: line?.width ?? 0,
			height: line?.height ?? 0,
			bundleHash: line?.bundleHash ?? "",
		};
	} catch (err) {
		// execFile rejette sur exit ≠ 0. exit 3 = pas de toolchain/affichage → fallback GRACIEUX
		// (ADR 0074 : la vue ne casse jamais, elle montre l'arbre de fichiers du bundle). exit 1 = échec.
		const code =
			typeof (err as { code?: unknown })?.code === "number"
				? (err as { code: number }).code
				: -1;
		if (code === 3) {
			return {
				available: false,
				reason: "toolchain d'aperçu absente sur cet hôte (xvfb/electron)",
			};
		}
		return { available: false, reason: "échec de la capture de la fenêtre" };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
