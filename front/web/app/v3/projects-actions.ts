"use server";

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { cookies } from "next/headers";
import postgres from "postgres";
import { callGateway } from "@/lib/gateway-sdk";
import { WORKBENCH_IDENTITY } from "@/lib/panelScope";
import {
	canonicalBody,
	contentAddress,
	isValidSlug,
	newProject,
	type Project,
} from "@/lib/project";
import type { Scope } from "@/lib/projectWall";
import type { AppProjection } from "@/lib/v2/builder";
import { bareTree } from "@/lib/v2/composition";
import { projectStateToBacklog } from "@/lib/v3/backlog";
import { filesOf } from "@/lib/v3/emit-files";
import {
	classifyNewName,
	type ProjectRecord,
	parseBody,
	parseProject,
	serializeBody,
	serializeProject,
	sortProjects,
} from "@/lib/v3/project";
import { replayTo } from "@/lib/v3/session";

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
 * registerV3Project — PERSISTE (best-effort, idempotent, append-only) l'ÉTAT d'un projet V3
 * dans le truth-store Postgres (ADR 0073 — Plan A, le PORTEUR de fidélité). Le transcript (la
 * SEULE vérité, event-sourcing) est porté dans le body content-adressé de `projects.project`.
 *
 * DEUX LIGNES par projet : (1) la ligne-GENESIS = le body-identité (id = p.id, content-adressé
 * sur l'identité seule), ANCRE STABLE du `dag_root` (la FK dag_root.project_id → project.id
 * exige une ligne qui existe pour toujours ; l'append-only la garde même superseded) ; (2) la
 * ligne-TÊTE = le body-COMPLET (id = hash du body complet AVEC transcript). Chaque sauvegarde
 * d'un transcript modifié insère une nouvelle ligne-tête et SUPERSEDE l'ancienne (§9 « supersede
 * via version », jamais un UPDATE destructif ni un DELETE).
 *
 * ORDRE DE TRANSACTION SÛR (vérifié contre le schéma réel) : superseded_by n'a PAS de FK (on
 * peut le poser avant que la nouvelle ligne existe) ; l'index unique partiel (owner_ref, slug)
 * WHERE superseded_by IS NULL est IMMÉDIAT → on SUPERSEDE la tête courante AVANT d'insérer la
 * nouvelle (jamais deux têtes vivantes). Idempotent : même transcript → même hash → supersede
 * no-op (id <> hash exclut la tête identique) + insert ON CONFLICT resurrect.
 *
 * Un échec (DB injoignable, slug invalide) est AVALÉ : le flux fichier reste la garantie — la
 * persistance Postgres est un AJOUT, jamais un point de rupture (fallback gouverné ADR 0074).
 */
