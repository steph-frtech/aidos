import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ENTITY_CASES } from "@/lib/v2/emetteurs";
import { EmetteursClient } from "./EmetteursClient";

/**
 * /v2/emetteurs — les émetteurs : l'émission DEPUIS les entités (étape WB2-21 ; S34/S35 ; CLAUDE.md §3 N3 ;
 * ADR 0007 · 0010 · 0011 ; KRD §23).
 *
 * À partir d'une source d'entité (nom + attributs ORDONNÉS, typés sur le jeu scalaire fermé), AIDOS rend
 * DÉTERMINISTIQUEMENT ses trois projections — le DDL Postgres (CREATE TABLE), le struct Go (sqlc) et le
 * type TypeScript — plus son CONTRAT (les champs que les trois cibles DOIVENT partager). Une seule source
 * → N projections, jamais doublement typée.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : le cœur émetteur est `emit`/`project` (réutilisé de S35
 * lib/entity-source.ts, lui-même miroir byte-identique du Go back/kernel/entities). Tout délégué au twin
 * pur lib/v2/emetteurs.ts.
 *
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact : lecture + projection —
 * modifier une source PROPOSE → /goal, jamais une écriture directe.
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"homeTitle",
	"wallNote",
	"samplesHeading",
	"samplesHint",
	"caseOrder",
	"caseOrderChanged",
	"emitBtn",
	"reEmitBtn",
	"resetBtn",
	"sourceHashLabel",
	"contractHeading",
	"contractHint",
	"targetsHeading",
	"colTarget",
	"colPath",
	"colOutputHash",
	"reEmitHeading",
	"reEmitHint",
	"reEmitRounds",
	"reEmitStable",
	"reEmitDrift",
	"reEmitAllStable",
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
	"empty",
	"proposeNote",
	"determinismNote",
] as const;

export default async function V2EmetteursScreen() {
	const t = await getTranslations("v2Emetteurs");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-emetteurs-back-home"
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
				data-testid="v2-emetteurs-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<EmetteursClient cases={ENTITY_CASES} t={strings} />

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("determinismNote")}
			</p>
		</div>
	);
}
