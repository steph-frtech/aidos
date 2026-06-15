"use server";

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { cookies } from "next/headers";
import postgres from "postgres";
import {
	canonicalBody,
	contentAddress,
	isValidSlug,
	newProject,
	type Project,
} from "@/lib/project";
import type { AppProjection } from "@/lib/v2/builder";
import { filesOf } from "@/lib/v3/emit-files";
import {
	classifyNewName,
	type ProjectRecord,
	parseProject,
	serializeProject,
	sortProjects,
} from "@/lib/v3/project";

/**
 * V3 — le MAGASIN DE PROJETS (la couche IMPURE du twin lib/v3/project, ADR 0061).
 *
 * « Créer une app crée un PROJET qu'on rouvre avec tout l'historique, partout,
 * même état. » Le magasin ne stocke que des fichiers JSON sérialisés par le twin
 * pur (serializeProject) ; ROUVRIR = parseProject puis REJOUER (turnsOf) — le
 * « même état partout » est une conséquence du rejeu déterministe déjà prouvé.
 *
 * IMPUR ICI, ET SEULEMENT ICI : Date.now() (savedAt) et le système de fichiers.
 * Tout le reste (sérialisation, parse fail-closed, slug, tri) reste dans le twin.
 * ESPRIT APPEND-ONLY : aucune suppression — on ajoute, on resauve, jamais on détruit.
 * LE MUR (§2) : un projet est un transcript de PROPOSITIONS — aucune écriture-vérité.
 *
 * ── ADR 0073 — POSTGRES EST LA SOURCE (le transcript fichier devient projection) ──────
 * Chaque projet V3 est aussi ENREGISTRÉ dans le truth-store Postgres `projects.project`
 * (le scope-racine S53, content-adressé, append-only — le MÊME chemin que /projects,
 * réutilisant lib/project : newProject/canonicalBody/contentAddress). Le schéma `projects`
 * est SOUS le mur (projects_baseline : « the /projects panel may write it directly ») :
 * pas de dispatch gateway requis. La LISTE lit le registre Postgres en SOURCE (existence/
 * identité), enrichie par le transcript fichier (turns/savedAt) ; un projet présent au
 * fichier mais pas encore migré reste listé (rien ne disparaît). Si Postgres est
 * injoignable → repli déterministe sur les fichiers (fallback gouverné, jamais silencieux
 * dans son intention). L'écriture-registre est BEST-EFFORT : un échec n'altère jamais le
 * flux fichier (zéro régression). Le transcript reste au fichier (la conversation = la
 * projection rejouable, ADR 0061) ; l'EXISTENCE/identité du projet vit en Postgres.
 */

/**
 * Le dossier des projets persistés (gitignoré à la racine du dépôt). ISOLABLE via
 * AIDOS_PROJECTS_DIR : les runs e2e/Playwright pointent vers un dossier JETABLE pour ne
 * PAS polluer le vrai magasin (cause racine des 906 artefacts qui noyaient le switcher).
 * En prod, l'env est absente → le vrai dossier.
 */
const PROJECTS_DIR =
	process.env.AIDOS_PROJECTS_DIR || "/data/dev/aidos/.aidos-projects";

/** Le cookie du projet actif (lu par le layout /v3 à chaque rendu). */
const ACTIVE_COOKIE = "aidos-v3-project";

/**
 * Le owner_ref des projets V3 dans `projects.project` : la contrainte d'unicité est
 * (owner_ref, slug) ; un owner stable « v3 » fait que le slug V3 (= l'id fichier, déjà
 * unique avec son suffixe « -2 ») reste unique côté truth-store. Le projet système
 * (owner_ref « __aidos__ », slug « __system__ ») n'apparaît donc pas dans la liste V3.
 */
const V3_OWNER = "v3";

