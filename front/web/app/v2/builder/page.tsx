import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { assembleGraph, extractFromSource } from "@/lib/v2/code-extract";
import { BuilderClient } from "./BuilderClient";

/**
 * /v2/builder — IA BUILDER : « UN chat qui fait tout » (WB2-27 ; ADR 0057).
 *
 * UN seul écran, UN seul chat — mais « tout » passe par une GRAMMAIRE D'INTENTIONS FERMÉE
 * (le twin pur lib/v2/builder : capturer une idée, greffer, promouvoir, générer l'app,
 * déployer, voir le delta, impacter, interroger, ouvrir un écran — rien d'autre : le CYCLE
 * DE VIE COMPLET, jusqu'au CLIQUET généralisé dev→staging→prod et au DÉPLOIEMENT RÉEL gaté
 * ADR 0052). Chaque tour rend VISIBLES : « l'attente » (le verdict understand),
 * « les types de réponse possibles » (TOUS les candidats classés, cliquables), « la réponse »
 * (les événements du réducteur pur, jeu clos) et « les impacts » (la vague calculée). Une
 * ambiguïté est OFFERTE (chips), jamais tranchée en silence ; le LLM est l'exception gatée
 * (reformuler) et sa phrase repasse par le MÊME pipeline — le code a l'autorité (§6/§8).
 *
 * LE MUR (§2) : le chat PROPOSE — une idée reste hasMirror=false, un kernel proposé reste
 * wroteKernel=false (ChangeSet DRAFT), un déploiement est gaté (ADR 0052), jamais exécuté.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"chatHeading",
	"chatEmpty",
	"attenteHeading",
	"attenteNone",
	"statusComprise",
	"statusAmbigue",
	"statusIncomprise",
	"candidatesHeading",
	"candidatesEmpty",
	"candidatesHint",
	"eventsHeading",
	"impactsHeading",
	"impactsEmpty",
	"inputPlaceholder",
	"send",
	"suggestionsLabel",
	"claudeBtn",
	"claudeBusy",
	"claudeFailed",
	"claudeRewritten",
	"intentCapturerIdee",
	"intentGreffer",
	"intentPromouvoir",
	"intentGenerer",
	"intentDeployer",
	"intentDelta",
	"intentImpacter",
	"intentInterroger",
	"intentOuvrir",
	"intentLancerBench",
	"intentExplorerEvolution",
	"intentLectureLive",
	"intentProposition",
	"openScreen",
	"tabArbre",
	"tabApp",
	"tabEnvs",
	"tabJournal",
	"appHeading",
	"appEmpty",
	"appEntitiesHeading",
	"appRoutesHeading",
	"appProjectionNote",
	"appDeployLink",
	"envsHeading",
	"envSendHint",
	"envDevTitle",
	"envStagingTitle",
	"envProdTitle",
	"envNever",
	"envKernelsLabel",
	"envEcartLabel",
	"envNoKernelHint",
	"deployDevBtn",
	"deployStagingBtn",
	"deployProdBtn",
	"envGateNote",
	"realDeployHeading",
	"realDeployNote",
	"realDeployBtn",
	"realDeployBusy",
	"realDeployUrlLabel",
	"realDeployFailed",
	"codeDeltaHeading",
	"codeDeltaEmpty",
	"codeDeltaWaveLabel",
	"treeHeading",
	"treeHint",
	"ideasHeading",
	"ideasEmpty",
	"hasMirrorBadge",
	"coordinateLabel",
	"kernelsHeading",
	"kernelsEmpty",
	"draftBadge",
	"changeSetLabel",
	"wroteKernelBadge",
	"logHeading",
	"logEmpty",
	"posRacine",
	"posFeuille",
	"posDepthTitle",
] as const;

export default async function V2BuilderScreen() {
	const t = await getTranslations("v2Builder");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	// La COLLECTE (la seule couche impure, le motif /v2/code) : Next s'exécute depuis front/web ;
	// le garde-fou couvre un lancement depuis la racine du monorepo.
	const cwd = process.cwd();
	const absBase = cwd.endsWith(join("front", "web"))
		? cwd
		: join(cwd, "front", "web");

	// L'INVENTAIRE des écrans n'est PLUS un scan : il est DÉCLARÉ (le REGISTRE D'ÉCRANS COMPLET,
	// lib/v2/screen-registry → ALL_SCREENS), pris par défaut par initBuilderState() côté client.
	// Le registre fait AUTORITÉ — il couvre TOUTE la nav (racine V1 + V2 + V3, dont les sous-routes
	// /v3/* que le scan plat de app/<dir> n'énumérait pas, l'angle mort/monstre désormais comblé).
	// Le miroir (builder.test.ts) ITÈRE ce registre et prouve la couverture (∀ écran atteignable).
	//
	// (b) Le GRAPHE DE CODE (le motif /v2/code) : extrait des twins lib/v2 RÉELS par l'API
	// compilateur TypeScript (code-extract, côté serveur seulement), trié (même dépôt → même graphe).
	const libDir = join(absBase, "lib", "v2");
	const { nodes: codeNodes, edges: codeEdges } = assembleGraph(
		readdirSync(libDir)
			.filter((n) => n.endsWith(".ts"))
			.sort()
			.map((name) =>
				extractFromSource(
					`lib/v2/${name}`,
					readFileSync(join(libDir, name), "utf8"),
				),
			),
	);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-builder-back-home"
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
			</header>

			<p
				data-testid="v2-builder-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<BuilderClient t={strings} codeNodes={codeNodes} codeEdges={codeEdges} />
		</div>
	);
}
