---
status: accepted
---

# Workbench design system: the ccup "design-to-fullstack" theme (zinc + blue-600)

The AIDOS Workbench (`front/web`) adopts a single, consistent design system reused from
`/data/dev/ccup/frontend`: a **zinc base + blue-600 accent** palette on **Tailwind v4 +
shadcn** CSS-variable tokens, **Geist** fonts, radius `0.5rem`, with light and a derived
dark variant. It lives in `front/web/app/globals.css` (`:root` / `.dark` token blocks).

## Decision

- Every Workbench route uses the **design tokens** — `bg-background`, `text-foreground`,
  `bg-primary` / `text-primary-foreground`, `bg-card`, `border-border`, `text-muted-foreground`,
  `ring-ring`, `rounded-lg`, etc. — and **shadcn** components. **Never** hardcode hex or raw
  `zinc-*` / `blue-*` classes in a page; restyle to tokens so the theme is swappable in one file.
- The palette is the ccup one (accent **blue-600**, surfaces **zinc**), so the Workbench
  matches the design-to-fullstack family.
- The **`view`** skill specs every screen against this system; the page template/format is
  imposed across current and future routes (the design system is the standing template).
- **Emitted web apps** inherit this token approach as their starting theme (then customizable
  per project), so generated UIs are coherent by default.

## Considered options

- Keep the default neutral shadcn theme — rejected: the user mandated reusing the ccup theme
  for a polished, on-brand Workbench.
- A bespoke per-page styling — rejected: inconsistent, not swappable; tokens centralize it.

## Consequences

- Existing pages (`/`, `/contract`, `/store`, `/records`) are restyled to the tokens.
- Re-deploying the Workbench (rebuild + `next start`) is required to see the theme live at
  `aidos.sagedesk.fr`.
- Pairs with [ADR 0011](0011-i18n-bilingual-by-default.md): every themed screen is also bilingual.
