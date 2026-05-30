---
description: Generate a single Expo screen from a design input (skips brainstorm, goes faster). Use when scope is clear and no architecture discussion needed.
argument-hint: [bundle-id | url | description] [optional: route name]
---

# /expo-screen

Lightweight version of `/design-to-expo`. Skips brainstorm and spec phases. Use when:
- You already have a clear design
- You know exactly where the screen goes in the app
- You don't need to discuss architecture or scope

## Workflow

1. **Read CLAUDE.md** to detect conventions
2. **Read the design** input (Claude Design bundle, image, HTML, description)
3. **Apply the expo-from-claude-design skill** directly
4. **Generate the file** at `app/<route>.tsx`
5. **Extract sub-components** if patterns repeat 3+ times
6. **Add accessibility labels** and testIDs
7. **Run code-review** from Superpowers (quick pass)
8. **Show diff** to user and propose commit

## When to use vs /design-to-expo

| Situation | Use |
|---|---|
| New feature, exploratory | `/design-to-expo` (full workflow) |
| You're 100% sure what to build | `/expo-screen` (fast) |
| Single component, not a screen | `/expo-component` |
| Backend wiring needed too | `/design-to-expo` |
| Just typing up an existing design | `/expo-screen` |

## Examples

```
/expo-screen cd_xyz123 profile
```
→ Generates app/profile.tsx from Claude Design bundle

```
/expo-screen [paste screenshot] settings/notifications
```
→ Generates app/settings/notifications.tsx

## Notes

This command is opinionated: it WILL still enforce accessibility, type safety, and component extraction. The "fast" part is skipping the upfront discussion, not skipping quality gates.