async function registerV3Project(record: {
	id: string;
	name: string;
	transcript: readonly string[];
	replies: Readonly<Record<string, string>>;
	savedAt: number;
}): Promise<void> {
	const { id } = record;
	const name = record.name.trim();
	if (!isValidSlug(id) || name === "") return;
	const c = pg();
	if (!c) return;
	try {
		// createdAt STABLE : la date de la ligne genesis existante (la 1re du slug), sinon
		// aujourd'hui (1re création) — garde p.id (l'ancre dag_root content-adressée) stable
		// d'une sauvegarde à l'autre (sinon le genesis dériverait à chaque jour).
		const existing = await c<{ ca: string }[]>`
			select body->>'created_at' as ca from projects.project
			where body->>'owner_ref' = ${V3_OWNER} and body->>'slug' = ${id}
			order by created_at asc limit 1`;
		const createdAt =
			existing[0]?.ca ?? `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
		const identity = {
			ownerRef: V3_OWNER,
			createdAt,
			lifecycle: "active" as const,
		};
		const p = newProject(id, name, V3_OWNER, createdAt);
		// Le body-identité (genesis, ancre dag_root). c.json garantit un OBJET jsonb (jamais le
		// texte ::jsonb — le scar du double-encodage, S59 found-by-running).
		const identityBody = JSON.parse(
			canonicalBody({
				slug: id,
				name,
				ownerRef: V3_OWNER,
				createdAt,
				lifecycle: "active",
			}),
		) as Parameters<typeof c.json>[0];
		// Le body-COMPLET porteur du transcript + son content-address (le hash du body canonique).
		const fullText = serializeBody(
			{
				id,
				name,
				transcript: record.transcript,
				replies: record.replies,
				savedAt: record.savedAt,
			},
			identity,
		);
		const bodyHash = createHash("sha256")
			.update(fullText, "utf8")
			.digest("hex");
		const fullBody = JSON.parse(fullText) as Parameters<typeof c.json>[0];
		await c.begin(async (tx) => {
			// 1. GENESIS (idempotent) : la ligne-identité (ancre dag_root, id stable) + le dag_root.
			await tx`
				insert into projects.project (id, body, version)
				values (${p.id}, ${c.json(identityBody)}, ${p.id})
				on conflict (id) do nothing`;
			await tx`
				insert into projects.dag_root (project_id, node_id, label)
				values (${p.id}, ${contentAddress({ slug: id, name, ownerRef: V3_OWNER, createdAt, lifecycle: "active" })}, ${rootNodeIdLabel(p)})
				on conflict (project_id) do nothing`;
			// 2. SUPERSEDE la tête courante si elle diffère du body complet (append-only, §9).
			await tx`
				update projects.project set superseded_by = ${bodyHash}
				where body->>'owner_ref' = ${V3_OWNER} and body->>'slug' = ${id}
				  and superseded_by is null and id <> ${bodyHash}`;
			// 3. La ligne-TÊTE porteuse du transcript (resurrect si on revient à un transcript antérieur).
			await tx`
				insert into projects.project (id, body, version)
				values (${bodyHash}, ${c.json(fullBody)}, ${bodyHash})
				on conflict (id) do update set superseded_by = null`;
		});
	} catch (err) {
		console.warn("[/v3 projects] register failed:", (err as Error).message);
	}
}

/**
 * saveProjectBacklog — ADR 0073 Plan B (le BACKLOG GOUVERNÉ). Projette l'état REJOUÉ du projet
 * vers le truth-store via la PASSERELLE (le mur §2 : des gestes Go gouvernés, jamais une écriture
 * directe) : les idées (idea_capture, below-the-line, idempotent content-adressé), puis les
 * changesets (changeset_open + changeset_apply, mirror_delta TOUJOURS fourni), puis le dag
 * (dag_branch), dans l'ordre idée → changeset → dag (twin pur lib/v3/backlog).
 *
 * ISOLATION PAR CONSTRUCTION (Miroir d'isolation, ADR 0074) : ENTIÈREMENT best-effort — appelée
 * APRÈS Plan A (le fichier + le body Postgres déjà écrits), tout enveloppé en try/catch, et
 * callGateway ne JETTE JAMAIS (il renvoie {ok:false} sur toute panne : no_endpoint, unknown_tool,
 * http_*, outcome_route_undispatched, tool_error). Donc une panne du Plan B (gateway injoignable,
 * apply Blocked) n'altère JAMAIS le Plan A, le fichier, ni le tour de chat. C'est une projection
 * d'INSPECTION LOSSY — jamais le chemin de reprise (ça reste Plan A / le transcript).
 */
async function saveProjectBacklog(record: {
	id: string;
	name: string;
	transcript: readonly string[];
	replies: Readonly<Record<string, string>>;
	savedAt: number;
}): Promise<void> {
	try {
		const scope: Scope = {
			identity: WORKBENCH_IDENTITY,
			activeProject: record.id,
		};
		const state = replayTo(
			record.transcript,
			record.transcript.length,
			[],
			bareTree(),
		);
		const backlog = projectStateToBacklog(state);
		if (backlog.ideas.length === 0 && backlog.changesets.length === 0) {
			return; // rien à projeter (transcript sans idée/kernel) — no-op.
		}
		// 1. Les idées (idea_capture — below-the-line, idempotent, le mur via firewall.ViaIdea).
		for (const idea of backlog.ideas) {
			await callGateway(scope, "idea_capture", {
				proposes: idea.proposes,
				intent: idea.intent,
				source: idea.source,
				detail: idea.detail,
				project_id: record.id,
			});
		}
		// 2-3. Les changesets + le dag, branchés sur le nœud GENESIS du projet (projection lossy).
		if (backlog.changesets.length > 0) {
			const c = pg();
			let genesis: string | null = null;
			if (c) {
				try {
					const rows = await c<{ node_id: string }[]>`
						select dr.node_id from projects.dag_root dr
						join projects.project p on p.id = dr.project_id
						where p.body->>'owner_ref' = ${V3_OWNER} and p.body->>'slug' = ${record.id}
						limit 1`;
					genesis = rows[0]?.node_id ?? null;
				} catch {
					genesis = null;
				}
			}
			if (genesis) {
				const applied = new Map<string, string>(); // backlog id → applied changeset id
				for (const cs of backlog.changesets) {
					const open = await callGateway(scope, "changeset_open", {
						label: cs.label,
						parent_phase: genesis,
						spec_delta: cs.specDelta,
						mirror_delta: cs.mirrorDelta,
					});
					const openId =
						open.ok &&
						typeof open.content === "object" &&
						open.content !== null &&
						typeof (open.content as { id?: unknown }).id === "string"
							? (open.content as { id: string }).id
							: null;
					if (openId) {
						const ap = await callGateway(scope, "changeset_apply", {
							id: openId,
						});
						if (ap.ok) applied.set(cs.id, openId);
					}
				}
				for (const edge of backlog.dagEdges) {
					const appliedId = applied.get(edge.changeset);
					if (appliedId) {
						await callGateway(scope, "dag_branch", {
							from: genesis,
							label: edge.label,
							changeset: appliedId,
						});
					}
				}
			}
		}
	} catch (err) {
		console.warn(
			"[/v3 projects] backlog projection failed:",
			(err as Error).message,
		);
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

/**
 * CHARGE un projet par id — ADR 0073 : Postgres EST la source, le fichier devient projection.
 * CASCADE GOUVERNÉE, jamais une page vide : (1) la tête vivante `projects.project` AVEC son
 * transcript (la vérité ADR 0073) ; (2) DB injoignable OU body identité-seule (projet
 * pré-migration, parseBody → null) → repli sur le FICHIER (le comportement antérieur EXACT,
 * zéro régression) ; (3) fichier absent/bruité → null (fail-closed). Reprendre = rejouer le
 * transcript relu (V3SessionProvider le rejoue par turnsOf) — « le même état partout ».
 */
export async function loadProjectAction(
	id: string,
): Promise<ProjectRecord | null> {
	if (!SAFE_ID.test(id)) return null;
	// 1. Postgres d'abord (la tête vivante porteuse du transcript).
	const c = pg();
	if (c) {
		try {
			const rows = await c<{ body: unknown }[]>`
				select body from projects.project
				where body->>'owner_ref' = ${V3_OWNER} and body->>'slug' = ${id}
				  and superseded_by is null and body->>'lifecycle' <> 'deleted'
				limit 1`;
			const rec = rows[0] ? parseBody(rows[0].body) : null;
			if (rec) return rec;
		} catch (err) {
			console.warn(
				"[/v3 projects] load from PG failed:",
				(err as Error).message,
			);
		}
	}
	// 2-3. Repli gouverné : le FICHIER (pré-migration / DB injoignable), sinon null.
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
	const savedAt = Math.floor(Date.now() / 1000);
	// Le FICHIER reste écrit en PREMIER (la garantie ; projection régénérable).
	writeFileSync(
		fileOf(record.id),
		serializeProject({ ...record, savedAt }),
		"utf8",
	);
	// ADR 0073 — PLAN A : PERSISTE l'état (transcript inclus) dans le truth-store Postgres
	// (append-only, idempotent, best-effort). Le body porte désormais le transcript.
	const full = {
		id: record.id,
		name: record.name.trim(),
		transcript: record.transcript,
		replies: record.replies,
		savedAt,
	};
	await registerV3Project(full);
	// ADR 0073 — PLAN B : projette le backlog gouverné (idées/changesets/dag) via la passerelle.
	// APRÈS Plan A, best-effort — ne peut JAMAIS altérer le fichier ni le body (isolation §0074).
	await saveProjectBacklog(full);
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
	// ADR 0073 — persiste le nouveau projet (transcript vide) dans le truth-store Postgres
	// (genesis + tête, content-adressé, append-only). Best-effort : le fichier reste la garantie.
	await registerV3Project({
		id,
		name: clean,
		transcript: record.transcript,
		replies: record.replies,
		savedAt: record.savedAt,
	});
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
