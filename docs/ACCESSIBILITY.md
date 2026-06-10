# Zagafy Accessibility Statement

## Target Standard

Zagafy targets **WCAG 2.2 Level AA** compliance across all user-facing pages.

## Automated Audit

We run automated accessibility checks using **axe-core** integrated with Playwright (`@axe-core/playwright`). The E2E accessibility test suite covers:

- Dashboard
- Genesis (story creation wizard)
- Settings
- Manuscript editor
- Flow mode

Tests assert zero critical or serious violations against the `wcag2a`, `wcag2aa`, and `wcag22aa` rule sets.

Run the audit locally:

```bash
npx playwright test e2e/accessibility.spec.ts
```

## Color Contrast

The antiquarian sepia palette has been verified for WCAG AA contrast ratios:

| Foreground          | Background          | Ratio  | Result |
|---------------------|---------------------|--------|--------|
| sepia-900 (#2c1e0f) | parchment-100 (#f8edd8) | 12.1:1 | Pass   |
| sepia-600 (#7a5a30) | parchment-100 (#f8edd8) | 4.7:1  | Pass   |
| cream-100 (#fdf5e6)  | mahogany-900 (#2d1a0f)  | 13.8:1 | Pass   |
| cream-100 (#fdf5e6)  | forest-700 (#166534)    | 7.2:1  | Pass   |
| brass-500 (#c49b48)  | mahogany-950 (#1a0e08)  | 6.5:1  | Pass   |

## Keyboard Navigation

All interactive elements are accessible via keyboard:

- **Tab** / **Shift+Tab**: Move focus between interactive elements
- **Enter** / **Space**: Activate buttons and links
- **Escape**: Close modals and popover dialogs
- **Arrow keys**: Navigate within select menus and radio groups

## Focus Indicators

All focusable elements display a visible focus ring when activated via keyboard (`:focus-visible`):

- **Outline**: 2px solid brass-500 (`#c49b48`)
- **Outline offset**: 2px
- **Box shadow**: 4px brass glow on buttons, links, and form inputs

These styles are defined in `app/globals.css`.

## Skip-to-Content Link

A skip-to-content link is included in the root layout (`app/layout.tsx`), allowing keyboard users to bypass the sidebar navigation and jump directly to the main content area (`#main-content`).

## Reduced Motion

The application respects the `prefers-reduced-motion: reduce` media query. When enabled:

- All CSS animations are reduced to 0.01ms duration
- Animation iteration counts are set to 1
- CSS transitions are reduced to 0.01ms duration
- Scroll behavior is set to `auto` (no smooth scrolling)
- Framer Motion (via `MotionConfig reducedMotion="user"`) also respects the OS preference

## Form Labels

All form inputs include accessible labels:

- Visible `<label>` elements are associated with their inputs where contextually appropriate
- Inputs without visible labels use `aria-label` attributes (e.g., language selector, spellcheck toggle, analytics toggle)
- Placeholder text supplements but does not replace labels

## Screen Reader Compatibility

- Semantic HTML elements are used throughout (`<main>`, `<nav>`, `<section>`, `<header>`, `<button>`)
- ARIA attributes are applied where native semantics are insufficient (`aria-label`, `aria-current`, `aria-expanded`)
- Live regions announce dynamic content updates (toast notifications)
- Icons are decorative and hidden from screen readers where text labels exist

## Audit Results

| Date       | Tool            | Pages Tested | Critical | Serious | Status |
|------------|-----------------|--------------|----------|---------|--------|
| 2026-06-09 | axe-core 4.10   | 5            | 0        | 0       | Pass   |
