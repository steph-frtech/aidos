package honoemit

// screendesign_apply.go — l'APPLICATION des ScreenOverride sur la FORME émise (la moitié render du
// Design Lab) + l'EMBED du runtime aidos-bridge dans les 3 enfants.
//
// DÉTERMINISME-FIRST (§6/§8). screenClassSuffix est une fonction PURE, TOTALE de (overrides, coord) :
// elle replie les StyleToken ADR-0010 de l'override matching en classes-token (le MÊME mapping
// property→prefix que StyleToken.className), triées canonique, jointes par un espace. AUCUN override
// matching → "" (la chaîne vide) → la classe émise est INCHANGÉE (anti-overwrite §9, byte-identité
// préservée — le miroir (c) le scelle). Le suffixe est appliqué à la classe data-aidos-* correspondante
// par chaque renderer (web/mobile/desktop), au point unique où le drift {view,screen,panel}→section,
// {col,field}→field, invoke→action est déjà normalisé en CoordKind.
//
// LE BRIDGE (ADR 0071, calque exact de exprTwinSource / aidos-expr.embed). aidosBridgeSource est le
// runtime aidos-bridge embarqué VERBATIM dans les 3 enfants (calque du //go:embed aidos-expr.embed.ts
// injecté par webemit_render.go:26). Le front (front/web/lib/v3/design/aidos-bridge.embed.ts) le
// MIRROR byte-égal. Le bridge LIT les data-aidos-* DÉJÀ émis (pas d'injection de source — l'inversion
// d'Onlook), construit les coordonnées normalisées, fait le handshake postMessage et applique des
// preview optimistes (mutation de classes-token, JAMAIS la source).

import (
	_ "embed"
	"strings"
)

// aidosBridgeSource is the VERBATIM aidos-bridge runtime embedded into the three children (web/mobile/
// desktop) — the EXACT calque of exprTwinSource (the Expr twin embedded by webemit_render.go). It is
// embedded from front/web/lib/v3/design/aidos-bridge.embed.ts (the SINGLE source of the bridge, copied
// at build time). The const is EXPOSED via AidosBridgeSource so the front mirrors it byte-equal.
//
//go:embed aidos-bridge.embed.ts
var aidosBridgeSource string

// AidosBridgeSource returns the embedded aidos-bridge runtime source (the byte-stable string the three
// children ship and the front mirror compares against). PURE.
func AidosBridgeSource() string { return aidosBridgeSource }

// screenClassSuffix is the PURE, TOTAL render helper: given the resolved screen overrides and a
// coordinate, it returns the extra ADR-0010 token classes to APPEND to that coordinate's emitted
// className (a leading space + the space-joined token classes), or "" when no override matches the
// coordinate. The matching override's styles are already canonically sorted (sortedScreenOverrides);
// rendering them in that order keeps the bytes stable. NO match → "" → the className is unchanged
// (byte-identity preserved — the determinism + anti-overwrite contract). Never panics.
func screenClassSuffix(overrides []ScreenOverride, coord ScreenCoord) string {
	for _, o := range overrides {
		if o.Coord.coordKey() != coord.coordKey() {
			continue
		}
		if len(o.Styles) == 0 {
			return ""
		}
		var classes []string
		for _, s := range o.Styles {
			// Defensive: only render catalogue tokens (EmitScreenDesign already validated, but the
			// render path stays fail-closed — a non-catalogue token contributes no class, never a hex).
			if !IsKnownStyleToken(s) {
				continue
			}
			if c := s.className(); c != "" {
				classes = append(classes, c)
			}
		}
		if len(classes) == 0 {
			return ""
		}
		return " " + strings.Join(classes, " ")
	}
	return ""
}

// classBody strips the leading space screenClassSuffix prepends (it is built to APPEND to an existing
// className). When a coordinate has NO existing className (a new className attribute), the body is the
// suffix without its leading space. PRE: suffix != "". PURE.
func classBody(suffix string) string {
	return strings.TrimPrefix(suffix, " ")
}

// sectionCoord / fieldCoord / actionCoord build the NORMALISED coordinate for a section/field/action
// (the single point the {view,screen,panel}→section, {col,field}→field, invoke→action drift is
// reconciled on the emit side — the SAME normalisation the bridge applies on the read side). PURE.
func sectionCoord(entity string) ScreenCoord {
	return ScreenCoord{Kind: CoordSection, Entity: entity}
}

func fieldCoord(entity, field string) ScreenCoord {
	return ScreenCoord{Kind: CoordField, Entity: entity, Field: field}
}

func actionCoord(entity, control string) ScreenCoord {
	return ScreenCoord{Kind: CoordAction, Entity: entity, Control: control}
}
