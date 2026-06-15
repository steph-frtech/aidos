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
const PULUMI_BUILD = `${REPO}/.claude/scripts/aidospulumi-build.sh`;

/**
 * ADR 0077 — REBUILD DÉTERMINISTE avant déploiement. Le binaire de déploiement DOIT être
 * une fonction pure de ses sources (determinism-first §8) ; sans ce rebuild, un changement
 * d'émetteur (mêmes specs) laisserait tourner un binaire périmé. On recompile AVANT chaque
 * `up` (go build caché → quasi-instantané si inchangé). Verdict :
 *   - "ok"     → binaire frais, on déploie ;
 *   - "stale"  → les sources ne compilent pas → on NE déploie PAS un binaire périmé ;
 *   - "absent" → script de build absent (infra) → repli sur le binaire existant (best-effort).
 */
async function ensureFreshPulumiBin(): Promise<{
	state: "ok" | "stale" | "absent";
	detail: string;
}> {
	try {
		const { stdout } = await execFileP("bash", [PULUMI_BUILD], {
			cwd: REPO,
			timeout: 180_000,
			maxBuffer: 8 * 1024 * 1024,
		});
		return { state: "ok", detail: stdout.trim() };
	} catch (e) {
		const msg = String((e as { stderr?: string }).stderr ?? e);
		// Script absent (ENOENT) → repli gouverné sur le binaire existant ; sinon les
		// sources ne compilent pas → binaire périmé refusé (honnêteté determinism-first).
		if (msg.includes("ENOENT") || msg.includes("No such file")) {
			return { state: "absent", detail: "build script absent" };
		}
		return { state: "stale", detail: msg.slice(0, 300) };
	}
}

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
	const names = entityNames.length > 0 ? entityNames.slice(0, 12) : ["Page"];
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
	// Les ScreenOverride capturés dans le Design Lab (ADR 0071) : passés à --screen-design pour
	// que les adaptations validées (ex bg=rouge) soient REPRODUITES sur l'app — la permanence.
	screenOverrides: readonly unknown[] = [],
): Promise<DeployStackResult> {
	const slug = slugify(projectSlug);
	if (slug === "") {
		return { ok: false, url: null, detail: "projet sans nom", containers: [] };
	}
	const url = `https://${slug}-${env}.sagedesk.fr`;
	const file = `/tmp/${slug}-${env}-entities.json`;
	try {
		// ADR 0077 — rebuild déterministe : jamais déployer un binaire périmé. Sources
		// cassées → on refuse (le binaire ne refléterait plus le code courant).
		const fresh = await ensureFreshPulumiBin();
		if (fresh.state === "stale") {
			return {
				ok: false,
				url: null,
				detail: `rebuild aidospulumi échoué (sources non compilables) — déploiement refusé pour ne pas servir un binaire périmé : ${fresh.detail}`,
				containers: [],
			};
		}
		await writeFile(file, entitiesPayload(entityNames), "utf8");
		const args = [
			"up",
			"--hono",
			"--project",
			slug,
			"--env",
			env,
			"--entities",
			file,
		];
		// Les consignes d'apparence capturées → un fichier --screen-design ; le compilateur (aidospulumi)
		// émet la vue web ADAPTÉE (EmitWebChildAdapted) → l'adaptation survit au redéploiement.
		if (screenOverrides.length > 0) {
			const designFile = `/tmp/${slug}-${env}-screen-design.json`;
			await writeFile(designFile, JSON.stringify(screenOverrides), "utf8");
			args.push("--screen-design", designFile);
		}
		const { stdout } = await execFileP(PULUMI_BIN, args, {
			cwd: REPO,
			timeout: 300_000,
			maxBuffer: 16 * 1024 * 1024,
		});
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
