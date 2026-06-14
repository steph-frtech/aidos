import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ENTITY_CASES } from "@/lib/v2/deploy";
import { DeployClient } from "./DeployClient";

/**
 * /v2/deploy — le déploiement : specs → app web → prod (étape WB2-22 ; AI Lab ; ADR 0052 · 0007 · 0010 ·
 * 0011 ; S96 ; CLAUDE.md §3 N5).
 *
 * À partir d'une source d'entité (la même que /v2/emetteurs émet), AIDOS PLANIFIE DÉTERMINISTIQUEMENT le
 * déploiement de l'app émise : l'empreinte de l'app, le plan de conteneurisation (postgres + le DDL émis +
 * l'app générique), la route Traefik (sous-domaine → URL live, cert Let's Encrypt) et l'aperçu live. Le
 * bouton est GATÉ (auth + rate-limit) — la parenthèse sécurité d'ADR 0052, fermée.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : le plan réutilise `emitView`/`appPreview` de WB2-21
 * (lib/v2/emetteurs.ts, lui-même ré-export byte-identique de S35). Tout délégué au twin pur lib/v2/deploy.ts.
 *
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact : déployer est une action SOUS
 * LA LIGNE (émettre + planifier le conteneur) — aucune écriture de vérité ; modifier une source PROPOSE → /goal.
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"homeTitle",
	"wallNote",
	"gateHeading",
	"gateHint",
	"authLabel",
	"authYes",
	"authNo",
	"rateLabel",
	"rateLimitLabel",
	"samplesHeading",
	"samplesHint",
	"caseOrder",
	"caseOrderChanged",
	"deployBtn",
	"reDeployBtn",
	"resetBtn",
	"pulumiBtn",
	"pulumiBtnHint",
	"pulumiBusy",
	"pulumiHeading",
	"pulumiHint",
	"pulumiTargetLabel",
	"pulumiUp",
	"pulumiError",
	"blockedHeading",
	"blockedHint",
	"howToFix",
	"planHeading",
	"planIdLabel",
	"appHashLabel",
	"sourceHashLabel",
	"urlHeading",
	"urlHint",
	"openLive",
	"servicesHeading",
	"servicesHint",
	"colService",
	"colImage",
	"colRole",
	"previewHeading",
	"previewHint",
	"previewTable",
	"previewPrimaryKey",
	"colColumn",
	"colSqlType",
	"colTsType",
	"colNullable",
	"colPrimaryKey",
	"yes",
	"no",
	"reDeployHeading",
	"reDeployHint",
	"reDeployRounds",
	"reDeployStable",
	"reDeployDrift",
	"empty",
	"proposeNote",
	"determinismNote",
] as const;

export default async function V2DeployScreen() {
	const t = await getTranslations("v2Deploy");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-deploy-back-home"
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
				data-testid="v2-deploy-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<DeployClient cases={ENTITY_CASES} t={strings} />

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("determinismNote")}
			</p>
		</div>
	);
}
