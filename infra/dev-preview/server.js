// server.js — AIDOS dev-preview v0 (aperçu générique des workspaces émis).
//
// Serveur HTTP pur (Node 22, ZÉRO dépendance npm) qui sert, en lecture seule,
// le workspace ÉMIS d'un projet AIDOS sous https://<projectId>-dev.sagedesk.fr.
// v0 volontairement minimal — la piste DP le remplacera par de vrais conteneurs
// par projet/env (avec certificat wildcard DNS-challenge). Ici : cert PAR DÉFAUT
// en HTTPS (avertissement navigateur acceptable) + HTTP simple sans redirection.
//
// Rendu DÉTERMINISTE : même workspace → même HTML (lectures triées, aucun aléa,
// aucune horloge).
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 3330;
// Racine des projets — montée :ro dans le conteneur (voir docker-compose.yml).
const PROJECTS_ROOT = path.resolve(process.env.AIDOS_PROJECTS_DIR || "/projects");
// Suffixe d'hôte attendu : <projectId>-dev.sagedesk.fr
const HOST_SUFFIX = "-dev.sagedesk.fr";
// Identifiant de projet légal (même contrat que l'atelier AIDOS).
const ID_RE = /^[a-z0-9-]{1,64}$/;
// Nombre de lignes du README affichées dans le pied de page.
const README_LINES = 15;

