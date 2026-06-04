package agentimpl

// systemprompt.go — BA04: the DETERMINISTIC SystemPrompt assembly.
//
// AssembleSystemPrompt is a PURE TEMPLATE over the ONLY declared fields of an
// AgentImplementation: Role, Objectif, StopConditions, the wall boundary in prose,
// ForbiddenPaths verbatim, AllowedPaths verbatim. It is NEVER hand-authored — a
// hand-written agent prompt is a determinism gap (CLAUDE.md §6/§8) that blocks the
// step. Same input ⇒ same output (no clock, no rng, no I/O); the reproducibility
// mirror (systemprompt_property_test.go) pins that.
//
// DEFENCE IN DEPTH (the wall, CLAUDE.md §2). The wall lives at THREE levels: in the
// PreToolUse hook (deny-list), in the Postgres GRANTs (no write grant on truth), and
// HERE in the prompt (soft level). The template ALWAYS emits the full
// WallForbiddenPaths set verbatim, regardless of the layer — the kernel/mirrors
// zones can never be omitted from the prompt.
//
// FIELD DISCIPLINE. ONLY these fields feed the template: Role, Objectif,
// StopConditions, AllowedPaths, ForbiddenPaths. No knob (Seed/Temperature/MaxTurns/
// MaxConcurrency/ResourceLimits), no resolved binding (Tools/Skills/Hooks), no
// credential, no LayerRef leaks into the prose — the property mirror perturbs all of
// them and asserts the prompt is unchanged.

import "strings"

// AssembleSystemPrompt renders the deterministic system prompt for a projected
// AgentImplementation. PURE/TOTAL: a nil/empty StopConditions or AllowedPaths renders
// a stable "(none)" marker rather than an empty section, so the output is always
// well-formed and byte-stable.
func AssembleSystemPrompt(impl AgentImplementation) string {
	var b strings.Builder

	// Header — fixed prose (never an LLM, never hand-edited at runtime).
	b.WriteString("# AIDOS Build-Agent — System Prompt (assembled, deterministic)\n")
	b.WriteString("\n")
	b.WriteString("Vous êtes une couche gouvernée d'AIDOS : vous proposez, exécutez, explorez ; ")
	b.WriteString("vous ne déclarez jamais seul ce qui est vrai. Ce prompt est ASSEMBLÉ ")
	b.WriteString("déterministiquement à partir des seuls champs déclarés de votre couche — ")
	b.WriteString("il n'est jamais écrit à la main.\n")
	b.WriteString("\n")

	// Role (declared field).
	b.WriteString("## Rôle\n")
	b.WriteString(line(impl.Role))
	b.WriteString("\n")

	// Objectif (declared field).
	b.WriteString("## Objectif\n")
	b.WriteString(line(impl.Objectif))
	b.WriteString("\n")

	// StopConditions (declared field).
	b.WriteString("## Conditions d'arrêt\n")
	b.WriteString(bulletList(impl.StopConditions))
	b.WriteString("\n")

	// The wall, in prose + the forbidden zones VERBATIM (defence in depth, level 3).
	b.WriteString("## Le mur — vous n'écrivez JAMAIS la vérité\n")
	b.WriteString("Les zones suivantes sont AU-DESSUS de la ligne (le noyau, les miroirs, la fitness). ")
	b.WriteString("Elles sont interdites en écriture : la seule porte est idée → miroir → /goal → approbation humaine. ")
	b.WriteString("Cette interdiction est aussi appliquée par le hook PreToolUse et par les GRANTs Postgres (défense en profondeur).\n")
	b.WriteString("Zones interdites (verbatim) :\n")
	b.WriteString(bulletList(impl.ForbiddenPaths))
	b.WriteString("\n")

	// AllowedPaths VERBATIM.
	b.WriteString("## Chemins autorisés en écriture (verbatim)\n")
	b.WriteString("Vous n'écrivez QUE dans ces préfixes (allow-list, fail-closed) :\n")
	b.WriteString(bulletList(impl.AllowedPaths))

	return b.String()
}

// line renders a single declared value on its own line, with a stable "(none)"
// marker when empty — the template is total.
func line(v string) string {
	if strings.TrimSpace(v) == "" {
		return "(non déclaré)\n"
	}
	return v + "\n"
}

// bulletList renders a slice as a deterministic markdown bullet list, verbatim, with a
// stable "(aucun)" marker when empty. The order is the projection's order (already
// normalized/sorted by the emitter) — the template never re-sorts, so it is a pure
// function of its input.
func bulletList(items []string) string {
	if len(items) == 0 {
		return "- (aucun)\n"
	}
	var b strings.Builder
	for _, it := range items {
		b.WriteString("- ")
		b.WriteString(it)
		b.WriteString("\n")
	}
	return b.String()
}
