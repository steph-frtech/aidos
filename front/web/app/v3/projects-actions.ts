"use server";

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { cookies } from "next/headers";
import type { AppProjection } from "@/lib/v2/builder";
import { filesOf } from "@/lib/v3/emit-files";
import {
	type ProjectRecord,
	parseProject,
	projectSlug,
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
 */

/** Le dossier des projets persistés (gitignoré à la racine du dépôt). */
const PROJECTS_DIR = "/data/dev/aidos/.aidos-projects";

/** Le cookie du projet actif (lu par le layout /v3 à chaque rendu). */
const ACTIVE_COOKIE = "aidos-v3-project";

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

/** LISTE les projets (résumés triés : le plus récemment sauvé d'abord). */
export async function listProjectsAction(): Promise<ProjectSummary[]> {
	return readAll().map((p) => ({
		id: p.id,
		name: p.name,
		savedAt: p.savedAt,
		turns: p.transcript.length,
	}));
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
}

/**
 * CRÉE un projet : id = slug du nom (+ suffixe « -2 », « -3 »… déterministe en cas
 * de collision), transcript VIDE — « créer une app crée un projet ». Nom imprononçable
 * (slug vide) → null, fail-closed.
 */
export async function createProjectAction(
	name: string,
): Promise<ProjectRecord | null> {
	const clean = name.trim();
	const base = projectSlug(clean);
	if (base === "") return null;
	ensureDir();
	let id = base;
	for (let n = 2; existsSync(fileOf(id)); n += 1) id = `${base}-${n}`;
	const record: ProjectRecord = {
		id,
		name: clean,
		transcript: [],
		replies: {},
		savedAt: Math.floor(Date.now() / 1000),
	};
	writeFileSync(fileOf(id), serializeProject(record), "utf8");
	return record;
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
