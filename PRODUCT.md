# Product

## Register

product

## Users

Three distinct audiences share one codebase, and they are not variations of each other.

**Customers** — the public, self-registered, personal or company. They book a
door-to-door shipment from India to the USA, pay, and track. Consumer context:
at home, unhurried, on a phone or a laptop. They see their own orders and
nothing else.

**Pickup agents** — Bombino field staff, on a bike, in the street. This is the
demanding context and the one that sets the constraints: direct sunlight on the
screen, one hand on the phone, sometimes gloved, intermittent network, and
often a low-end Android device. The job is a short, repeating loop: see what
work is available, claim one, go, collect, hand it to the hub. They are paid to
move, not to read.

**Ops / admin** — office and hub staff on laptops, running every order through
its lifecycle. Ops is the system of record between booking and dispatch.

## Product Purpose

India-to-USA shipping logistics. The controlling constraint is that ITD dockets
cannot be amended after creation, so the docket is deferred: booking creates an
internal Bombino order, the parcel is weighed at the hub, money is settled, and
only then is a real AWB issued. Everything between those two points happens
inside this product.

Success for the agent surface specifically: a pickup is claimed, collected, and
handed to the hub without the agent stopping to think about the software.

## Brand Personality

The customer app is warm and consumer-friendly. **The agent app is not, and
should not try to be.** Its personality is blunt, fast, and high-contrast: a
tool, not an experience.

Voice on the agent surface: imperative and literal. "Mark picked up", not
"Confirm collection status". State is announced, not decorated. Nothing is
softened, nothing is celebrated, no encouragement copy.

Three words: **blunt, legible, immediate.**

## Anti-references

- **Dashboards.** The agent home is not an analytics page. Stat tiles, big
  hero metrics, and charts are all wrong here; the agent needs the next action,
  not a summary of their week.
- **Consumer delight patterns.** No confetti, no celebratory empty states, no
  illustration-led screens, no encouraging microcopy.
- **Hi-vis safety aesthetics.** Black-and-yellow hazard striping is the lazy
  visual shorthand for "field worker" and reads as condescending.
- **Terminal dark mode as a personality.** Dark is a legibility decision, not a
  style. Sunlight rules it out here.
- The customer app's own softness: rounded warmth and gentle contrast are right
  for booking a parcel and wrong for working one.

## Design Principles

1. **The next action is the interface.** Every agent screen answers one
   question: what do I do now? Everything that does not serve that answer is
   secondary or absent.
2. **Colour carries one meaning: money.** Amber means cash is owed or has been
   handled, nowhere else. Status is communicated by size and weight, never by a
   palette of coloured chips.
3. **The server owns the state machine.** The UI renders the actions the API
   says are legal and holds no lifecycle knowledge of its own. A transition
   added on the server appears as a button with no client change.
4. **Never fail silently.** A lost race, a dead network, a failed write: each
   gets a specific, literal message. An agent standing in the street must never
   wonder whether a tap registered.
5. **Assume the worst device and the worst light.** High contrast, large
   targets, cheap motion. If a choice costs frames on a budget Android, it
   loses.

## Accessibility & Inclusion

Target WCAG 2.2 AA, with field conditions treated as accessibility
requirements rather than nice-to-haves:

- **Sunlight legibility** — body text at AAA contrast (7:1) where practical,
  never below AA 4.5:1. No grey-on-grey secondary text on the agent surface.
- **Gloved and imprecise taps** — 56px minimum touch targets on agent primary
  actions, above the 44px baseline. Destructive and routine actions are
  physically separated.
- **Intermittent network** — every mutation has an explicit pending state and a
  literal failure message. No optimistic UI on any action that can be refused
  by the server.
- **Low-end Android** — CSS transitions only on the agent surface; no GSAP or
  Framer Motion. All motion respects `prefers-reduced-motion`.
- Status is never conveyed by colour alone; it always carries a text label.
