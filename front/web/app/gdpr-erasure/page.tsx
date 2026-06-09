import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ErasurePanel } from "@/components/ErasurePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// S116 — GDPR EXPORT & ERASURE on the append-only truth-store (les droits des personnes).
// Determinism-first: chaque op est calculée par le twin PUR de back/runtime/erasure
// (lib/erasure.ts), couvert par fast-check (lib/erasure.test.ts) ancré sur les fixtures Go.
// Le panel re-joue le MÊME twin → chaque op est atteignable ET exécutable depuis l'écran
// (ui-completeness) : exporter toutes les données d'une personne (Art. 20), supprimer sa PII
// par crypto-shredding/tombstone (Art. 17 — la clé détruite, la structure append-only
// préservée, le hash de phase INVARIANT, la décision enregistrée §9), lire le hash de phase
// avant/après (la preuve d'intégrité append-only), scanner si une requête renvoie encore la
// PII (cross-projet & cross-plan). Deux plans : le compte AIDOS (suppression dure, au-delà du
// soft-delete S53) et les utilisateurs de l'app émise (la policy « tout PII oubliable » de
// S103 rendue concrète). Le mur (CLAUDE.md §2) : tout est une VALEUR ; l'atterrissage des
// lignes tombstone est une écriture archive sous la ligne, jamais le kernel. Themed (ADR
// 0010), bilingue (ADR 0011).

export const metadata: Metadata = {
	title:
		"GDPR — export & suppression (append-only réconcilié avec l'effacement) | AIDOS Workbench",
	description:
		"S116 : les droits des personnes sur le truth-store append-only — EXPORT (Art. 20, tout est rendu) et SUPPRESSION (Art. 17) par crypto-shredding/tombstone (la clé/PII détruite, la structure append-only préservée, le hash de phase reste valide), décision enregistrée. Deux plans : suppression dure d'un compte AIDOS + toutes les données de ses projets ; droits des utilisateurs de l'app émise (« tout PII oubliable » de S103). Sélection = requête déterministe scopée ; après suppression aucune requête ne renvoie la PII, cross-projet & cross-plan.",
};

export default async function GdprErasurePage() {
	const store = await cookies();
	const locale = store.get("NEXT_LOCALE")?.value === "en" ? "en" : "fr";
	return (
		<div className="min-h-screen bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto max-w-5xl px-6 py-10">
				<ErasurePanel locale={locale} />
			</main>
		</div>
	);
}