/** Échappe une chaîne pour insertion sûre dans le HTML. */
function escapeHtml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Styles inline — fond zinc, accents blue-600, police système (thème AIDOS, ADR 0010).
const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fafafa;color:#27272a;line-height:1.5}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 48px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;border-bottom:1px solid #e4e4e7;padding-bottom:16px;margin-bottom:24px}
header h1{font-size:20px;font-weight:600;color:#18181b;word-break:break-all}
header .env{font-size:13px;color:#71717a}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
nav a{display:inline-block;padding:6px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;color:#3f3f46;font-size:14px;text-decoration:none}
nav a:hover{border-color:#2563eb;color:#2563eb}
h2{font-size:14px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:28px}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.card .name{font-weight:600;color:#18181b;word-break:break-all}
.chip{font-size:12px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:999px;padding:2px 10px;white-space:nowrap}
pre{background:#18181b;color:#e4e4e7;border-radius:10px;padding:16px;font-size:13px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.empty-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;max-width:560px}
.empty-card p{margin-bottom:14px;color:#3f3f46}
.empty-card a.btn{display:inline-block;background:#2563eb;color:#fff;border-radius:8px;padding:8px 18px;text-decoration:none;font-size:14px;font-weight:500}
footer{margin-top:32px;font-size:12px;color:#a1a1aa}
`;

/** Enveloppe HTML commune (déterministe — aucune date, aucun aléa). */
function page(title, body) {
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body><div class="wrap">${body}
<footer>AIDOS · dev-preview v0 — aperçu en lecture seule du workspace émis.</footer>
</div></body>
</html>
`;
}

/** Page « workspace présent » : vitrine du workspace émis. */
function renderWorkspace(projectId, dir) {
	// routes.json — onglets de navigation (ordre du fichier, lui-même déterministe).
	let routes = [];
	try {
		const parsed = JSON.parse(fs.readFileSync(path.join(dir, "routes.json"), "utf8"));
		if (Array.isArray(parsed)) routes = parsed.filter((r) => typeof r === "string");
	} catch {
		// routes.json absent ou illisible → pas d'onglets, la page reste servie.
	}

	// entities/*.json — une carte par entité (lecture TRIÉE pour le déterminisme).
	const entities = [];
	try {
		const files = fs
			.readdirSync(path.join(dir, "entities"))
			.filter((f) => f.endsWith(".json"))
			.sort();
		for (const f of files) {
			try {
				const e = JSON.parse(fs.readFileSync(path.join(dir, "entities", f), "utf8"));
				entities.push({
					name: typeof e.name === "string" ? e.name : f.replace(/\.json$/, ""),
					version: typeof e.version === "string" ? e.version : "?",
				});
			} catch {
				// Entité illisible → ignorée, le rendu reste stable.
			}
		}
	} catch {
		// Dossier entities/ absent → aucune carte.
	}

	// README.md — les ~15 premières lignes dans un bloc <pre> de pied de page.
	let readme = "";
	try {
		readme = fs
			.readFileSync(path.join(dir, "README.md"), "utf8")
			.split("\n")
			.slice(0, README_LINES)
			.join("\n");
	} catch {
		// README absent → bloc omis.
	}

	const nav = routes.length
		? `<nav>${routes.map((r) => `<a href="#">${escapeHtml(r)}</a>`).join("")}</nav>`
		: "";
	const cards = entities.length
		? `<h2>Entités</h2><div class="cards">${entities
				.map(
					(e) =>
						`<div class="card"><span class="name">${escapeHtml(e.name)}</span><span class="chip">${escapeHtml(e.version)}</span></div>`,
				)
				.join("")}</div>`
		: "";
	const pre = readme ? `<h2>README</h2><pre>${escapeHtml(readme)}</pre>` : "";

	const body = `<header><h1>${escapeHtml(projectId)}</h1><span class="env">dev · aperçu v0 (AIDOS)</span></header>
${nav}${cards}${pre}`;
	return page(`${projectId} — dev · aperçu v0 (AIDOS)`, body);
}

/** Page « workspace absent » : 200 amical, le projet n'est pas encore préparé. */
function renderAbsent(projectId) {
	const body = `<header><h1>${escapeHtml(projectId)}</h1><span class="env">dev · aperçu v0 (AIDOS)</span></header>
<div class="empty-card">
<p>Cette application n'a pas encore été préparée pour dev — dans AIDOS&nbsp;: déployez en dev dans le chat (l'atelier émet le workspace automatiquement) ou /v3/code → Préparer le workspace.</p>
<a class="btn" href="https://aidos.sagedesk.fr/v3/lab">Ouvrir AIDOS</a>
</div>`;
	return page(`${projectId} — pas encore préparé (AIDOS)`, body);
}

/** Répond avec les en-têtes canoniques (HTML utf-8, jamais indexé). */
function respond(res, status, html) {
	res.writeHead(status, {
		"Content-Type": "text/html; charset=utf-8",
		"X-Robots-Tag": "noindex",
		"Cache-Control": "no-store",
	});
	res.end(html);
}

const server = http.createServer((req, res) => {
	// 1. Hôte attendu : <id>-dev.sagedesk.fr (port éventuel ignoré).
	const host = (req.headers.host || "").split(":")[0].toLowerCase();
	if (!host.endsWith(HOST_SUFFIX)) {
		respond(res, 400, page("Requête invalide", "<p>Hôte attendu : &lt;projet&gt;-dev.sagedesk.fr</p>"));
		return;
	}
	const projectId = host.slice(0, -HOST_SUFFIX.length);

	// 2. Identifiant légal — sinon 400 (la regex exclut tout séparateur de chemin).
	if (!ID_RE.test(projectId)) {
		respond(res, 400, page("Requête invalide", "<p>Identifiant de projet invalide.</p>"));
		return;
	}

	// 3. Chemin confiné à PROJECTS_ROOT (ceinture + bretelles après la regex) —
	//    jamais de listing de répertoire : on ne sert que la page rendue.
	const wsDir = path.resolve(PROJECTS_ROOT, projectId, "workspace", "dev");
	if (!wsDir.startsWith(PROJECTS_ROOT + path.sep)) {
		respond(res, 400, page("Requête invalide", "<p>Chemin refusé.</p>"));
		return;
	}

	// 4. Workspace présent → vitrine ; absent → page amicale (200 dans les deux cas).
	let exists = false;
	try {
		exists = fs.statSync(wsDir).isDirectory();
	} catch {
		exists = false;
	}
	respond(res, 200, exists ? renderWorkspace(projectId, wsDir) : renderAbsent(projectId));
});

server.listen(PORT, "0.0.0.0", () => {
	// Trace de démarrage (stdout du conteneur) — aucune donnée sensible.
	console.log(`aidos-dev-preview v0 à l'écoute sur :${PORT} (racine ${PROJECTS_ROOT})`);
});
