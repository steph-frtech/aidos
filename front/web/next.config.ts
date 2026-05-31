import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Bilingue par défaut (ADR 0011) via next-intl, sans routage de locale dans l'URL :
// la locale vient d'un cookie, donc les routes restent inchangées (/contract, /store…).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
