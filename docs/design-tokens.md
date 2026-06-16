# Design Tokens v2 — Semantic Roles

Tokens v2 add an intent-based layer on top of raw tokens. Prefer semantic tokens for consistent UI and easier theming.

## Semantic Tokens

| Token | Maps to | Use for |
|-------|---------|---------|
| `surface-panel` | `bg-secondary` | Sidebar panels, channel list background |
| `surface-elevated` | `bg-tertiary` | Modals, dropdowns, elevated surfaces |
| `surface-base` | `bg-primary` | Page background |
| `interactive-hover` | `bg-hover` | Hover state for list items, buttons |
| `interactive-active` | `bg-active` | Active/selected state |
| `status-presence-online` | `status-online` | Online indicator |
| `text-heading` | `text-primary` | Headings, primary text |
| `text-body` | `text-secondary` | Body text |
| `text-muted` | `text-muted` | Muted, secondary info |
| `border-subtle` | `border-secondary` | Subtle dividers |

## Usage

**Tailwind:**
```tsx
<div className="bg-surface-panel text-text-heading border-border-subtle">
```

**CSS:**
```css
.panel {
  background: var(--surface-panel);
  color: var(--text-heading);
}
```

## Migration Guide

1. Replace `bg-secondary` with `bg-surface-panel` for panel backgrounds
2. Replace `bg-tertiary` with `bg-surface-elevated` for elevated surfaces
3. Replace `bg-hover` / `bg-active` with `interactive-hover` / `interactive-active` for interactive states
4. Replace `text-primary` with `text-heading` for headings; `text-secondary` with `text-body` for body
5. Replace `border-secondary` with `border-subtle` for subtle dividers

Migrate incrementally; raw tokens remain valid.
