# Design System — Bombino Express

## Color Palette

Strategy: **Committed** — Admiralty Dark (deep navy) dominates; Dispatch Amber carries accent voice. OKLCH is the source of truth for Tailwind v4 theme, with mapped hex values used directly in specific structurally distinct components.

| Token          | OKLCH                  | HEX Mapping | Use                                                |
| -------------- | ---------------------- | ----------- | -------------------------------------------------- |
| Admiralty Dark | `oklch(17% 0.048 248)` | `#112330`   | Primary bg, hero, CTAs, Text Foreground            |
| Trade Wind     | `oklch(37% 0.092 245)` | `#2F4468`   | Secondary, links, focus rings, icons               |
| Dispatch Amber | `oklch(73% 0.160 64)`  | `#F2A123`   | Primary CTA, accents, highlights, badges           |
| Freight Paper  | `oklch(98% 0.004 246)` | `#F8F9FA`   | Page background, white sections, card placeholders |
| Surface Tinted | `oklch(96% 0.006 246)` | `#F3F4F6`   | Input bg, subtle wells                             |
| Muted Ink      | `oklch(52% 0.035 246)` | `#64748B`   | Body copy, captions                                |
| Border Subtle  | `oklch(88% 0.010 246)` | `#E2E8F0`   | Card borders, dividers, subtle separators          |

## Typography

Font: Poppins (established brand font — not a new choice), Geist Mono (for tabular/code data).
Weights used: 300, 400 (Body), 600 (Title/Label), 700 (Headline), 800 (Display).

Scale (fluid with clamp):

- Display: `clamp(2.5rem, 5vw, 4rem)` / weight 800 / tracking -0.025em / lh 1.05
- Headline: `clamp(1.5rem, 3vw, 2.25rem)` / weight 700 / tracking -0.01em / lh 1.2
- Title: `clamp(1.125rem, 2vw, 1.5rem)` / weight 600 / lh 1.3
- Body: 1rem / weight 400 / lh 1.65 / max-width 70ch
- Label/Eyebrow: 0.6875rem / weight 600-700 / tracking 0.09em-0.12em / uppercase

Hero headline target: `clamp(2.75rem, 5.5vw, 5rem)` / weight 800 / tracking -0.03em / lh 1.03

## Elevation / Shadow

Shadows in the system are tinted with the "Admiralty Dark" navy rather than pure black to feel richer and highly integrated.

```css
hover:   0 4px 20px oklch(17% 0.048 248 / 0.12)
modal:   0 12px 48px oklch(17% 0.048 248 / 0.18), 0 4px 16px oklch(17% 0.048 248 / 0.10)
focus:   0 0 0 3px oklch(37% 0.092 245 / 0.40)
```

_Note: Some structural components use explicit rgba variations: Hover expansions like `0 8px 30px rgba(0,0,0,0.06)` or massive dropdown drops like `0 8px 40px rgba(17,35,48,0.10)`._

## Radius

The system prioritizes a "warm authority" aesthetic over sharp edges.

```
sm: 4px   md: 8px   lg: 12px   xl: 20px   2xl: 32px   full: 9999px
```

## Spacing

4pt base grid. Major section padding: 96px (3xl) desktop, 64px (2xl) tablet, 40px (xl) mobile.

## Motion

Library: GSAP (already in project dependencies) & Framer Motion (for React interactive menus)
Easing: expo.out `cubic-bezier(0.16, 1, 0.3, 1)`, power3.out `cubic-bezier(0.33, 1, 0.68, 1)`
Durations: 0.6–0.9s entrances, 0.15–0.2s micro-interactions, up to 0.5s for rich card expansions.
Scroll-triggered: ScrollTrigger with `start: "top 85%"`
Reduced motion: `window.matchMedia("(prefers-reduced-motion: reduce)")` check before all GSAP inits

## Components & Structural Audit

- **Buttons (`Button/Primary`):** Dispatch Amber bg (`#F2A123`), Admiralty text (`#112330`), rounded-full (or `rounded-lg` per shadcn default extensions), `h-8` to `h-12`, font-semibold.
- **Button/Secondary**: transparent bg, border-white/30, freight-paper text, rounded-full, backdrop-blur-sm.
- **Cards (`GlobalCard`):** Exhibit a highly premium, "app-like" feel.
  - Outer Shell: `bg-white` fill, `border-slate-100` (`#E2E8F0`), massive `rounded-[2rem]` (`32px`) corners. Structural padding (`p-2`) allows inner media to breathe.
  - Inner Media Wrapper: Uses a proportional `rounded-[1.5rem]` border radius.
  - Interactions: Hover states trigger slow (`duration-500`) shadow expansions (`0 8px 30px rgba(0,0,0,0.06)`) and image scaling.
  - Typography: Extrabold 2xl titles against muted `slate-500` descriptions.
- **Card/Dark**: white/5 bg, white/10 border, rounded-2xl (used on navy sections).
- **Header/Nav**: Highly dynamic z-50 fixed architecture. The navigation bar shifts between a `bg-transparent` overlay and a `bg-black/15 backdrop-blur-sm` glass effect depending on the page context.
- **Mega Menus**: Deep, structured dropdown layouts using custom Framer Motion spring physics. Built with heavy background blurring (`bg-white/95 backdrop-blur-xl`), `rounded-2xl` borders, deep drop shadows, and an amber accent top-line gradient.

## Section Sequence

1. Navbar
2. Hero (full-vh, dark with amber accents)
3. Trust Band (marquee of destinations / partner logos)
4. Capabilities Bento (asymmetric grid, not identical cards)
5. Services Editorial List (hover-reveal, not card grid)
6. Proof Narrative (stats in context, not hero-metric template)
7. Global Offices
8. CTA Strip
9. Footer
