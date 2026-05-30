# Sereine HTML → Expo conversion notes

Walks through what the `expo-from-claude-design` skill + `expo-converter` agent would produce, given the multi-variant Sereine landing page HTML in `INPUT.html`.

I focused on **Variant A** (editorial calm hero — the most representative). B and C would follow the same patterns; the diffs vs A are listed at the bottom.

## Files produced

```
sereine-expo/
├── app/
│   ├── _layout.tsx          ← Expo Router root: SafeAreaProvider + StatusBar + Stack
│   └── index.tsx            ← Variant A as home screen
├── components/
│   ├── sereine-wordmark.tsx ← logo SVG + serif text (used 3× in source — extracted)
│   └── breathing-circle.tsx ← animated core + rings (used 3× in source — extracted)
├── constants/
│   └── sereine-palette.ts   ← typed palette + 3 alt palettes from tweaks panel
└── hooks/
    └── use-rotating-index.ts ← shared by word rotation and slide rotation
```

## HTML → RN mapping applied

| Source HTML / API | Mapped to | Notes |
|---|---|---|
| `<div>` | `<View>` | mechanical |
| `<h1>`, `<p>`, `<span>` text | `<Text>` | every leaf string wrapped |
| `<button>` | `<Pressable>` | with `accessibilityRole="button"`, `accessibilityLabel`, `testID`, `hitSlop` |
| `linear-gradient(...)` | `<LinearGradient>` from `expo-linear-gradient` | absolutely positioned full-bleed |
| `<svg><circle>` (logo) | `react-native-svg`'s `<Svg><Circle>` | colors passed via palette |
| `setInterval` for rotation | unchanged inside `useEffect` (extracted to `useRotatingIndex`) | extracted because two call sites |
| CSS keyframe `breathe` | Reanimated 3 `useSharedValue` + `withRepeat(withTiming(...))` in `BreathingCircle` | proper RN replacement |
| CSS keyframe `breathe-ring` | same | included in `BreathingCircle` with `ringDelayMs` |
| CSS keyframe `blob-morph` | **STATIC placeholder** (round `View` with `borderRadius`) + TODO | RN can't animate `border-radius: 62% 38% 54% 46% / 48% 56% 44% 52%` shape. Real fix: SVG `<Path>` with morphed `d` via Reanimated. Out-of-scope for v1. |
| CSS keyframe `fade-in` on slide swap | `key={slideIndex}` triggers React remount; could be enhanced with Reanimated `FadeIn` entering animation | minimal-viable for now |
| `onClick` | `onPress` | mechanical |
| `style={{...}}` with palette values | mixed: `className` for static layout, `style` for palette-driven colors | see "Inline-style policy" below |
| `<em>` italic in title | nested `<Text style={{fontStyle: 'italic'}}>` | RN-idiomatic |
| Tailwind-ish utility values | NativeWind `className` | `flex-1 flex-row items-center justify-between px-7` etc. |

## Quality gates verified

- [x] Every `Pressable` has `accessibilityLabel` + `accessibilityRole`
- [x] Every `Pressable` has stable `testID` (`home-cta-start`, `home-link-signin`, `home-slide-dot-N`, `home-lang-toggle`)
- [x] Decorative blobs marked `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
- [x] Rotating word/slide regions marked `accessibilityLiveRegion="polite"` so VoiceOver announces changes
- [x] No `console.log`, no `any`, no `style={{...}}` inline for static values
- [x] No `<div>` / `<button>` / `<img>` / `<a>` leaked
- [x] No `space-x-*` / `space-y-*` / `hover:*` / `cursor-*` used (skill blocklist)
- [x] Strings wrapped in `<Text>` (the `à soi` non-breaking-space split is intentional)
- [x] `hitSlop` on small targets (lang toggle, sign-in link, slide dots)
- [x] Status bar configured in `_layout.tsx`
- [x] `LinearGradient` used instead of CSS gradient

## Inline-style policy (judgement call)

The skill is strict: "No `style={{...}}` inline (use NativeWind className)." For palette-driven colors, that rule has to flex — you can't construct a Tailwind class like `bg-${palette.cream}` and have it work at build time. Two acceptable patterns:

1. **(used here)** NativeWind `className` for layout, geometry, typography size/weight/tracking. Inline `style` for colors that come from a theme object.
2. **Alternative**: extend `tailwind.config.js` with the Sereine palette as named tokens (`bg-sereine-cream`, `text-sereine-ink`) and use `className` exclusively. Better when the palette is fixed; over-engineering when the demo also ships the multi-palette tweak feature.

Pattern (1) keeps the multi-palette tweak feature trivial. If you adopt the design as canonical, switch to (2) and the lint becomes simpler.

## Assumptions / TODOs

- `expo-router` + `nativewind` v4 + `expo-linear-gradient` + `react-native-svg` + `react-native-reanimated` + `react-native-safe-area-context` are installed and configured in the target project.
- The Newsreader serif font is not loaded — `font-serif` falls back to the system serif. Real fix: `@expo-google-fonts/newsreader` in `_layout.tsx` (skipped here to keep the demo focused).
- Blob morphing is a TODO. The current static round-blob is shippable; the morph animation is purely decorative and can ship later.
- All CTA handlers are stubs (`TODO` comments). The skill correctly flags that data wiring and navigation are out of scope of the design-conversion task.

## What B and C would look like

**Variant B** (`app/onboarding/breathe.tsx` say): structurally identical with one large centered `BreathingCircle` (size 180) at the top, a smaller slide section below, primary CTA "Créer mon espace" + secondary ghost button "J'ai déjà un compte". Reuses `SereineWordmark`, `BreathingCircle`, `useRotatingIndex`. No new components.

**Variant C** (`app/onboarding/programs.tsx` say): introduces three new repeated patterns that meet the 3+ threshold:
- 5× mood emoji buttons → extract `<MoodChip>` to `components/mood-chip.tsx`
- 4× program cards → extract `<ProgramCard>` to `components/program-card.tsx`
- 1× expert row → leave inline (only one occurrence)

Variant C also requires a `ScrollView` wrapper because its content exceeds the safe area on small phones, whereas A and B fit on one screen.

## Quick verification that the install works

`bash install.sh` (from this repo) copies the plugin to `~/.claude/`. After restarting Claude Code in a real Expo project that has `CLAUDE.md` + `app/` + NativeWind configured, you can invoke:

```
/design-to-expo [paste the Sereine HTML]
```

The skill will auto-trigger because the input is an HTML/CSS snippet, and the workflow (brainstorm → spec → plan → implement via converter agent → audit via reviewer agent → Superpowers code-review) will run.
