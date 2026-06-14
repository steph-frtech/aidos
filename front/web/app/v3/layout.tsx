import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { ScreenRef } from "@/lib/v2/builder";
import { assembleGraph, extractFromSource } from "@/lib/v2/code-extract";
import { ladderOf } from "@/lib/v3/instance";
import { loadInstanceConfigAction } from "./instance/actions";
import { Palette } from "./Palette";
import {
	createProjectAction,
	listProjectsAction,
	loadProjectAction,
} from "./projects-actions";
import { V3Nav } from "./V3Nav";
import { V3SessionProvider } from "./V3Session";

/**
 * Le layout du groupe de routes /v3 (V3 — ADR 0060) : UNE session, huit lentilles.
 *
 * Le SHELL V3 : une barre latérale gauche fixe (V3Nav) + le contenu + la PALETTE ⌘K
 * (Palette — « tous les écrans au meilleur endroit »), le tout enveloppé
 * dans la V3SessionProvider — chaque lentille (/v3/lab, /v3/parcours, /v3/specs,
 * /v3/history, /v3/environnements, /v3/code, /v3/instance, /v3/parametrage) lit la
 * MÊME session rejouable. ADDITIF : les
 * V1 et V2 restent intactes. Le layout racine pousse le `<body>` de `sm:pl-64` pour
 * la barre V1 fixe ; la V3 ayant SA propre nav, on récupère cette gouttière avec
 * `sm:-ml-64` (le motif du shell V2).
 *
 * LA COLLECTE (la seule couche impure, le motif /v2/builder) : l'inventaire des écrans
 * V1 (fs-scan) + le graphe de code extrait des twins lib/v2 — injectés en DONNÉES.
 *
 * LE PROJET PERSISTANT (ADR 0061) : le cookie « aidos-v3-project » désigne le projet
 * actif ; le layout le CHARGE côté serveur (parse fail-closed) et l'injecte dans la
 * provider — rouvrir = rejouer, tout l'historique réapparaît partout. Sans cookie, le
 * plus récemment sauvé ; sans AUCUN projet, « Mon application » est auto-créé : créer
 * une app crée TOUJOURS un projet. La provider est CLÉE par l'id du projet — basculer
 * de projet remonte la session (le rejeu repart du bon transcript).
 *
 * L'ÉCHELLE PARAMÉTRABLE (ADR 0062 add.) : la config d'instance est chargée ICI
 * (parse fail-closed du twin lib/v3/instance) → ladderOf(config) — l'échelle des
 * environnements est une DONNÉE de l'instance injectée dans la provider ; chaque
 * rejeu (turnsOf/replayTo) et chaque lentille la lisent depuis la session.
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact.
 */