/** Le pool Postgres (lazy, partagé) — POSTGRES_CONNECTION_STRING, ou null si absente. */
let sql: ReturnType<typeof postgres> | null = null;
function pg(): ReturnType<typeof postgres> | null {
	const dsn = process.env.POSTGRES_CONNECTION_STRING;
	if (!dsn) return null;
	if (!sql) {
		sql = postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 8 });
	}
	return sql;
}

/** Le label du nœud-racine DAG d'un projet (même convention que /projects). */
function rootNodeIdLabel(p: Project): string {
	return `project:${p.slug}@${p.id}`;
}

/**
 * registerV3Project — ENREGISTRE (best-effort, idempotent) un projet V3 dans le
 * truth-store `projects.project` + son `dag_root`, content-adressé et append-only,
 * via le MÊME chemin que /projects (lib/project). Un échec (DB injoignable, slug
 * invalide) est AVALÉ : le flux fichier reste la garantie — l'enregistrement est un
 * ajout, jamais un point de rupture (§9 anti-overwrite, fallback gouverné ADR 0074).
 */
async function registerV3Project(id: string, name: string): Promise<void> {
	if (!isValidSlug(id)) return;
	const c = pg();
	if (!c) return;
	const createdAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
	try {
		const p = newProject(id, name, V3_OWNER, createdAt);
		const body = canonicalBody({
			slug: id,
			name,
			ownerRef: V3_OWNER,
			createdAt,
			lifecycle: "active",
		});
		await c.begin(async (tx) => {
			await tx`
				insert into projects.project (id, body, version)
				values (${p.id}, ${body}::jsonb, ${p.id})
				on conflict (id) do nothing`;
			await tx`
				insert into projects.dag_root (project_id, node_id, label)
				values (${p.id}, ${contentAddress({ slug: id, name, ownerRef: V3_OWNER, createdAt, lifecycle: "active" })}, ${rootNodeIdLabel(p)})
				on conflict (project_id) do nothing`;
		});
	} catch (err) {
		console.warn("[/v3 projects] register failed:", (err as Error).message);
	}
}

/** Les slugs V3 présents (têtes vivantes, non supprimées) dans le truth-store, ou null si DB injoignable. */
async function liveV3Slugs(): Promise<Map<string, { name: string }> | null> {
	const c = pg();
	if (!c) return null;
	try {
		const rows = await c<{ body: Record<string, string> }[]>`
			select body from projects.project
			where superseded_by is null
			  and body->>'owner_ref' = ${V3_OWNER}
			  and body->>'lifecycle' <> 'deleted'`;
		const out = new Map<string, { name: string }>();
		for (const r of rows) out.set(r.body.slug, { name: r.body.name });
		return out;
	} catch (err) {
		console.warn(
			"[/v3 projects] registry read failed:",
			(err as Error).message,
		);
		return null;
	}
}

/** L'id sûr pour un chemin de fichier — fail-closed : tout le reste → null. */
const SAFE_ID = /^[a-z0-9-]{1,64}$/;

/** Le résumé d'un projet pour la liste du commutateur (nav). */
export type ProjectSummary = {
	id: string;
	name: string;
	savedAt: number;
	turns: number;
};

/** Garantit le dossier (idempotent). */
function ensureDir(): void {
	mkdirSync(PROJECTS_DIR, { recursive: true });
}

/** Le chemin du fichier d'un id DÉJÀ validé. */
function fileOf(id: string): string {
	return join(PROJECTS_DIR, `${id}.json`);
}

/** Lit TOUS les projets valides (parse fail-closed : le bruit est ignoré), triés. */
function readAll(): ProjectRecord[] {
	ensureDir();
	const records = readdirSync(PROJECTS_DIR)
		.filter((n) => n.endsWith(".json"))
		.map((n) => {
			try {
				return parseProject(readFileSync(join(PROJECTS_DIR, n), "utf8"));
			} catch {
				return null;
			}
		})
		.filter((p): p is ProjectRecord => p !== null);
	return sortProjects(records);
}

