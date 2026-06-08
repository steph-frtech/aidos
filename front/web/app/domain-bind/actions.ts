"use server";

import {
	type BindRequest,
	bind,
	isBlocked,
	isInjective,
	type Registry,
	servesHTTPS,
} from "@/lib/domainbind";
import type { DomainBindView } from "./view";

/**
 * Server Action for the /domain-bind Workbench panel (S97 — custom-domain binding + TLS + DNS,
 * app-builder EPIC 10, DP27 / ADR 0043).
 *
 * THE STEP (ROADMAP-app-builder S97): binder un domaine custom + certificats TLS + DNS pour
 * l'app déployée (comme le Workbench derrière Traefik, mais pour les apps émises), labels Traefik
 * posés par le provider Docker Pulumi. Done-criteria : un domaine appartient à EXACTEMENT UN
 * projet (DOMAIN_ALREADY_BOUND sinon) ; un domaine custom sert l'app en HTTPS ; le binding
 * domaine→projet est INJECTIF.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8) : bind + servesHTTPS + isInjective sont des fonctions PURES
 * de l'input (lib/domainbind) — même registre + requête → plan byte-identique, jamais un LLM. La
 * vérification d'injectivité et de service HTTPS sont des comparaisons pures (le code juge). THE
 * WALL (§2) : planifier n'écrit AUCUNE vérité ; enregistrer le binding comme décision DAG passe
 * par propose → ChangeSet → approbation, jamais une écriture directe.
 */

export async function bindDomainAction(
	_prev: DomainBindView,
	formData: FormData,
): Promise<DomainBindView> {
	const domain = String(formData.get("domain") ?? "").trim();
	const project = String(formData.get("project") ?? "").trim() || "shop";
	// Toggle: a registry where THIS domain is already bound to ANOTHER project — proves the
	// DOMAIN_ALREADY_BOUND refusal (the injectivity done-criteria).
	const conflict = formData.get("conflict") === "on";

	const reg: Registry = conflict
		? { bindings: [{ domain, project: "other-tenant" }] }
		: { bindings: [] };

	const req: BindRequest = {
		domain,
		project,
		deploySubdomain: "d-ab12cd34ef56",
		deployRoot: "deploy.aidos.app",
		serverService: `${project}-server`,
	};

	const plan = bind(reg, req);
	if (isBlocked(plan))
		return {
			ok: false,
			blockCode: plan.code,
			blockExplanation: plan.explanation,
		};

	// The Godog + property done-criteria, judged by CODE (the pure twin), never an agent: the
	// labels serve HTTPS, and the resulting registry (existing ∪ {new}) stays injective.
	const serves = servesHTTPS(plan);
	const injective = isInjective([
		...reg.bindings,
		{ domain: plan.domain, project: plan.project },
	]);

	return { ok: true, plan, servesHTTPS: serves, injective };
}
