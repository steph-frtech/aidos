---
name: expo-from-claude-design
description: Convert a Claude Design handoff bundle, HTML/CSS mockup, or design screenshot into production-ready Expo React Native code with NativeWind. ALWAYS use this skill when the user provides any of the following for an Expo/React Native project — a Claude Design link or bundle ID, a design screenshot/image, an HTML/CSS snippet, a Figma export, or any visual UI reference they want implemented as a mobile screen or component. Use even when the user does not explicitly mention Expo if the project context (CLAUDE.md, package.json with expo dependencies, app/ directory) indicates Expo Router. Use also when converting web UI code to React Native, or when the user mentions "transformer ce design", "implémente cette maquette", "code cet écran", "make this mobile".
---

# Expo From Claude Design

This skill converts visual UI input (Claude Design handoff, HTML/CSS, screenshots, Figma) into production-ready Expo React Native code using NativeWind for styling and Expo Router for navigation.

## When this skill triggers

- User pastes a Claude Design bundle ID or claude.ai/design link
- User uploads or pastes a screenshot of a UI mockup
- User provides HTML/CSS code that needs to be ported to React Native
- User references a Figma frame URL with intent to implement in Expo
- User asks to "code this design", "implement this mockup", "make this screen", and the project is Expo

## Workflow overview

```
1. Detect input format (Claude Design bundle | image | HTML | Figma | text description)
2. Validate Expo project context (check package.json, app/ directory, NativeWind config)
3. Trigger Superpowers brainstorm to clarify intent and scope
4. Generate spec with acceptance criteria
5. Decompose into 2-5 minute tasks
6. Apply conversion rules (HTML → RN, CSS → NativeWind, events → onPress)
7. Extract reusable components when pattern repeats 3+ times
8. Place files according to Expo Router conventions
9. Apply quality gates (accessibility, tests, types)
10. Trigger code-review before completion
```

## Source format detection

Auto-detect based on input:

| Input type | Detection |
|---|---|
| Claude Design bundle | URL contains `claude.ai/design` or starts with `cd_` prefix |
| Image upload | File attachment with extension `.png .jpg .webp` |
| HTML/CSS snippet | Code block starting with `<html>`, `<div>`, or `<style>` |
| Figma URL | URL contains `figma.com/design` |
| Text description | Plain natural language UI description |

## HTML → React Native element mapping

| HTML | React Native | Import from |
|---|---|---|
| `<div>` | `<View>` | react-native |
| `<p>`, `<span>`, `<h1>`-`<h6>` | `<Text>` | react-native |
| `<button>` | `<Pressable>` | react-native |
| `<a href>` | `<Link href>` | expo-router |
| `<a onClick>` | `<Pressable onPress>` | react-native |
| `<img>` | `<Image>` | expo-image (preferred) |
| `<input type="text">` | `<TextInput>` | react-native |
| `<input type="checkbox">` | `<Switch>` | react-native |
| `<input type="radio">` | Custom Pressable group | react-native |
| `<textarea>` | `<TextInput multiline numberOfLines={4}>` | react-native |
| `<select>` | `<Picker>` | @react-native-picker/picker |
| `<ul>`, `<ol>`, `<li>` | `<FlatList>` or `<View>` + `.map()` | react-native |
| `<svg>` | Component from react-native-svg | react-native-svg |
| `<form>` | `<View>` + state management | react-native |

## Event handler mapping

| Web event | React Native event |
|---|---|
| `onClick` | `onPress` |
| `onDoubleClick` | `onLongPress` (closest equivalent) |
| `onMouseEnter` / `onMouseOver` | `onPressIn` |
| `onMouseLeave` / `onMouseOut` | `onPressOut` |
| `onFocus` | `onFocus` (same) |
| `onBlur` | `onBlur` (same) |
| `onChange` (input) | `onChangeText` (TextInput) |
| `onSubmit` (form) | Manual handler triggered by Pressable |
| `onScroll` | `onScroll` (same, on ScrollView/FlatList) |

## CSS → NativeWind classes

Most Tailwind utility classes work directly in NativeWind. Key differences:

### Use freely (most utilities work)
- Sizing: `w-*`, `h-*`, `min-w-*`, `max-h-*`
- Spacing: `p-*`, `m-*`, `gap-*`
- Flex: `flex`, `flex-row`, `flex-col`, `items-*`, `justify-*`
- Background: `bg-*`
- Text: `text-*`, `font-*`, `leading-*`, `tracking-*`
- Borders: `border-*`, `rounded-*`
- Shadow: `shadow-*` (limited support, test on device)

### Skip these (web-only, won't work)
- `cursor-*` (no cursor on mobile)
- `select-*` (no text selection control)
- `pointer-events-*` (different mobile model)
- `hover:*` (no hover, use Pressable states instead)
- `divide-*` (no equivalent, use borders manually)
- `space-x-*`, `space-y-*` (use `gap-*` instead)
- `prose` (no Typography plugin in NativeWind)

### Replace these patterns
- Fixed pixel values (`width: 200px`) → Tailwind classes (`w-52`)
- Hover states → Pressable states via `({pressed}) => className={...}`
- Media queries → `Platform.OS` checks or NativeWind responsive prefixes
- `position: fixed` → No equivalent, use absolute positioning + safe areas
- CSS variables → Theme tokens via NativeWind config

