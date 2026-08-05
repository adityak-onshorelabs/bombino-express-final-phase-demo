# Auth Flow — "Freight Document"

Scope: `/login`, `/signup`, account linking. **Auth surfaces only** — the rest
of the product keeps its 20–32px radii and soft cards, so expect a visible
seam at `/home` until this spreads. Extends `DESIGN.md`; brand unchanged.

## Why this exists

The first pass at these screens was a centred white card with `rounded-2xl`
corners and a blurred shadow floating on grey. That is the default template
look — it could belong to any product. This replaces it with the visual
grammar of the documents this business actually runs on: waybills, manifests,
customs forms.

> A generated recommendation proposed `#2563EB`/`#EA580C` with Plus Jakarta
> Sans, and later a Brutalist black/pink. Both rejected — Bombino has an
> established identity (Admiralty Dark + Dispatch Amber, Poppins). Only the
> structural and accessibility guidance was taken.

## The rules that make it not-generic

1. **Radius is 6px, everywhere.** Enough curve to feel considered rather than
   austere, well short of the 12–32px the rest of the app uses — which is what
   made the original read as a template. One variable, `--doc-radius`, drives
   every corner on the surface: change it there and nowhere else.
2. **No blur shadows at all.** Depth comes from 1px hairline rules and one 2px
   rule under the wordmark. There is no floating card; content sits directly
   on the page and is divided the way a printed form is.
3. **Mono carries every number.** Geist Mono was already loaded and unused.
   It now sets phone numbers, OTP digits, the step counter and all field
   labels — the single strongest signal that this is a shipping document.
4. **Labels are uppercase, tracked 0.14em, 11px.** `MOBILE NUMBER`, not
   `Phone number`.
5. **Left-aligned.** The centred column was the most template-like thing about
   the old design and pushed the first field away from the thumb.
6. **Progress is a counter, not dots.** `01 / 03`, zero-padded — a docket
   number is padded, a bare `3` is not.
7. **`+91` is a fixed segment**, ruled off from the input, not a placeholder.
8. **Primary action is a stamp**: square, amber, uppercase, tracked, trailing
   arrow, full width.
9. **Selection is a leading amber bar**, not a tinted rounded rectangle.

## Classes (`index.css`)

| Class | Use |
|---|---|
| `.auth-doc` | Scope wrapper — sets `--doc-radius` |
| `.auth-doc-label` | Uppercase tracked mono field label (`display: block`) |
| `.auth-doc-link` | Inline variant for links with trailing icons |
| `.auth-doc-mono` | Numeric/code values |
| `.auth-doc-rule` / `-rule-heavy` | 1px hairline / 2px masthead rule |
| `.auth-field` | Input — `--doc-radius`, hairline border, solid amber focus edge |
| `.auth-doc-btn` | Primary action |
| `.auth-choice` | Option row with amber leading bar |
| `.focus-ring`, `.tap-target` | Applied to every interactive element |

**Never** write `lab(34.08…)`, `#F2A123`, `#E2E8F0`, `#F3F4F6` in a component.
Auth screens are at **0 hardcoded colour literals**.

## Carried over from the accessibility pass

- `role="alert"` + `aria-invalid` + `aria-describedby` on every error
- 44px minimum touch targets
- Focus visible on all controls (custom buttons previously had none)
- OTP auto-submits on the 6th digit; focus lands on the right field per step
- Toasts offset below the header — at `top-0` they covered the back button

## Two traps found while building this

- `.auth-doc-label` applies `display: block`, which **beats** an `inline-flex`
  utility on the same element and pushes trailing icons onto their own line.
  Use `.auth-doc-link` for anything with an icon.
- `uppercase` on a countdown turns `28s` into `28S`. Timers render as `0:28`.

## Not done

- **Dark mode** — tokens support it, never verified here.
- **Profile dialogs** still use the old soft-card styling. They will look
  inconsistent beside these screens.
