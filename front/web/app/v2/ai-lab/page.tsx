import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NEED_SAMPLES } from "@/lib/v2/ai-lab";
import { AiLabClient } from "./AiLabClient";

/**
 * /v2/ai-lab — l'AI LAB « modèle corrigé » (étape WB2-15 ; ROADMAP-fke FK11, FKE-38 ; ADR 0010 · 0011).
 *
 * À GAUCHE le CERVEAU GAUCHE (le chat Claude, langage naturel) PLACE les specs sur la VERTICALE — chaque
 * morceau du besoin tombe à un (niveau × facette × paire). Le placement est GATÉ + VÉRIFIÉ (clampé à
 * l'espace déclaré 7 × 8 × 6) ; le mur tient (PROPOSE, jamais d'écriture-vérité) ; un FALLBACK
 * DÉTERMINISTE répond quand Claude est indisponible. Tout délégué au twin pur lib/v2/ai-lab.ts.
 *
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact : lecture + proposition.
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"homeTitle",
	"wallNote",
	"leftHeading",
	"leftHint",
	"inputLabel",
	"inputPlaceholder",
	"placeBtn",
	"fallbackBtn",
	"fallbackNote",
	"samplesHeading",
	"rightHeading",
	"rightHint",
	"levelsShort",
	"proposed",
	"validated",
	"realized",
	"descendBtn",
	"realizeBtn",
	"enrichToggle",
	"emptyHint",
	"spaceNote",
] as const;

export default async function V2AiLabScreen() {
	const t = await getTranslations("v2AiLab");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-ai-lab-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("homeTitle")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-ai-lab-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-ai-lab-subtitle"
					className="max-w-3xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
			</section>

			<AiLabClient samples={NEED_SAMPLES} t={strings} />
		</div>
	);
}
