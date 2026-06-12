"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENTRIES } from "./V3Nav";
import { useV3Session } from "./V3Session";

/**
 * LA PALETTE DE COMMANDES V3 (le mandat « tous les écrans au meilleur endroit ») :
 * ⌘K / Ctrl+K ouvre une modale centrée — les HUIT lentilles V3 d'abord, puis TOUS
 * les écrans atteignables de la session (state.screens — le même inventaire que
 * « ouvre l'écran… »), filtrés par une recherche à ACCENTS PLIÉS. Entrée ouvre le
 * premier résultat, un clic ouvre le sien, Échap ferme.
 *
 * DÉTERMINISME-FIRST (§6) : le filtrage est un pli d'accents + un `includes` — un
 * algorithme pur, jamais un prompt. LE MUR (§2) : la palette NAVIGUE (router.push),
 * elle n'écrit rien.
 */

/** L'événement DOM que le bouton du pied de nav dispatche pour ouvrir la palette. */
export const PALETTE_OPEN_EVENT = "aidos:v3-palette-open";

/** Le pli d'accents déterministe (le même motif que le twin) : « Paramètres » ≈ « parametres ». */
function fold(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Une entrée de la palette : une route + son libellé amical. */
interface PaletteItem {
	readonly route: string;
	readonly label: string;
}

/** Le plafond DÉCLARÉ de résultats affichés (jamais appris). */
const MAX_RESULTS = 12;

export function Palette() {
	const router = useRouter();
	const { state, strings: t } = useV3Session();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// ── les candidats : les 8 lentilles V3 D'ABORD, puis les écrans de la session
	// (dédoublonnés — le layout injecte aussi les lentilles dans state.screens). ──
	const results = useMemo<PaletteItem[]>(() => {
		const lenses: PaletteItem[] = ENTRIES.map((e) => ({
			route: e.route,
			label: t[e.key] ?? e.route,
		}));
		const lensRoutes = new Set(lenses.map((l) => l.route));
		const screens: PaletteItem[] = state.screens
			.filter((s) => !lensRoutes.has(s.route))
			.map((s) => ({ route: s.route, label: s.label }));
		const q = fold(query.trim());
		const match = (i: PaletteItem) =>
			q === "" || fold(i.label).includes(q) || fold(i.route).includes(q);
		return [...lenses.filter(match), ...screens.filter(match)].slice(
			0,
			MAX_RESULTS,
		);
	}, [state.screens, t, query]);

	/** FERME et réinitialise la recherche (le prochain ⌘K repart à neuf). */
	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
	}, []);

	/** OUVRE un écran : la palette NAVIGUE puis se ferme — elle n'écrit rien. */
	const go = useCallback(
		(route: string) => {
			close();
			router.push(route);
		},
		[close, router],
	);

	// ⌘K / Ctrl+K bascule, Échap ferme — et le bouton du pied de nav (l'événement DOM).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((o) => !o);
				setQuery("");
				return;
			}
			if (e.key === "Escape") close();
		};
		const onOpen = () => setOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener(PALETTE_OPEN_EVENT, onOpen);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener(PALETTE_OPEN_EVENT, onOpen);
		};
	}, [close]);

	// La saisie reçoit le focus dès l'ouverture.
	useEffect(() => {
		if (open) inputRef.current?.focus();
	}, [open]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
			{/* Le FOND est un vrai bouton (a11y) : cliquer à côté ferme la palette. */}
			<button
				type="button"
				aria-label={t.parcoursPanelClose}
				onClick={close}
				className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-sm"
			/>
			<div
				data-testid="v3-palette"
				role="dialog"
				aria-modal="true"
				aria-label={t.paletteOpen}
				className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg"
			>
				<input
					ref={inputRef}
					data-testid="v3-palette-input"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && results.length > 0) {
							e.preventDefault();
							go(results[0].route);
						}
						if (e.key === "Escape") close();
					}}
					placeholder={t.palettePlaceholder}
					aria-label={t.paletteOpen}
					className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				/>
				<ul className="max-h-80 overflow-y-auto p-2">
					{results.length === 0 ? (
						<li className="px-2 py-3 text-sm text-muted-foreground italic">
							{t.paletteEmpty}
						</li>
					) : (
						results.map((r) => (
							<li key={r.route}>
								<button
									type="button"
									data-testid="v3-palette-item"
									data-route={r.route}
									onClick={() => go(r.route)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
								>
									<span className="min-w-0 flex-1 truncate">{r.label}</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										{r.route}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			</div>
		</div>
	);
}
