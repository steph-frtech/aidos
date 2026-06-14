"use server";

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Le VRAI déploiement PAR PROJET (ADR 0040/0043, piste DP) : l'outil `aidospulumi up --hono`
 * émet l'app DU PROJET depuis ses specs (entités → schéma + serveur Hono + 3 vues enfants) et
 * monte SA stack Docker dédiée (server + interpreter + db) derrière `<slug>-dev.sagedesk.fr`.
 *
 * Remplace l'ancien `deployStack` (une stack FIXE renvoyant toujours alphashop.sagedesk.fr) :
 * chaque projet a SA full-stack, déployée à part. LE MUR §2 : une projection below-the-line
 * (émettre + monter l'app émise), jamais une écriture de vérité. OpenQuestion (sécurité) : un
 * bouton public qui exec docker/pulumi — à gater (auth/rate-limit) avant exposition réelle.
 */

const PULUMI_BIN =
	process.env.AIDOS_PULUMI_BIN ||
	"/data/dev/aidos/.deploy-pulumi/aidospulumi-bin";
const REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

/** Le slug docker/Traefik-sûr (minuscule, alphanum + tirets) — la clé de stack par projet. */
function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/** Extrait l'objet JSON d'une sortie qui peut porter du log avant. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/**
 * Le builder v3 capture des NOMS d'entité (pas de champs) : on dote chaque entité de champs
 * par défaut RÉELS (le type est du jeu clos des générateurs : text/timestamptz) pour que l'app
 * émise soit une VRAIE app (schéma + API + vue), jamais inventée au-delà du nom déclaré. Sans
 * aucune entité (projet neuf), une entité « Page » minimale tient la stack debout.
 */
function entitiesPayload(entityNames: readonly string[]): string {
	const names =
		entityNames.length > 0 ? entityNames.slice(0, 12) : ["Page"];
	const entities = names.map((raw) => {
		const name = raw.replace(/[^A-Za-z0-9]/g, "") || "Item";
		return {
			id: `e_${name}`,
			kind: "entity",
			name,
			fields: [
				{ name: "id", type: "text" },
				{ name: "title", type: "text" },
				{ name: "description", type: "text" },
				{ name: "created_at", type: "timestamptz" },
			],
		};
	});
	return JSON.stringify(entities);
}

/**
 * provisionStatusAction — l'app du projet répond-elle en `<env>` ? (un GET /healthz, court).
 * Le banner « votre stack se monte… » poll ceci jusqu'à `up:true` (la stack est montée).
 */
export async function provisionStatusAction(
	projectSlug: string,
	env = "dev",
): Promise<{ up: boolean; url: string }> {
	const slug = slugify(projectSlug);
	const url = `https://${slug}-${env}.sagedesk.fr`;
	if (slug === "") return { up: false, url };
	try {
		const { stdout } = await execFileP(
			"curl",
			[
				"-s",
				"-k",
				"-o",
				"/dev/null",
				"-w",
				"%{http_code}",
				"--max-time",
				"4",
				`${url}/healthz`,
			],
			{ timeout: 6000 },
		);
		return { up: stdout.trim() === "200", url };
	} catch {
		return { up: false, url };
	}
}

export type DeployStackResult = {
	ok: boolean;
	url: string | null;
	detail: string;
	containers: string[];
};

/**
 * deployProjectStackAction — monte (ou met à jour) la stack RÉELLE du projet : écrit ses entités,
 * lance `aidospulumi up --hono --project <slug> --env <env>`, renvoie l'URL live + les conteneurs.
 * Toute panne → ok:false (la note s'affiche, rien ne casse). Idempotent (Pulumi réconcilie).
 */
export async function deployProjectStackAction(
	projectSlug: string,
	entityNames: readonly string[],
	env = "dev",
): Promise<DeployStackResult> {
	const slug = slugify(projectSlug);
	if (slug === "") {
		return { ok: false, url: null, detail: "projet sans nom", containers: [] };
	}
	const url = `https://${slug}-${env}.sagedesk.fr`;
	const file = `/tmp/${slug}-${env}-entities.json`;
	try {
		await writeFile(file, entitiesPayload(entityNames), "utf8");
		const { stdout } = await execFileP(
			PULUMI_BIN,
			[
				"up",
				"--hono",
				"--project",
				slug,
				"--env",
				env,
				"--entities",
				file,
			],
			{ cwd: REPO, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 },
		);
		const parsed = JSON.parse(extractJson(stdout) || "{}") as {
			status?: string;
			url?: string;
			containers?: string[];
		};
		return {
			ok: parsed.status === "up",
			url: parsed.url ?? url,
			detail:
				parsed.status === "up"
					? `stack montée : ${(parsed.containers ?? []).join(", ")}`
					: "déploiement incomplet",
			containers: parsed.containers ?? [],
		};
	} catch (e) {
		return { ok: false, url, detail: String(e).slice(0, 300), containers: [] };
	}
}
