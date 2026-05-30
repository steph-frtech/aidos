---
description: Convert a Claude Design handoff or any design input into Expo React Native code, orchestrating Superpowers brainstorm → spec → plan → TDD → review
argument-hint: [bundle-id | url | "natural description"]
---

# /design-to-expo

Full workflow command: converts a design (Claude Design bundle, image, HTML, or text description) into production-ready Expo code by orchestrating Superpowers methodology + the `expo-from-claude-design` skill.

## Input

The user can provide:
- A Claude Design bundle ID (e.g. `cd_abc123xyz`)
- A claude.ai/design URL
- A pasted image (drag & drop)
- An HTML/CSS code snippet
- A Figma URL
- A plain text description of the UI

If $ARGUMENTS is empty, ask the user what they want to design.

## Orchestrated workflow

Execute these steps IN ORDER. Do NOT skip phases — that defeats the purpose of using Superpowers.

### Phase 0 — Detect context

1. Read `CLAUDE.md` at the project root
2. Verify this is an Expo project (check `package.json` for `expo` dependency, presence of `app/` directory)
3. Verify NativeWind is configured (check `tailwind.config.js` and `metro.config.js`)
4. If any verification fails, STOP and tell the user what's missing

### Phase 1 — Brainstorm (use Superpowers brainstorming skill)

Activate the `brainstorming` skill from Superpowers. Ask the user clarifying questions:

1. **Scope**: Is this a single screen, a flow with multiple screens, or just a component?
2. **Navigation**: Where does this screen sit in the app? (tab? modal? auth flow?)
3. **Data**: Is the data hardcoded for now, mocked, or wired to a real backend (Supabase, API)?
4. **State**: Local state only, or shared across screens? (which state manager?)
5. **Interactions**: List the user interactions and what each should do
6. **Edge cases**: How should loading, empty, and error states behave?
7. **Platform**: Any iOS-specific or Android-specific behaviors required?
8. **Accessibility**: Any specific a11y requirements (VoiceOver, large text)?

Save the result to `.superpowers/designs/<screen-name>-design.md`.

### Phase 2 — Spec (use Superpowers writing-spec skill)

Generate a `.superpowers/specs/<screen-name>.md` with:

```markdown
## Goal
[One sentence]

## Out of scope
- [Explicitly listed]

## Acceptance criteria
- [ ] [Verifiable criterion 1]
- [ ] [Verifiable criterion 2]
- [ ] ...

## Non-functional requirements
- Accessibility: VoiceOver-compatible, dynamic text sizing
- Performance: <16ms render on mid-range Android
- Platform: iOS 15+, Android 8+
```

Show the spec to the user. Wait for validation before proceeding.

### Phase 3 — Plan (use Superpowers writing-plans skill)

Decompose into tasks of 2-5 minutes each. Typical task breakdown for a screen:

```
1. Create file at app/<route>.tsx with skeleton
2. Build top-level layout (SafeArea + ScrollView/FlatList)
3. Build Header component (extract if reused)
4. Build content section A
5. Build content section B
6. Wire navigation links
7. Add loading state
8. Add error state
9. Add empty state
10. Add accessibility labels
11. Write unit test for non-trivial component
12. Run typecheck + lint
```

### Phase 4 — Implement (use the expo-from-claude-design skill)

For EACH task in the plan:

1. Read the relevant section of the input (image, HTML, Claude Design bundle data)
2. Apply the HTML→RN element mapping from the skill
3. Apply the CSS→NativeWind class mapping
4. Extract reusable components when pattern repeats 3+ times
5. Place files according to Expo Router conventions

If the task involves non-trivial logic (form validation, data fetching, complex state):
- Delegate to the `expo-converter` agent for the conversion
- Use TDD: write the test first via Superpowers' tdd skill

### Phase 5 — Quality gates

Before declaring done, the `expo-reviewer` agent MUST verify:

- All Pressable have accessibilityLabel
- All interactive elements have testID
- Loading, error, empty states handled
- No console.log, no `any` types
- FlatList items have stable keyExtractor
- All images have accessibilityLabel + contentFit
- Typecheck passes (`pnpm typecheck`)
- Lint passes (`pnpm lint`)
- Tests pass (`pnpm test`)

### Phase 6 — Code review (use Superpowers code-review skill)

Run Superpowers' `code-review` skill on the final output. Address blockers before commit.

### Phase 7 — Finalize

Propose a commit message in Conventional Commits format:

```
feat(<scope>): <what was added>

- <bullet 1>
- <bullet 2>

Implements design from <source>.
```

Wait for user approval before committing.

## Failure handling

- **No CLAUDE.md**: Ask user to provide one or generate a minimal one
- **No NativeWind**: Suggest install with `pnpm add nativewind && npx expo install react-native-reanimated`
- **Ambiguous input**: Do NOT guess; ask the user
- **Conflict with existing component**: Pause and confirm whether to extend or replace

## Examples

```
/design-to-expo cd_abc123
```
→ Fetches Claude Design bundle, runs full workflow

```
/design-to-expo [user pastes screenshot]
```
→ Vision analysis of the image, runs full workflow

```
/design-to-expo "Profile screen with avatar, name, stats grid, and edit button"
```
→ Generates from text description, asks more clarifying questions

```
/design-to-expo https://claude.ai/design/...
```
→ Resolves the URL, fetches the design, runs full workflow

## Notes

- This command is HEAVY by design — it enforces the full Superpowers methodology
- For quick one-off components, use `/expo-component` instead
- For a single screen without full workflow, use `/expo-screen`
