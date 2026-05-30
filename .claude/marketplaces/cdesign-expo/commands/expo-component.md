---
description: Generate a single reusable Expo component (button, card, input, etc.) from a design input
argument-hint: [bundle-id | url | description] [optional: component name]
---

# /expo-component

For when you just want a single reusable component, not a full screen.

## Workflow

1. **Read CLAUDE.md** to detect existing component patterns
2. **Check if a similar component exists** in `components/` — if yes, propose extending it
3. **Apply expo-from-claude-design skill** in component mode
4. **Generate** at `components/ui/<name>.tsx`
5. **Make it reusable** via props (variants, sizes, colors)
6. **Add TypeScript types** for props
7. **Generate usage example** in a comment block
8. **Add Storybook-style example** if `.storybook/` exists in project

## Component patterns to follow

For a button:
```tsx
type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel: string; // REQUIRED
  testID?: string;
};
```

For a card:
```tsx
type CardProps = {
  variant?: 'default' | 'elevated' | 'outlined';
  onPress?: () => void; // makes it Pressable if provided
  children: React.ReactNode;
  testID?: string;
};
```

## Examples

```
/expo-component "primary button with icon left and loading state" Button
```

```
/expo-component cd_xyz789 ProductCard
```
