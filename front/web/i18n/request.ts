import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

// Bilingue par défaut (ADR 0011) : français d'abord, anglais en seconde langue.
// Aucun préfixe de locale dans l'URL — la locale provient d'un cookie, donc les
// routes existantes (/contract, /store, …) restent intactes.
export const locales = ["fr", "en"] as const;
export const defaultLocale = "fr" as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
	const store = await cookies();
	const cookieLocale = store.get("NEXT_LOCALE")?.value;
	const locale: Locale = (locales as readonly string[]).includes(
		cookieLocale ?? "",
	)
		? (cookieLocale as Locale)
		: defaultLocale;

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
});