/**
 * LISTE les projets (résumés triés : le plus récemment sauvé d'abord).
 *
 * ADR 0073 : la SOURCE d'existence est le registre Postgres `projects.project` ; le
 * transcript fichier fournit le détail (turns/savedAt). On UNIONNE les deux par slug :
 * un projet du registre sans fichier (créé ailleurs) apparaît (turns 0) ; un projet
 * fichier pas encore migré reste listé (rien ne disparaît). DB injoignable → repli
 * déterministe sur les fichiers seuls (le comportement antérieur, jamais une page vide).
 */
export async function listProjectsAction(): Promise<ProjectSummary[]> {
	const files = readAll();
	const byId = new Map<string, ProjectSummary>();
	for (const p of files) {
		byId.set(p.id, {
			id: p.id,
			name: p.name,
			savedAt: p.savedAt,
			turns: p.transcript.length,
		});
	}
	const registry = await liveV3Slugs();
	if (registry) {
		for (const [slug, { name }] of registry) {
			if (!byId.has(slug)) {
				// Enregistré dans le truth-store mais pas de transcript fichier local.
				byId.set(slug, { id: slug, name, savedAt: 0, turns: 0 });
			}
		}
	}
	return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** CHARGE un projet par id — fail-closed (id hostile, fichier absent ou bruité → null). */
export async function loadProjectAction(
	id: string,
): Promise<ProjectRecord | null> {
	if (!SAFE_ID.test(id)) return null;
	ensureDir();
	try {
		return parseProject(readFileSync(fileOf(id), "utf8"));
	} catch {
		return null;
	}
}

/**
 * SAUVE un projet — la SEULE lecture d'horloge de toute la persistance V3 :
 * savedAt est fourni ICI (couche impure), jamais lu dans le twin pur.
 */
export async function saveProjectAction(record: {
	id: string;
	name: string;
	transcript: readonly string[];
	replies: Readonly<Record<string, string>>;
}): Promise<void> {
	if (!SAFE_ID.test(record.id)) return;
	if (record.name.trim() === "") return;
	ensureDir();
	writeFileSync(
		fileOf(record.id),
		serializeProject({ ...record, savedAt: Math.floor(Date.now() / 1000) }),
		"utf8",
	);
	// ADR 0073 — (ré)enregistre le projet dans le truth-store (idempotent, best-effort).
	await registerV3Project(record.id, record.name.trim());
}

/**
 * Le RÉSULTAT d'une création — discriminé : on ne renvoie plus « null » muet ni un
 * suffixe « -2 » silencieux. Un nom dupliqué/vide/imprononçable est REFUSÉ avec un motif
 * que l'écran transforme en ALERTE (le défaut « aucune alerte sur doublon » est corrigé).
 */
export type CreateProjectOutcome =
	| { ok: true; record: ProjectRecord }
	| { ok: false; reason: "empty" | "unusable" | "duplicate"; slug?: string };

/**
 * CRÉE un projet (transcript VIDE) — « créer une app crée un projet ». Refuse, AVEC MOTIF :
 * un nom vide/blanc (empty), un nom sans caractère slug-able (unusable), ou un nom dont le
 * slug existe DÉJÀ (duplicate — insensible à la casse/aux accents). Les slugs pris sont
 * rassemblés des DEUX sources : les fichiers locaux ET le registre Postgres (ADR 0073, la
 * source d'existence) — donc un doublon est détecté même si le fichier local manque. Plus
 * de suffixe « -2 » muet : un doublon s'arrête là, l'écran alerte et propose d'ouvrir l'existant.
 */
export async function createProjectAction(
	name: string,
): Promise<CreateProjectOutcome> {
	ensureDir();
	// Les slugs DÉJÀ pris = ids des fichiers locaux ∪ slugs du registre Postgres.
	const taken = new Set<string>(readAll().map((p) => p.id));
	const registry = await liveV3Slugs();
	if (registry) for (const slug of registry.keys()) taken.add(slug);

	const verdict = classifyNewName(name, taken);
	if (!verdict.ok) return { ok: false, reason: verdict.reason };

	const id = verdict.slug;
	const clean = name.trim();
	const record: ProjectRecord = {
		id,
		name: clean,
		transcript: [],
		replies: {},
		savedAt: Math.floor(Date.now() / 1000),
	};
	writeFileSync(fileOf(id), serializeProject(record), "utf8");
	// ADR 0073 — enregistre le nouveau projet dans le truth-store Postgres (source
	// d'existence, content-adressé, append-only). Best-effort : le fichier reste la garantie.
	await registerV3Project(id, clean);
	return { ok: true, record };
}

/** Les barreaux d'environnement admis pour un workspace (le vocabulaire canonique). */
const SAFE_ENVS = new Set(["dev", "staging", "prod"]);

/** Le verdict d'une émission de workspace (fail-closed : refusé → ok=false, 0 fichier). */
export type WorkspaceEmission = { ok: boolean; files: number };

/** Garde fail-closed : la projection reçue du client a EXACTEMENT la forme attendue. */
function isAppProjection(app: unknown): app is AppProjection {
	if (typeof app !== "object" || app === null) return false;
	const a = app as { version?: unknown; entities?: unknown; routes?: unknown };
	return (
		typeof a.version === "string" &&
		Array.isArray(a.entities) &&
		a.entities.every(
			(e) => typeof e?.name === "string" && typeof e?.version === "string",
		) &&
		Array.isArray(a.routes) &&
		a.routes.every((r) => typeof r === "string")
	);
}

/**
 * ÉMET le workspace d'un environnement : les fichiers de l'app déployée — calculés
 * par filesOf (lib/v3/emit-files, l'ÉMETTEUR DÉTERMINISTE, ADR 0062) — ÉCRITS sous
 * .aidos-projects/<id>/workspace/<env>/ pour le VS Code live (/v3/code).
 *
 * IMPUR ICI, ET SEULEMENT ICI : le système de fichiers ; le CALCUL reste dans le twin
 * (même app → mêmes octets, écrasement idempotent). ESPRIT APPEND-ONLY : on (ré)écrit,
 * jamais on ne supprime. Fail-closed : id hostile, barreau inconnu ou projection
 * difforme → { ok: false }. Défense en profondeur : chaque chemin émis est résolu et
 * CONFINÉ au dossier du workspace (filesOf garantit déjà des chemins relatifs sûrs).
 * LE MUR (§2) : des fichiers d'app émise — aucune écriture kernel/mirrors/fitness.
 */
export async function emitWorkspaceAction(
	projectId: string,
	env: string,
	projectName: string,
	app: {
		version: string;
		entities: readonly { name: string; version: string }[];
		routes: readonly string[];
	},
): Promise<WorkspaceEmission> {
	if (!SAFE_ID.test(projectId)) return { ok: false, files: 0 };
	if (!SAFE_ENVS.has(env)) return { ok: false, files: 0 };
	if (!isAppProjection(app)) return { ok: false, files: 0 };
	const root = resolve(PROJECTS_DIR, projectId, "workspace", env);
	mkdirSync(root, { recursive: true });
	let written = 0;
	for (const f of filesOf(projectName, app)) {
		const target = resolve(root, f.path);
		// jamais hors du workspace — un chemin qui s'échappe est ignoré, pas écrit.
		if (!target.startsWith(root + sep)) continue;
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, f.content, "utf8");
		written += 1;
	}
	return { ok: true, files: written };
}

/** ACTIVE un projet : pose le cookie lu par le layout (le client fait router.refresh()). */
export async function setActiveProjectAction(id: string): Promise<void> {
	if (!SAFE_ID.test(id)) return;
	(await cookies()).set(ACTIVE_COOKIE, id, {
		path: "/",
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 365,
	});
}