// Les clés i18n « v3 » passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"navHeading",
	"navLogo",
	"navLab",
	"navParcours",
	"navSpecs",
	"navHistory",
	"navEnvs",
	"navCode",
	"navInstance",
	"navParams",
	"navDesign",
	"navWorkbench",
	"paletteOpen",
	"palettePlaceholder",
	"paletteEmpty",
	"projectsCurrent",
	"projectsHint",
	"projectsNew",
	"projectsNewPlaceholder",
	"projectsCreate",
	"projectsTurnsLabel",
	"heroTitle",
	"heroSubtitle",
	"suggestionsLabel",
	"suggestion1",
	"suggestion2",
	"suggestion3",
	"suggestion4",
	"inputPlaceholder",
	"send",
	"aiToggle",
	"aiToggleHint",
	"typing",
	"detailsLabel",
	"detailsUnderstanding",
	"detailsEvents",
	"detailsImpacts",
	"detailsNone",
	"openScreenBtn",
	"ambiguousHint",
	"aiUnavailable",
	"tplIdeeCapturee",
	"tplArbreGreffe",
	"tplKernelPropose",
	"tplAppGeneree",
	"tplDeploiement",
	"tplDeltaCalcule",
	"tplImpactCalcule",
	"tplEcranOuvert",
	"tplEcranAdapte",
	"tplEtatLu",
	"tplRefus",
	"chipPromote",
	"chipGenerate",
	"chipDeployDev",
	"chipDeployStaging",
	"chipDeployProd",
	"chipDelta",
	"chipState",
	"intentCapturerIdee",
	"intentGreffer",
	"intentPromouvoir",
	"intentGenerer",
	"intentDeployer",
	"intentDelta",
	"intentImpacter",
	"intentInterroger",
	"intentOuvrir",
	"intentAdapter",
	"parcoursTitle",
	"parcoursIntro",
	"parcoursPickLabel",
	"parcoursAll",
	"parcoursEmpty",
	"parcoursEmptyTitle",
	"parcoursEmptyCta",
	"parcoursPanelHint",
	"parcoursPanelPosition",
	"parcoursPanelIdeas",
	"parcoursPanelNoIdeas",
	"parcoursPanelChat",
	"parcoursPanelClose",
	"parcoursRoot",
	"parcoursLeaf",
	"levelProduct",
	"levelJourney",
	"levelView",
	"levelControl",
	"levelAction",
	"levelOperation",
	"levelEntity",
	"historyTitle",
	"historyIntro",
	"historyEmpty",
	"historyEmptyCta",
	"historyStepLabel",
	"historyRewind",
	"historyConfirm",
	"historyConfirmBtn",
	"historyCancel",
	"envsTitle",
	"envsIntro",
	"envDevTitle",
	"envStagingTitle",
	"envProdTitle",
	"envNever",
	"envUpToDate",
	"envDrift",
	"envKernelsLabel",
	"envDeployBtn",
	"envNoVersionHint",
	"envRealTitle",
	"envRealNote",
	"envRealBtn",
	"envRealBusy",
	"envRealUrl",
	"envRealFailed",
	"envDeltaTitle",
	"envDeltaEmpty",
	"envDeltaWave",
	"paramsTitle",
	"paramsIntro",
	"paramsWall",
	"paramsPropose",
	"paramsProposed",
	"paramsProposedLink",
	"paramsSourceLabel",
	"paramsSearchPlaceholder",
	"paramsSearchEmpty",
	"paramsGestures",
	"paramsGesturesHint",
	"paramsLadder",
	"paramsLadderHint",
	"paramsLevels",
	"paramsLevelsHint",
	"paramsFacets",
	"paramsFacetsHint",
	"paramsProofs",
	"paramsProofsHint",
	"paramsThresholds",
	"paramsThresholdsHint",
	"paramsScreens",
	"paramsScreensHint",
	"paramsAgents",
	"paramsAgentsHint",
	"paramsModels",
	"paramsModelsHint",
	"paramsAutonomy",
	"paramsAutonomyHint",
	"paramsBudgets",
	"paramsBudgetsHint",
	"paramsAdoption",
	"paramsAdoptionHint",
	"paramsBehaviors",
	"paramsBehaviorsHint",
	"paramsWallZones",
	"paramsWallZonesHint",
	"paramsAuthorities",
	"paramsAuthoritiesHint",
	"paramsLinks",
	"paramsLinksHint",
	"paramsAnatomy",
	"paramsAnatomyHint",
	"paramsScreensTitle",
	"paramsScreensIntro",
	"specsTitle",
	"specsIntro",
	"specsGridHeading",
	"specsGridHint",
	"specsCellSelected",
	"specsCellClear",
	"specsListHeading",
	"specsFilterAll",
	"specsFilterIdeas",
	"specsFilterVersions",
	"specsFilterDeployed",
	"specsBadgeIdee",
	"specsBadgeKernel",
	"specsBadgeEnv",
	"specsScenarioLabel",
	"specsScenarioFormLabel",
	"specsMirrorGherkin",
	"specsMirrorProperty",
	"specsMirrorFixture",
	"specsMirrorScreen",
	"specsMirrorNone",
	"specsScenarioAutoLabel",
	"specsVersionLabel",
	"specsEmpty",
	"specsEmptyFiltered",
	"specsSeeGrid",
	"designTitle",
	"designIntro",
	"designLayersHeading",
	"designLayersHint",
	"designLayersEmpty",
	"designChildWeb",
	"designChildMobile",
	"designChildDesktop",
	"designComponentList",
	"designComponentButton",
	"designComponentField",
	"designAddField",
	"designAddAction",
	"designRemove",
	"designReorder",
	"designStructuralWall",
	"designSelect",
	"designSelected",
	"designStylePanel",
	"designStyleHint",
	"designTokenProperty",
	"designTokenValue",
	"designPreview",
	"designClearPreview",
	"designCapture",
	"designCaptureHint",
	"designStructuralHint",
	"designStructuralBtn",
	"designIframeTitle",
	"designNotDeployed",
	"designDeploy",
	"designNoSelection",
	"designWallNote",
	"designGroupColour",
	"designGroupTypography",
	"designGroupSpacing",
	"designGroupShape",
	"designGroupLayout",
	"designPropBg",
	"designPropText",
	"designPropBorder",
	"designPropRadius",
	"designPropPad",
	"designPropGap",
	"designPropAlign",
	"designPropSize",
	"designPropWeight",
	"designPropShadow",
	"designPropDensity",
	"designPropWidth",
	"designPropCols",
	"designDragHint",
	"designDragHandle",
	"designReorderWall",
	"designAssetsHeading",
	"designAssetsHint",
	"designAssetsColours",
	"designAssetsRadius",
	"designAssetsTypography",
	"designChatHeading",
	"designChatHint",
	"designChatPlaceholder",
	"designChatSend",
	"designChatBusy",
	"designChatStyling",
	"designChatStructural",
	"designChatWall",
	"designBranchHeading",
	"designBranchHint",
	"designBranchHead",
	"designBranchRoot",
	"designBranchSelected",
	"designBranchCreate",
	"designBranchFork",
	"designBranchRestore",
	"designBranchMerge",
	"designBranchWall",
	"instanceTitle",
	"instanceIntro",
	"instWorkbench",
	"instDb",
	"instMonitoring",
	"instTraefik",
	"instVscode",
	"instDocs",
	"instToolsHeading",
	"instStatusUp",
	"instStatusDown",
	"instStatusUnknown",
	"instProbing",
	"instDockerHeading",
	"instDockerHint",
	"instDockerEmpty",
	"instConfigHeading",
	"instConfigNote",
	"instSave",
	"instSaved",
	"envViewBtn",
	"envPreviewTitle",
	"envPreviewVersionLabel",
	"envPreviewEmpty",
	"envPreviewNoData",
	"envPreviewPagesLabel",
	"envPreviewRealApp",
	"envPreviewRealPipeline",
	"envPreviewClose",
	"stackApp",
	"stackApi",
	"stackDb",
	"stackCache",
	"stackWorkflows",
	"stackBus",
	"stackTelemetry",
	"stackDocs",
	"stackAuth",
	"stackErrors",
	"stackTickets",
	"stackGit",
	"stackConnectors",
	"instStackHeading",
	"instStackNote",
	"instStackLevel",
	"instStackUnprovisioned",
	"instLadderLabel",
	"instLadderHint",
	"instStackOverridesHeading",
	"instStackOverridesHint",
	"previewHeading",
	"previewTabWeb",
	"previewTabMobile",
	"previewTabDesktop",
	"previewEmpty",
	"previewNoPages",
	"previewIdeasLabel",
	"previewExpoNote",
	"previewDesktopNote",
	"previewUrlLabel",
	"envOpenBtn",
	"envDetailClose",
	"envTabApercu",
	"envTabDb",
	"envTabTelemetry",
	"envTabDocs",
	"envTabTickets",
	"envTabStack",
	"envDbEngineDoltgres",
	"envDbEnginePostgres",
	"envDbRestoreHeading",
	"envDbHistoryNote",
	"envServiceUrl",
	"envTelemetryLink",
	"envStackNote",
	"envStackV0Note",
	"envTabEmpty",
	"envBadgeCree",
	"envBadgeResolu",
	"envBadgeSpec",
	"envBadgeEbauche",
	"envBadgePublie",
] as const;

