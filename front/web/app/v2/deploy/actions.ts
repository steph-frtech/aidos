"use server";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Item 2 (utilisatrice, 2026-06-14) — le bouton « Déployer » de /v2 lance un VRAI déploiement PULUMI
 * PAR PROJET : `aidospulumi up --project X --env dev --entities <fichier>` (l'exécuteur item 1, qui lance
 * `aidosappemit` pour X puis `pulumi up` avec les montages schéma/entités + APP_NAME=X). Un clic = la
 * full-stack réelle de X (ses PROPRES entités) déployée par Pulumi, à `X-dev.sagedesk.fr`. PULUMI reste
 * LE moteur (il monte les conteneurs). Calque deployStack (/ai-lab) — le MÊME pattern execFileP go.
 *
 * LE MUR (§2) : l'action de déploiement = un geste GATÉ side-effectant (execFile `aidospulumi up`),
 * elle n'écrit AUCUNE vérité. Les entités de X viennent de la projection PURE `emitApp(state)` /
 * `entityToSource(entity)` côté écran ; cette action ne fait que les MATÉRIALISER dans un fichier temp
 * et lancer l'exécuteur. La porte de validation humaine DP28 reste en amont du staging (dev par défaut).
 *
 * DÉTERMINISME-FIRST (§6/§8) : aucun LLM n'entre ici — `project` et les arguments ne passent JAMAIS par
 * un shell (execFile, pas exec/shell) ; le JSON `UpResult` de l'exécuteur est parsé tel quel. La sortie
 * « live » (URL + conteneurs) est la vérité de l'exécuteur, jamais devinée.
 */

/** Le dépôt qui porte le module Go + `.deploy-pulumi/` (cwd back/ pour `go run`). Overridable. */
const APP_REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

/** Un conteneur du stack déployé : son nom (préfixé du stack `<project>-<env>-…`). */
export interface PulumiContainer {
	readonly name: string;
}

/** Le résultat du déploiement Pulumi par projet : le statut, l'URL live, les conteneurs, le détail. */
export interface PulumiDeployResult {
	readonly status: "up" | "error";
	/** L'URL live Traefik que l'exécuteur pinne (`https://<project>-<env>.sagedesk.fr`), ou null sur erreur. */
	readonly url: string | null;
	/** Les conteneurs du stack déployé (`<stack>-app`, `<stack>-db`), ou vide sur erreur. */
	readonly containers: readonly PulumiContainer[];
	/** L'identité du stack `<project>-<env>` (ou vide). */
	readonly stack: string;
	/** Le détail humain (la ligne de commande lancée, ou l'erreur actionnable tronquée). */
	readonly detail: string;
}

/** La forme JSON `UpResult` que `aidospulumi up` imprime sur stdout (le contrat de l'item 1). */
interface UpResultJSON {
	status?: string;
	stack?: string;
	dir?: string;
	url?: string;
	containers?: string[];
}

/**
 * deployStackPulumi — le VRAI déploiement Pulumi PAR PROJET. (1) écrit les entités de X (la projection
 * pure `[]EntitySource`) dans un fichier temp ; (2) exécute `go run ./cmd/aidospulumi up --project <X>
 * --env dev --entities <tmp>` (cwd back/, GOTOOLCHAIN=auto, args JAMAIS via shell) ; (3) parse le JSON
 * `UpResult{url, containers, stack}`. Renvoie {url, containers, status, stack, detail}. Toute panne →
 * status "error" + détail actionnable (jamais une exception opaque, jamais une URL devinée). Le fichier
 * temp est nettoyé dans un `finally`. Le mur (§2) : un geste side-effectant gaté, aucune écriture-vérité.
 */
export async function deployStackPulumi(
	project: string,
	entitiesJSON: string,
): Promise<PulumiDeployResult> {
	const cleanProject = project.trim();
	if (cleanProject === "") {
		return {
			status: "error",
			url: null,
			containers: [],
			stack: "",
			detail: "projet vide — impossible de déployer (un projet est requis)",
		};
	}

	let dir = "";
	try {
		dir = await mkdtemp(join(tmpdir(), "aidos-pulumi-"));
		const entitiesFile = join(dir, "entities.json");
		await writeFile(entitiesFile, entitiesJSON, "utf8");

		const { stdout } = await execFileP(
			"go",
			[
				"run",
				"./cmd/aidospulumi",
				"up",
				"--project",
				cleanProject,
				"--env",
				"dev",
				"--entities",
				entitiesFile,
			],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 300_000,
				maxBuffer: 16 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: "auto" },
			},
		);

		const res = JSON.parse(stdout) as UpResultJSON;
		const containers = (res.containers ?? []).map((name) => ({ name }));
		return {
			status: res.status === "up" ? "up" : "error",
			url: typeof res.url === "string" && res.url !== "" ? res.url : null,
			containers,
			stack: res.stack ?? `${cleanProject}-dev`,
			detail: `aidospulumi up --project ${cleanProject} --env dev (Pulumi)`,
		};
	} catch (e) {
		return {
			status: "error",
			url: null,
			containers: [],
			stack: `${cleanProject}-dev`,
			detail: String(e).slice(0, 300),
		};
	} finally {
		if (dir !== "") {
			await rm(dir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
