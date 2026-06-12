/**
 * V3 — l'ÉMETTEUR EN FICHIERS (ADR 0062) : l'app du projet, émise en VRAIS fichiers
 * pour le workspace VS Code de chaque environnement. Un ÉMETTEUR DÉTERMINISTE (§6) :
 * même AppProjection → mêmes fichiers, octet pour octet — jamais un LLM, jamais une
 * horloge. La couche impure (l'action serveur de déploiement) ÉCRIT ces fichiers
 * sous .aidos-projects/<id>/workspace/<env>/ ; ce twin ne fait que les CALCULER.
 * Miroir : lib/v3/emit-files.test.ts.
 */

import type { AppProjection } from "../v2/builder";

export interface EmittedFile {
	/** Le chemin RELATIF (jamais absolu, jamais de traversée). */
	readonly path: string;
	readonly content: string;
}

/** Plie un nom d'entité en identifiant SQL (tirets → underscores). */
function sqlName(name: string): string {
	return name
		.replace(/-/g, "_")
		.replace(/[^a-z0-9_]/gi, "")
		.toLowerCase();
}

/**
 * CALCULE les fichiers du workspace d'une app émise. PURE & TOTALE & REPRODUCTIBLE :
 * README (nom + version + inventaire), schema.sql (une table par entité), routes.json,
 * un JSON par entité. Une app vide émet quand même un README lisible.
 */
export function filesOf(
	projectName: string,
	app: AppProjection,
): EmittedFile[] {
	const name = projectName.trim() === "" ? "Projet" : projectName.trim();
	const files: EmittedFile[] = [
		{
			path: "README.md",
			content: [
				`# ${name}`,
				"",
				`Application émise par AIDOS — version \`${app.version}\`.`,
				"",
				`- Entités : ${app.entities.length}`,
				`- Routes : ${app.routes.join(", ") || "(aucune)"}`,
				"",
				"_Fichiers générés déterministiquement (même projet → mêmes octets)._",
				"",
			].join("\n"),
		},
	];
	if (app.entities.length > 0) {
		files.push({
			path: "schema.sql",
			content: app.entities
				.map(
					(e) =>
						`-- entité « ${e.name} » (version ${e.version})\nCREATE TABLE IF NOT EXISTS ${sqlName(e.name)} (\n\tid TEXT PRIMARY KEY,\n\tcreated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n`,
				)
				.join("\n"),
		});
		files.push({
			path: "routes.json",
			content: `${JSON.stringify(app.routes, null, "\t")}\n`,
		});
		for (const e of app.entities)
			files.push({
				path: `entities/${sqlName(e.name) || "entite"}.json`,
				content: `${JSON.stringify({ name: e.name, version: e.version }, null, "\t")}\n`,
			});
	}
	// unicité des chemins garantie par construction sauf collisions de sqlName : dédup stable.
	const seen = new Set<string>();
	return files.filter((f) => {
		if (seen.has(f.path)) return false;
		seen.add(f.path);
		return true;
	});
}