## Component extraction rules

When converting a design, ALWAYS scan for repeated patterns and extract:

| Pattern | Extract as | Place in |
|---|---|---|
| Same Text style 3+ occurrences | Typography component (e.g. `<Heading>`, `<Body>`) | `components/typography.tsx` |
| Same button style 3+ | `<Button variant="primary\|secondary\|ghost">` | `components/button.tsx` |
| Same card layout 3+ | `<Card>` with props | `components/card.tsx` |
| Same icon wrapper pattern | `<Icon name="..." />` | `components/icon.tsx` |
| Same input style | `<Input label="..." />` | `components/input.tsx` |
| Same list item structure | `<ListItem>` | `components/list-item.tsx` |

Don't over-extract. Less than 3 occurrences = leave inline.

## File placement (Expo Router conventions)

```
app/                          # Routes (file-based)
├── (tabs)/                   # Tab navigator group
│   ├── _layout.tsx
│   ├── index.tsx             # Home tab
│   └── profile.tsx
├── (auth)/                   # Auth group (modal/stack)
│   ├── sign-in.tsx
│   └── sign-up.tsx
├── _layout.tsx               # Root layout
└── +not-found.tsx
components/                   # Reusable UI components
├── ui/                       # Atomic UI primitives
│   ├── button.tsx
│   ├── card.tsx
│   └── input.tsx
└── feature/                  # Feature-specific components
hooks/                        # Custom hooks
lib/                          # Utilities, API clients
types/                        # TypeScript types
constants/                    # Tokens, colors, sizes
```

## Mandatory top-level wrapping

Every full screen MUST include:

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

export default function Screen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Screen content */}
      </ScrollView>
    </SafeAreaView>
  );
}
```

Exceptions:
- Use `FlatList` instead of `ScrollView` when rendering >20 items
- Skip ScrollView if screen is genuinely non-scrollable (e.g. splash)
- Modal screens: use `<View>` with `presentation: 'modal'` in Expo Router

## Quality gates (MUST apply)

Before completing the conversion, verify:

- [ ] Every `<Pressable>` has `accessibilityLabel`
- [ ] Every interactive element has `accessibilityRole` ("button", "link", etc.)
- [ ] Every interactive element has a stable `testID` prop
- [ ] Loading states implemented (skeleton or spinner) for async data
- [ ] Empty states implemented for lists
- [ ] Error states with retry CTA for fetch operations
- [ ] No `console.log` in production code
- [ ] No `any` type — use proper types or `unknown` with type guards
- [ ] All images have `accessibilityLabel` and `contentFit` prop
- [ ] FlatList has `keyExtractor` (never use index as key)
- [ ] All text supports dynamic sizing (no fixed `fontSize` in pixels)

## Patterns to AVOID

- Inline styles via `style={{...}}` (use NativeWind className)
- `StyleSheet.create()` (we use NativeWind exclusively)
- Hardcoded colors (use theme tokens: `bg-primary`, `text-foreground`)
- Pixel values in JSX (use Tailwind: `w-12`, not `width: 48`)
- Web-only APIs (`window`, `document`, `localStorage`)
- Web-only libraries (use RN equivalents)
- Margin to create gaps (use `gap-*` on parent flex container)
- `position: 'absolute'` for layout (use flex, except for overlays)
- Tight coupling: avoid hardcoding navigation routes in components

## Integration with project conventions

ALWAYS read `CLAUDE.md` at the project root first to detect:

1. The stack version (Expo SDK, React Native, React)
2. Style conventions (which Tailwind plugins, custom classes)
3. State management library (Zustand, Jotai, Redux, Context)
4. Data fetching (TanStack Query, SWR, raw fetch)
5. Forms library (React Hook Form, Formik, native)
6. Navigation structure (tabs, drawer, stack patterns)
7. Existing components (don't duplicate, reuse)

If `CLAUDE.md` is missing, ASK the user before generating code that imposes opinions.

## Orchestration with Superpowers

This skill is designed to compose with the Superpowers harness. When invoked:

1. **Brainstorm phase**: BEFORE generating any code, trigger Superpowers' brainstorming skill to clarify:
   - Which screens are in scope vs out of scope
   - Data sources (mock vs real backend)
   - Navigation flow (where does this screen connect to)
   - Edge cases (loading, error, empty, offline)
   - Platform-specific concerns (iOS vs Android differences)

2. **Spec phase**: Generate acceptance criteria using Superpowers' writing-spec.

3. **Plan phase**: Decompose into 2-5min tasks using Superpowers' writing-plans.

4. **TDD phase**: For non-trivial logic (data fetching, form validation), write tests first using Superpowers' tdd.

5. **Review phase**: Trigger Superpowers' code-review before declaring done.

## Output formatting

- Always provide a brief implementation summary
- List files created/modified with paths
- Note any TODOs or assumptions made
- Suggest next steps (test, refine, add backend wiring)

## Failure modes to handle

- **Ambiguous design**: Ask clarifying questions before guessing
- **Missing context**: Detect and request CLAUDE.md or project info
- **Out-of-scope element**: Stub it and add a TODO, don't fabricate behavior
- **Complex animation requested**: Use Reanimated 3, or note as future work
- **Native module needed**: Note that EAS Build will be required (vs Expo Go)
