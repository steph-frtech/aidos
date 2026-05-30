# cdesign-expo

> **A Claude Code skill plugin that turns any design — Claude Design handoff, screenshot, HTML, or Figma — into production-ready Expo + NativeWind code.**

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Built on Skills](https://img.shields.io/badge/built%20on-Claude%20Skills-4f46e5)](https://docs.claude.com/en/docs/claude-code/skills)
[![Expo](https://img.shields.io/badge/Expo-SDK%2055%2B-000020?logo=expo)](https://expo.dev)
[![NativeWind](https://img.shields.io/badge/NativeWind-v4-38bdf8)](https://www.nativewind.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What this is

A Claude Code plugin that ships **one skill, three slash commands, and two subagents**. Drop in a design, get back code that ships.

- **Skill** — `expo-from-claude-design` (auto-fires when Claude sees a design in an Expo repo, no command needed)
- **Commands** — `/design-to-expo`, `/expo-screen`, `/expo-component`
- **Agents** — `expo-converter` (writes the code) + `expo-reviewer` (audits it before you see it)

Skills are Claude Code's new auto-trigger primitive. This plugin uses one. That means once it's installed, you don't *do* anything — paste a screenshot in an Expo repo and Claude already knows what to do.

## Why this exists

LLMs are great at converting `<div>` to `<View>`. They are bad at:

- knowing when to extract a component vs. leave it inline (this plugin enforces the "3+ occurrences" rule)
- swapping `space-x-4` for `gap-4`, `onClick` for `onPress`, `<img>` for `expo-image` — *every single time*, without forgetting
- adding `accessibilityLabel`, `accessibilityRole`, `testID`, `hitSlop` on every Pressable
- replacing CSS keyframes with Reanimated 3 instead of giving up
- wrapping in `SafeAreaView` + `ScrollView` with safe-area-context
- killing `style={{...}}` inline, hardcoded pixels, `any` types, `console.log`

This plugin codifies ~40 of those rules into a skill. Claude follows them or the reviewer agent blocks the output.

## 60-second tour

```bash
# 1. Install
git clone https://github.com/steph-frtech/cdesign-expo.git
cd cdesign-expo && bash install.sh   # Windows: .\install.ps1

# 2. Restart Claude Code in any Expo project, then:
/design-to-expo cd_abc123xyz                       # Claude Design bundle
/design-to-expo https://figma.com/design/...       # Figma frame
/design-to-expo                                    # (then paste a screenshot)
/expo-screen profile                               # fast path, skip brainstorm
/expo-component "primary button with leading icon" Button
```

Or just paste a screenshot and say *"transforme ce design"* — the skill self-activates.

## What you get back

Not a single-file dump. A structured drop following Expo Router conventions:

```
app/
  _layout.tsx
  (tabs)/profile.tsx          ← route placed correctly
components/
  ui/button.tsx               ← extracted because 4× repeats
  card.tsx                    ← extracted because 6× repeats
  typography.tsx              ← extracted because 9× text-style repeats
constants/
  palette.ts                  ← typed tokens
hooks/
  use-rotating-index.ts       ← extracted because shared by 2 callers
```

Every file passes a 12-point quality gate before the reviewer signs off:

- [x] every `Pressable` has `accessibilityLabel` + `accessibilityRole`
- [x] every interactive element has a stable `testID`
- [x] loading / empty / error states are wired
- [x] `FlatList` has `keyExtractor` (never index)
- [x] no `console.log`, no `any`, no hover/cursor/space-x classes
- [x] no `<div>` / `<button>` / `<a>` / `<img>` leaked
- [x] `expo-image` instead of `Image`, `LinearGradient` instead of CSS gradient
- [x] CSS keyframes replaced with Reanimated 3, not abandoned
- [x] colors come from theme tokens, not hex strings
- [x] strings live inside `<Text>` — yes, even the non-breaking-space ones
- [x] `SafeAreaView` + status bar configured
- [x] decorative elements marked `accessibilityElementsHidden`

See [`sample-output/`](sample-output/) for a worked example: 270-line multi-variant HTML landing page → 4-file Expo screen with extracted components, Reanimated breathing animation, and reviewer notes explaining every judgement call.

## How the three commands differ

| You want… | Use | What it does |
|---|---|---|
| A full feature (multi-screen flow, real data, edge cases) | `/design-to-expo` | brainstorm → spec → plan → TDD → implement → review |
| One screen, scope is obvious | `/expo-screen` | skips brainstorm, goes straight to plan → implement → review |
| A single reusable component | `/expo-component` | one-shot generate with quality gates, no orchestration |

`/design-to-expo` composes the [Superpowers](https://github.com/obra/superpowers) plugin's brainstorm/spec/plan/TDD/review skills around the code generation. That dependency is enforced — install Superpowers first.

## Install

**macOS / Linux / WSL**
```bash
git clone https://github.com/steph-frtech/cdesign-expo.git
cd cdesign-expo
bash install.sh
```

**Windows**
```powershell
git clone https://github.com/steph-frtech/cdesign-expo.git
cd cdesign-expo
.\install.ps1
```

The installer copies the plugin into `~/.claude/plugins/expo-design/` and registers it with Claude Code. Restart your Claude Code session and the skill + 3 commands appear.

### Requirements
- Claude Code ≥ 1.10
- The [Superpowers](https://github.com/obra/superpowers) plugin
- An Expo project with NativeWind v4 configured

### Project-side setup (one time)

Drop this in your Expo project's `CLAUDE.md` so the skill can read your stack:

```markdown
## Stack
- Expo SDK 55+ · React Native 0.82+ · React 19
- TypeScript strict · Expo Router · NativeWind v4

## Always
- pnpm typecheck && pnpm test before claiming done
- accessibilityLabel on all Pressable
- testID on interactive elements
- expo-image instead of Image
```

## What's inside

```
.claude-plugin/
  plugin.json              ← marketplace manifest
  marketplace.json
skills/
  expo-from-claude-design/
    SKILL.md               ← the 250-line ruleset Claude follows
commands/
  design-to-expo.md        ← full workflow command
  expo-screen.md           ← fast-path screen command
  expo-component.md        ← one-shot component command
agents/
  expo-converter.md        ← code-writing subagent
  expo-reviewer.md         ← audit subagent
sample-output/             ← worked end-to-end example
install.sh / install.ps1
```

## A real example, end to end

[`sample-output/INPUT.html`](sample-output/INPUT.html) is a 3-variant landing page with CSS gradients, SVG logos, three independent keyframe animations, and a rotating slideshow.

[`sample-output/sereine-expo/`](sample-output/sereine-expo/) is what the plugin produces:

- `LinearGradient` from `expo-linear-gradient` for the gradient backdrop
- `react-native-svg` for the logo
- Reanimated 3 with `useSharedValue` + `withRepeat(withTiming(...))` for the breathing animation
- A `useRotatingIndex` hook extracted because two call sites share the pattern
- `BreathingCircle` and `SereineWordmark` components extracted because the source uses them 3× each
- One blob-morph animation flagged as a TODO with a SVG-Path-via-Reanimated migration note (because RN can't animate CSS `border-radius` morphs — and the reviewer caught it)

[`sample-output/CONVERSION-NOTES.md`](sample-output/CONVERSION-NOTES.md) walks through every judgement call. Read it to see what the reviewer agent does.

## How it's different from prompting Claude yourself

You absolutely can ask Claude to "convert this HTML to React Native." You'll get something. The output will:

- inline `style={{ width: 200 }}` because Claude forgot you said NativeWind
- mix `space-x-*` and `gap-*` even though one of them doesn't work
- omit `accessibilityLabel` half the time
- give up on the keyframe and leave a `// TODO: animation` comment
- drop `SafeAreaView` because the source didn't mention it
- not extract the button that appears 6 times

This plugin removes those failure modes by making them part of the skill's instruction layer and by gating the output through a reviewer subagent. Same model, dramatically tighter output.

## Roadmap

- [ ] Figma REST integration so you can paste a node URL instead of an image
- [ ] Auto-detect when EAS Build is required (vs. Expo Go)
- [ ] Optional Tamagui / GluestackUI / shadcn-rn output paths
- [ ] Storybook story generation alongside each component
- [ ] Visual regression snapshot via `@storybook/test-runner`

Suggestions and issues welcome.

## Contributing

PRs to the skill rules, conversion mappings, or reviewer checks are very welcome — those are the most useful improvements. Drop a real input / expected-output pair under `sample-output/` to show what's broken.

## Star it

If this saves you an afternoon, star the repo. It's how others find it.

## License

MIT — see [LICENSE](LICENSE).

---

Built by [@steph-frtech](https://github.com/steph-frtech). Composes with [obra/superpowers](https://github.com/obra/superpowers).