export default async function V3Layout({ children }: { children: ReactNode }) {
	const t = await getTranslations("v3");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	// LE PROJET ACTIF : le cookie → le record (fail-closed) ; sans cookie, le plus
	// récemment sauvé ; sans aucun projet, l'auto-création « Mon application » —
	// l'utilisateur atterrit TOUJOURS dans un projet persisté.
	const activeId = (await cookies()).get("aidos-v3-project")?.value ?? null;
	let initialProject =
		activeId !== null ? await loadProjectAction(activeId) : null;
	let projectList = await listProjectsAction();
	if (initialProject === null) {
		initialProject =
			projectList.length > 0
				? await loadProjectAction(projectList[0].id)
				: await createProjectAction("Mon application");
		projectList = await listProjectsAction();
	}

	// L'ÉCHELLE de l'instance : la config persistée (fail-closed) → ladderOf — une
	// DONNÉE injectée dans la provider (le rejeu et chaque lentille itèrent dessus).
	const instanceConfig = await loadInstanceConfigAction();
	const ladder = ladderOf(instanceConfig);

	// Next s'exécute depuis front/web ; le garde-fou couvre un lancement depuis la racine.
	const cwd = process.cwd();
	const absBase = cwd.endsWith(join("front", "web"))
		? cwd
		: join(cwd, "front", "web");

	// (a) L'INVENTAIRE des écrans V1 : les dossiers d'app/ (hors v2/v3, api et les dossiers
	// privés `_` non routables), TRIÉS — injectés en DONNÉES dans le twin (le registre V2
	// déclaré est toujours couvert par initBuilderState).
	const v1Screens: ScreenRef[] = readdirSync(join(absBase, "app"), {
		withFileTypes: true,
	})
		.filter(
			(e) =>
				e.isDirectory() &&
				e.name !== "v2" &&
				e.name !== "v3" &&
				e.name !== "api" &&
				!e.name.startsWith("_"),
		)
		.map((e) => ({ route: `/${e.name}`, label: e.name.replace(/-/g, " ") }))
		.sort((a, b) => (a.route < b.route ? -1 : 1));

	// Les LENTILLES V3 elles-mêmes sont des écrans atteignables (« ouvre l'écran v3
	// parcours ») — la même convention que la loi de couverture (lib/v3/coverage.test.ts).
	const v3Lenses: ScreenRef[] = readdirSync(join(absBase, "app", "v3"), {
		withFileTypes: true,
	})
		.filter((e) => e.isDirectory() && !e.name.startsWith("_"))
		.map((e) => ({ route: `/v3/${e.name}`, label: `v3 ${e.name}` }))
		.sort((a, b) => (a.route < b.route ? -1 : 1));

	// (b) Le GRAPHE DE CODE (le motif /v2/code) : extrait des twins lib/v2 RÉELS par l'API
	// compilateur TypeScript (code-extract, côté serveur seulement), trié.
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

	// La provider ENVELOPPE tout le shell (la nav lit le projet via useV3Session) et
	// est CLÉE par l'id : basculer de projet remonte la session — le rejeu repart à neuf.
	return (
		<V3SessionProvider
			key={initialProject?.id ?? "aucun-projet"}
			v1Screens={[...v1Screens, ...v3Lenses]}
			codeNodes={codeNodes}
			codeEdges={codeEdges}
			strings={strings}
			initialProject={initialProject}
			projectList={projectList}
			ladder={ladder}
			instanceConfig={instanceConfig}
		>
			<div
				data-testid="v3-shell"
				className="flex min-h-screen flex-col bg-background text-foreground sm:-ml-64 sm:flex-row"
			>
				<aside className="shrink-0 border-b border-border bg-card/40 p-3 sm:sticky sm:top-0 sm:h-screen sm:w-60 sm:border-b-0 sm:border-r">
					<V3Nav />
				</aside>
				<main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
			</div>
			{/* LA PALETTE ⌘K — montée DANS la provider (elle lit state.screens). */}
			<Palette />
		</V3SessionProvider>
	);
}
