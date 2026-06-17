import type { ReactNode } from "react";
import { V2Header } from "./V2Header";
import { V2LegacyBanner } from "./V2LegacyBanner";
import { V2Nav } from "./V2Nav";

/**
 * Le layout du groupe de routes /v2 (Workbench V2, étape WB2-00 ; ADR 0010 · 0011 · 0053).
 *
 * Le SHELL V2 : en-tête V2 en haut, nav par concept (issue du glossaire) à gauche, contenu à
 * droite. Distinct des routes actuelles (gardées) — aucune route V1 n'est touchée. Le layout
 * racine pousse le `<body>` de `sm:pl-64` pour la barre V1 fixe ; la V2 ayant SA propre nav, on
 * récupère cette gouttière avec `sm:-ml-64` afin que le shell V2 occupe toute la largeur.
 *
 * Themed (tokens shadcn, jamais de couleur en dur) + bilingue (next-intl, FR par défaut).
 * Le mur intact : ce shell n'écrit aucune vérité.
 */
export default function V2Layout({ children }: { children: ReactNode }) {
	return (
		<div
			data-testid="v2-shell"
			className="flex min-h-screen flex-col bg-background text-foreground sm:-ml-64"
		>
			<V2LegacyBanner />
			<V2Header />
			<div className="flex flex-1 flex-col sm:flex-row">
				<aside className="shrink-0 border-b border-border bg-card/40 p-3 sm:w-64 sm:border-b-0 sm:border-r">
					<V2Nav />
				</aside>
				<main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10">
					{children}
				</main>
			</div>
		</div>
	);
}
