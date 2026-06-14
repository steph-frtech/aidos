"use server";

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import {
	INSTANCE_TOOLS,
	type InstanceConfig,
	parseInstanceConfig,
	serializeInstanceConfig,
} from "@/lib/v3/instance";

/**
 * /v3/instance — la couche IMPURE du twin lib/v3/instance (ADR 0062) : lire/écrire
 * le fichier de config et SONDER les outils déclarés. Tout le jugement (le jeu
 * d'outils, le parse fail-closed, la sérialisation canonique) reste dans le twin
 * pur ; ici, seulement le fs, le réseau et docker. LE MUR (§2) : la config décrit
 * VOTRE instance (cloud ou locale) — aucune écriture-vérité, jamais.
 */

/** Le fichier de config persisté (gitignoré à la racine du dépôt). */
const CONFIG_FILE = "/data/dev/aidos/.aidos-instance.json";

/**
 * Les URLs de SONDE — une table DÉCLARÉE, jamais devinée : depuis le serveur, les
 * domaines publics sagedesk.fr ne se résolvent pas en local (pas de hairpin) — on
 * sonde l'adresse LOCALE équivalente. Un outil ABSENT d'ici (traefik, monitoring)
 * est sondé sur son URL configurée telle quelle. vscode répond 403 sans token :
 * une réponse HTTP est une réponse — VIVANT.
 */
const PROBE_URLS: Readonly<Record<string, string>> = {
	workbench: "http://localhost:3000",
	vscode: "http://172.17.0.1:3320",
	shop: "http://172.17.0.1:3110",
	docs: "https://aidos.mintlify.app",
};

/** Les conteneurs CONNUS de l'instance (l'éditeur live + la boutique démo émise). */
const KNOWN_CONTAINERS = /^(aidos-vscode|alphashop-)/;

export type ProbeStatus = "up" | "down" | "unknown";

/** Le verdict de sonde d'UN outil (clé du twin → état + code HTTP observé). */
export type ProbeResult = {
	key: string;
	status: ProbeStatus;
	httpCode: number | null;
};

/** Un conteneur docker vu par `docker ps` (nom + statut, tels quels). */
export type DockerContainer = { name: string; status: string };

/** CHARGE la config persistée — fail-closed : fichier absent ou bruité → les défauts. */
export async function loadInstanceConfigAction(): Promise<InstanceConfig> {
	try {
		return parseInstanceConfig(readFileSync(CONFIG_FILE, "utf8"));
	} catch {
		return parseInstanceConfig("");
	}
}

/**
 * SAUVE la config — l'entrée repasse par le parse TOTAL du twin (clés inconnues
 * ignorées, valeur non-textuelle → les défauts) puis la sérialisation canonique :
 * le fichier ne contient JAMAIS autre chose qu'un aller-retour sans perte.
 */
export async function saveInstanceConfigAction(
	cfg: Readonly<Record<string, string>>,
): Promise<void> {
	const clean = parseInstanceConfig(JSON.stringify(cfg));
	writeFileSync(CONFIG_FILE, serializeInstanceConfig(clean), "utf8");
}

/** Sonde UNE URL : toute réponse HTTP = VIVANT (403 compris) ; échec réseau = down. */
async function probeOne(
	url: string,
): Promise<{ status: ProbeStatus; httpCode: number | null }> {
	if (!/^https?:\/\//.test(url)) return { status: "unknown", httpCode: null };
	// HEAD d'abord (léger) ; certains serveurs coupent la connexion sur HEAD → GET.
	for (const method of ["HEAD", "GET"] as const) {
		try {
			const res = await fetch(url, {
				method,
				cache: "no-store",
				redirect: "manual",
				signal: AbortSignal.timeout(3000),
			});
			return { status: "up", httpCode: res.status };
		} catch {
			// on retente avec la méthode suivante ; après GET, c'est down.
		}
	}
	return { status: "down", httpCode: null };
}

/** SONDE tous les outils déclarés `probe: true` (en parallèle, 3 s chacun max). */
export async function probeInstanceAction(): Promise<ProbeResult[]> {
	const cfg = await loadInstanceConfigAction();
	return Promise.all(
		INSTANCE_TOOLS.filter((t) => t.probe).map(async (t) => {
			const r = await probeOne(PROBE_URLS[t.key] ?? cfg[t.key] ?? "");
			return { key: t.key, ...r };
		}),
	);
}

const run = promisify(execFile);

/**
 * LISTE les conteneurs docker DU PROJET COURANT (`docker ps --format json` = une ligne
 * JSON par conteneur, clés `Names`/`Status`) — fail-closed : docker absent ou bruit → [].
 * Avec un projectSlug, ne renvoie QUE les conteneurs `<slug>-…` (la stack de CE projet,
 * tous environnements : <slug>-dev-*, <slug>-staging-*…) — « ne voir que les conteneurs
 * associés au projet ». Sans slug (compat), retombe sur le jeu connu de l'instance.
 */
export async function dockerPsAction(
	projectSlug?: string,
): Promise<DockerContainer[]> {
	const slug = (projectSlug ?? "").trim();
	const matches = (name: string): boolean =>
		slug !== "" ? name.startsWith(`${slug}-`) : KNOWN_CONTAINERS.test(name);
	try {
		const { stdout } = await run("docker", ["ps", "--format", "json"], {
			timeout: 5000,
		});
		return stdout
			.split("\n")
			.filter((l) => l.trim() !== "")
			.flatMap((l) => {
				try {
					const o = JSON.parse(l) as Record<string, unknown>;
					const name = typeof o.Names === "string" ? o.Names : "";
					const status = typeof o.Status === "string" ? o.Status : "";
					return matches(name) ? [{ name, status }] : [];
				} catch {
					return [];
				}
			});
	} catch {
		return [];
	}
}
