"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const LOCALES = ["fr", "en"] as const;
const LABEL: Record<(typeof LOCALES)[number], string> = { fr: "FR", en: "EN" };

/**
 * Bascule de langue (ADR 0011). Pose le cookie NEXT_LOCALE — pas de changement
 * d'URL — puis rafraîchit pour relire les messages côté serveur. Français par défaut.
 */
export function LanguageSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function select(next: string) {
		document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;samesite=lax`;
		startTransition(() => router.refresh());
	}

	return (
		<div
			className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 text-xs"
			role="group"
			aria-label="Langue"
		>
			{LOCALES.map((l) => (
				<button
					key={l}
					type="button"
					onClick={() => select(l)}
					disabled={pending}
					aria-pressed={locale === l}
					className={
						locale === l
							? "rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground"
							: "rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
					}
				>
					{LABEL[l]}
				</button>
			))}
		</div>
	);
}
