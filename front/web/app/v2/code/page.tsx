import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { assembleGraph, extractFromSource } from "@/lib/v2/code-extract";
import { CodeClient } from "./CodeClient";

/**
 * /v2/code — la DESCENTE DANS LE CODE (WB2-26 ; ADR 0056 — graphify + Bazel ; §49 prolongé).
 *
 * La descente fractale CONTINUE sous la feuille : requirement → fichier → classe → fonction →
 * VERSION (hash content-adressé) → LIGNE. Le graphe de connaissance du code est EXTRAIT du
 * SOURCE RÉEL du dépôt (lib/v2/*.ts — les twins purs eux-mêmes) par l'API compilateur TypeScript
 * (lib/v2/code-extract.ts, côté serveur SEULEMENT) puis assemblé inter-fichiers ; « quoi touche
 * quoi » = impactOf, la vague de rouge (S22) au grain code (le rdeps de Bazel).
 *
 * « PRÉ-INTÉGRÉ DÈS LA RÉDACTION DU CODE » : le graphe est ré-extrait du source à CHAQUE rendu
 * — aucune déclaration manuelle, aucun LLM ; modifier un fichier change SA version et elle
 * seule. La route est dynamique (next-intl, cookie NEXT_LOCALE) donc ré-extrait aussi en prod ;
 * un cache statique au build resterait correct — même déterminisme : même source → même graphe
 * (l'extracteur est pur & reproductible).
 *
 * DÉTERMINISME-FIRST (§6/§8) : cette page est la SEULE couche impure (fs) — la collecte est
 * triée (readdirSync + sort) pour être reproductible ; tout le calcul (impact, clé Bazel, diff,
 * ancrage, god nodes) vit dans le twin pur client-safe lib/v2/code-graph.ts.
 *
 * LE MUR (§2) : l'écran LIT le code et SIMULE l'impact ; il n'écrit aucune vérité.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"reqHeading",
	"reqHint",
	"reqLabel",
	"anchorsLabel",
	"anchorsEmpty",
	"treeHeading",
	"treeHint",
	"nodeCount",
	"paneHeading",
	"paneEmpty",
	"versionLabel",
	"linesLabel",
	"actionKeyLabel",
	"openVsCode",
	"copyPath",
	"copied",
	"impactBtn",
	"impactHeading",
	"impactHint",
	"impactEmpty",
	"depthLabel",
	"depthDirect",
	"depthTransitive",
	"resetBtn",
	"graphHeading",
	"graphHint",
	"godHeading",
	"godHint",
	"inDegreeLabel",
	"kindFile",
	"kindClass",
	"kindFunction",
	"kindMethod",
	"legendExtracted",
	"legendInferred",
	"legendImpacted",
	"legendSelected",
] as const;

export default async function V2CodeScreen() {
	const t = await getTranslations("v2Code");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	// La COLLECTE (la seule couche impure) : TOUS les .ts de lib/v2 (tests inclus), TRIÉS
	// (déterminisme — même dépôt → même ordre → même graphe). Next s'exécute depuis front/web ;
	// le garde-fou couvre un lancement depuis la racine du monorepo.
	const cwd = process.cwd();
	const absBase = cwd.endsWith(join("front", "web"))
		? cwd
		: join(cwd, "front", "web");
	const dir = join(absBase, "lib", "v2");
	const names = readdirSync(dir)
		.filter((n) => n.endsWith(".ts"))
		.sort();

	const sources: Record<string, string> = {};
	const files = names.map((name) => {
		const rel = `lib/v2/${name}`;
		const text = readFileSync(join(dir, name), "utf8");
		sources[rel] = text;
		return extractFromSource(rel, text);
	});
	const { nodes, edges } = assembleGraph(files);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-code-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("homeTitle")}
			</Link>

			<header className="space-y-2">
				<p className="text-xs font-semibold tracking-wide text-primary uppercase">
					{t("eyebrow")}
				</p>
				<h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<p className="max-w-3xl text-sm font-medium text-foreground">
					{t("helpLine")}
				</p>
			</header>

			<p
				data-testid="v2-code-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<CodeClient
				nodes={nodes}
				edges={edges}
				sources={sources}
				absBase={absBase}
				t={strings}
			/>

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("prebuiltNote")}
			</p>
		</div>
	);
}
