import { create } from 'zustand';
import { driver, type Alignment, type Driver, type Side } from 'driver.js';
import { navigate } from 'wouter/use-browser-location';
import type { ITDRateRow } from './itdRates';
import { formatInr } from './itdRates';
import {
  REDEEM_MIN_POINTS,
  RUPEES_PER_POINT,
  RUPEES_PER_REDEEMED_POINT,
  formatPoints,
  maxPointsFor,
  pointsDiscount,
  pointsFor,
  progressFor,
  withoutGst,
} from './rewards';
import { useRewardsStore } from './rewardsStore';
import { useAppStore, type AuthUser } from './store';
import { DEMO_MEMBER } from './rewardsAccess';

/**
 * The rewards demo: a hands-off walkthrough that books a dummy shipment and
 * spends points on it, end to end, while the presenter watches.
 *
 * driver.js only draws the highlight and the popover. The script below owns
 * the timing: each step goes to its screen, waits for its element, shows for
 * a few seconds and then does its action (a click, a step change), so nothing
 * needs a human hand. The presenter can still pause, skip ahead or leave.
 *
 * Nothing in the demo is real, and none of it needs a server or a sign-in.
 * For the length of the tour the app is signed in as DEMO_MEMBER, a linked
 * account that exists only in this browser, whoever was using it before
 * (a guest, nobody, or a real account). The booking screen runs in demo mode
 * (CreateShipment reads `bookingDemo`): filled from TOUR_SHIPMENT, quoted from
 * TOUR_RATES, and "Confirm Booking" never calls the API. The previous session
 * and the rewards figures are saved first and put back when the tour ends,
 * however it ends.
 */

// ─── The dummy shipment ─────────────────────────────────────────────────────

export const TOUR_ORDER_NO = 'DEMO-000001';
/** A linked account's booking files its airway bill straight away. */
export const TOUR_AWB_NO = 'DEMO-AWB-70001';

/** What the booking form is filled with during the demo. */
export const TOUR_SHIPMENT = {
  senderPhone: '9820012345',
  senderCity: 'Mumbai',
  senderState: 'Maharashtra',
  senderZip: '400059',
  senderAddress: 'Unit 4, Marol Industrial Estate, Andheri East',
  receiverName: 'Priya Shah',
  receiverPhone: '7325550142',
  receiverEmail: 'priya.shah@example.com',
  receiverCity: 'Edison',
  receiverState: 'NJ',
  receiverZip: '08817',
  receiverAddress: '22 Oak Tree Road',
  destinationCountry: 'US',
  weightKg: 25,
  dimsCm: { l: '60', w: '40', h: '40' },
  shipmentValue: '45000',
  shipmentContent: 'Handloom sarees and cotton kurtas',
} as const;

function rate(id: string, code: string, subTotal: number, perKg: number): ITDRateRow {
  const gst = Math.round(subTotal * 0.18);
  return {
    id,
    code,
    internal_api_service_code: code,
    rate: subTotal,
    fsc: 0,
    cgst: 0,
    sgst: 0,
    igst: gst,
    gst_total: gst,
    other_charges: 0,
    sub_total: subTotal,
    total: subTotal + gst,
    per_kg: perKg,
    weight: String(TOUR_SHIPMENT.weightKg),
    gst_per: '18',
  };
}

/** The quotes the demo booking is offered. The first is the one it books. */
export const TOUR_RATES: readonly ITDRateRow[] = [
  rate('tour-bombino-express', 'BOMBINO EXPRESS', 27_000, 1_080),
  rate('tour-priority', 'PRIORITY EXPRESS', 33_000, 1_320),
];

/** Points the demo settles on: fewer than the payment allows, to show adjusting. */
const TOUR_POINTS = 1_000;

// ─── What the booking screen gives the tour ─────────────────────────────────

/** Registered by CreateShipment while it is in demo mode. */
export interface TourBookingBridge {
  goToStep: (step: number) => void;
  showRates: () => void;
  openReview: () => void;
  setPoints: (points: number) => void;
  /** The points the booking is set to use right now. */
  getPoints: () => number;
}

// ─── State ──────────────────────────────────────────────────────────────────

interface TourState {
  running: boolean;
  paused: boolean;
  /** The booking screen runs on dummy data and never calls the API. */
  bookingDemo: boolean;
  bridge: TourBookingBridge | null;
  setBridge: (bridge: TourBookingBridge | null) => void;
}

export const useRewardsTour = create<TourState>()((set) => ({
  running: false,
  paused: false,
  bookingDemo: false,
  bridge: null,
  setBridge: (bridge) => set({ bridge }),
}));

// ─── The script ─────────────────────────────────────────────────────────────

interface TourStep {
  /** The screen this step is on. The tour goes there first. */
  path?: string;
  /** CSS selector; the first visible match is highlighted. None: a centred card. */
  element?: string;
  title: string;
  /** A function when the copy quotes live figures. */
  body: string | (() => string);
  side?: Side;
  align?: Alignment;
  /** How long the step stays up, in ms. */
  dwell?: number;
  /**
   * The presenter can use what is highlighted. Touching it pauses the timer,
   * so the step waits for "Next" or "Resume".
   */
  interactive?: boolean;
  /** Runs before the element is looked for: open a sheet, change a step. */
  before?: () => Promise<void> | void;
  /** Runs once the step has been read: usually the click it was describing. */
  after?: () => Promise<void> | void;
}

const DEFAULT_DWELL = 5_000;

function member() {
  return useRewardsStore.getState().member;
}

const reviewTotal = TOUR_RATES[0].total;

function maxForDemo(): number {
  return maxPointsFor(member().points, reviewTotal);
}

function toPayAfter(points: number): number {
  return Math.max(reviewTotal - pointsDiscount(points), 0);
}

/** The points the booking went through with, read when Confirm is pressed. */
let bookedWith = 0;

/** What the presenter has chosen: live while on Review & Pay, fixed after booking. */
function picked(): number {
  return useRewardsTour.getState().bridge?.getPoints() ?? bookedWith;
}

function earnAfter(points: number): number {
  return pointsFor(withoutGst(toPayAfter(points), { total: reviewTotal, subTotal: TOUR_RATES[0].sub_total }));
}

const STEPS: TourStep[] = [
  {
    path: '/rewards',
    title: 'Bombino Rewards, start to finish',
    body:
      "Watch a member book a shipment and pay part of it with reward points. It runs by itself: pause or skip any time. It's a dummy booking, so nothing reaches Bombino and your figures are put back at the end.",
    dwell: 6_500,
  },
  {
    path: '/rewards',
    element: '[data-testid="rewards-tier-hero"]',
    title: 'Your tier',
    body: () => {
      const p = progressFor(member().billing, member().weightKg);
      return `${p.current.name} member, ${Math.round(p.pct * 100)}% of the way to ${p.next?.name ?? 'the top'}. A tier unlocks on yearly billing (excl. GST) or weight shipped, whichever reaches the target first.`;
    },
    side: 'bottom',
  },
  {
    path: '/rewards',
    element: '[data-testid="rewards-wallet"]',
    title: 'Points wallet',
    body: () =>
      `Every ₹${RUPEES_PER_POINT} billed earns 1 point. This member has ${formatPoints(member().points)} points. They can be used once the balance reaches ${REDEEM_MIN_POINTS}.`,
  },
  {
    path: '/rewards',
    element: '[data-testid="rewards-road"]',
    title: 'The road ahead',
    body: 'Every tier from Standard to Tier 5, with how far along this member is. Each target unlocks the next.',
  },
  {
    before: () => {
      useRewardsTour.setState({ bookingDemo: true });
      navigate('/create');
    },
    path: '/create',
    element: '[data-tour="booking-sender"]',
    title: 'Step 1 · Sender',
    body: `A dummy shipment is filled in for the demo: ${TOUR_SHIPMENT.weightKg} kg from Mumbai to New Jersey.`,
    dwell: 4_000,
  },
  {
    before: () => bridge().goToStep(2),
    path: '/create',
    element: '[data-tour="booking-receiver"]',
    title: 'Step 2 · Receiver',
    body: 'Who it goes to in the USA.',
    dwell: 3_200,
  },
  {
    before: () => bridge().goToStep(3),
    path: '/create',
    element: '[data-tour="booking-package"]',
    title: 'Step 3 · Package',
    body: `${TOUR_SHIPMENT.weightKg} kg, one box, ${TOUR_SHIPMENT.dimsCm.l} × ${TOUR_SHIPMENT.dimsCm.w} × ${TOUR_SHIPMENT.dimsCm.h} cm.`,
    dwell: 3_200,
  },
  {
    before: () => bridge().goToStep(4),
    path: '/create',
    element: '[data-tour="booking-invoice"]',
    title: 'Step 4 · Invoice',
    body: "What's inside and what it's worth, for customs.",
    dwell: 3_200,
  },
  {
    before: () => bridge().showRates(),
    path: '/create',
    element: '[data-testid="invoice-rate-card-0"]',
    title: 'Pick a service',
    body: `Rates come back for this parcel. The demo picks ${TOUR_RATES[0].code} at ${formatInr(reviewTotal)} incl. GST.`,
    after: async () => {
      await click('[data-testid="invoice-rate-card-0"]');
      await wait(600);
      await click('[data-testid="button-confirm-service"]');
    },
  },
  {
    before: () => bridge().openReview(),
    path: '/create',
    element: '[data-tour="review-summary"]',
    title: 'Review & Pay',
    body: `The total for this booking is ${formatInr(reviewTotal)}. Now for the points.`,
    side: 'bottom',
    dwell: 4_000,
  },
  {
    path: '/create',
    element: '[data-testid="card-points-at-checkout"]',
    title: 'Use reward points',
    body: () =>
      `${formatPoints(member().points)} points available, each worth ₹${RUPEES_PER_REDEEMED_POINT} off. Points stay off until the customer switches them on.`,
    after: () => click('[data-testid="switch-use-points"]'),
  },
  {
    path: '/create',
    element: '[data-testid="card-points-at-checkout"]',
    title: 'Switched on: the most it can take',
    body: () =>
      `Switching on uses as many points as this payment allows: ${formatPoints(maxForDemo())}, worth ${formatInr(pointsDiscount(maxForDemo()))}. It never takes more than the balance or the amount due.`,
    after: () => animatePoints(maxForDemo(), Math.min(TOUR_POINTS, maxForDemo())),
  },
  {
    path: '/create',
    element: '[data-testid="card-points-at-checkout"]',
    title: 'Choose how many',
    body: () =>
      `Step down with −/+, drag the slider or tap "Use max". This member keeps some back and uses ${formatPoints(Math.min(TOUR_POINTS, maxForDemo()))}.`,
    dwell: 4_000,
  },
  {
    path: '/create',
    element: '[data-testid="card-points-at-checkout"]',
    title: 'Your turn',
    body:
      'Try it: switch points off and on, use − / +, drag the slider or tap "Use max". The total and To pay above change as you go. The shipment stays the same. Press Next when you are done.',
    interactive: true,
    dwell: 20_000,
  },
  {
    path: '/create',
    element: '[data-tour="review-summary"]',
    title: 'The new amount',
    body: () => {
      const used = picked();
      if (used === 0) return `No points used on this one: ${formatInr(reviewTotal)} to pay.`;
      return `Total ${formatInr(reviewTotal)}, minus ${formatInr(pointsDiscount(used))} in points: ${formatInr(toPayAfter(used))} to pay.`;
    },
    side: 'bottom',
  },
  {
    path: '/create',
    element: '[data-testid="text-points-earn"]',
    title: 'Points on this booking too',
    body: () =>
      `Points are earned on what is actually paid, excl. GST: ${formatPoints(earnAfter(picked()))} points. They arrive once the order settles, not at booking.`,
    side: 'top',
  },
  {
    path: '/create',
    element: '[data-testid="button-confirm-booking"]',
    title: 'Confirm',
    body: 'The button carries the new amount. In the demo, confirming books nothing and charges nothing.',
    side: 'top',
    dwell: 4_000,
    after: async () => {
      bookedWith = bridge().getPoints();
      await click('[data-testid="button-confirm-booking"]');
    },
  },
  {
    path: '/create',
    element: '[data-testid="card-success-points"]',
    title: 'Booked',
    body: 'A linked account gets its airway bill at once. Below it, the points used and the points on their way.',
    side: 'top',
  },
  {
    before: () => navigate('/rewards'),
    path: '/rewards',
    element: '[data-testid="rewards-wallet"]',
    title: 'Points used',
    body: () =>
      bookedWith > 0
        ? `${formatPoints(bookedWith)} points left the balance at booking. ${formatPoints(member().points)} remain.`
        : `No points were used, so the balance is still ${formatPoints(member().points)}.`,
  },
  {
    path: '/rewards',
    element: '[data-testid="rewards-activity"]',
    title: 'Activity',
    body: () =>
      bookedWith > 0
        ? `The points used on ${TOUR_ORDER_NO}, and the points it will earn, waiting until the order settles.`
        : `The points ${TOUR_ORDER_NO} will earn, waiting until the order settles.`,
    side: 'top',
  },
  {
    before: async () => {
      await wait(400);
      useRewardsStore.getState().settle(TOUR_ORDER_NO);
    },
    path: '/rewards',
    element: '[data-testid="rewards-wallet"]',
    title: 'Delivered and paid',
    body: () =>
      `Once the order settles the points land: ${formatPoints(member().points)} now. Its billing and weight count towards the next tier as well.`,
  },
  {
    path: '/rewards',
    element: '[data-testid="rewards-how"]',
    title: 'The rules',
    body: `Points can be used from ${REDEEM_MIN_POINTS}. Cancelling an order gives back the points used on it. Rewards are for account holders: guests don't see them.`,
    side: 'top',
  },
  {
    path: '/rewards',
    title: "That's the flow",
    body: 'Everything is back to where it started. Run it again from "Rewards demo" in the menu.',
    dwell: 5_000,
  },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

class TourStopped extends Error {}

let runId = 0;
let driverObj: Driver | null = null;
let skipWait: (() => void) | null = null;
let snapshot: Pick<ReturnType<typeof useRewardsStore.getState>, 'scenarioId' | 'member' | 'shipmentCursor'> | null =
  null;
let authSnapshot: { isLoggedIn: boolean; user: AuthUser | null } | null = null;

function guard(id: number): void {
  if (id !== runId) throw new TourStopped();
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bridge(): TourBookingBridge {
  const b = useRewardsTour.getState().bridge;
  if (!b) throw new TourStopped();
  return b;
}

function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

async function waitFor(selector: string, id: number, timeout = 8_000): Promise<HTMLElement | null> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    guard(id);
    const el = visible(selector);
    if (el) return el;
    await wait(100);
  }
  return null;
}

async function waitForBridge(id: number, timeout = 8_000): Promise<void> {
  const start = performance.now();
  while (!useRewardsTour.getState().bridge && performance.now() - start < timeout) {
    guard(id);
    await wait(100);
  }
}

async function click(selector: string): Promise<void> {
  const el = await waitFor(selector, runId, 4_000);
  el?.click();
}

/** Room kept clear at the top for the sticky header. */
const HEADER_ROOM = 88;
/** Room kept clear below a tall element for the popover. */
const POPOVER_ROOM = 210;

let proxy: HTMLElement | null = null;

function clearProxy(): void {
  proxy?.remove();
  proxy = null;
}

function setSwitching(on: boolean): void {
  document.documentElement.classList.toggle('bombino-tour-switching', on);
}

/** Resolves once the element has stopped moving (a sheet opening, a step fading in). */
async function settled(el: HTMLElement, id: number): Promise<void> {
  let last = '';
  const start = performance.now();
  while (performance.now() - start < 1_500) {
    const r = el.getBoundingClientRect();
    const now = `${Math.round(r.top)}:${Math.round(r.height)}:${Math.round(r.left)}`;
    if (now === last) return;
    last = now;
    await wait(80);
    guard(id);
  }
}

/**
 * Scroll the element into place and return what to highlight.
 *
 * driver.js scrolls any element that does not fit on screen up to the very
 * top, under the sticky header, and moves the highlight with it. So an element
 * that fits is centred, and one that does not (the sender and receiver cards
 * on a phone) is stood in for by a box over the part of it that is on screen,
 * which always fits and so is never scrolled. Scrolling is instant: the
 * highlight is drawn once, on the element where it ends up.
 */
async function placeInView(el: HTMLElement, id: number, interactive = false): Promise<HTMLElement> {
  clearProxy();
  await settled(el, id);
  const room = window.innerHeight - HEADER_ROOM - POPOVER_ROOM;
  let rect = el.getBoundingClientRect();
  // driver.js only lets touches reach the highlighted element, so something to
  // be used is always highlighted itself, never through a stand-in.
  if (rect.height <= room || interactive) {
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    await settled(el, id);
    return el;
  }
  // Scrolls whatever holds it, the page or a sheet. On the page, leave room
  // for the sticky header; a sheet has none.
  el.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (!el.closest('.fixed')) window.scrollBy({ top: -HEADER_ROOM, behavior: 'auto' });
  await settled(el, id);
  rect = el.getBoundingClientRect();
  proxy = document.createElement('div');
  proxy.className = 'bombino-tour-proxy';
  // In a fixed sheet the box is fixed too; on the page it scrolls with it.
  const inSheet = !!el.closest('.fixed');
  Object.assign(proxy.style, {
    position: inSheet ? 'fixed' : 'absolute',
    zIndex: inSheet ? '60' : 'auto',
    top: `${rect.top + (inSheet ? 0 : window.scrollY)}px`,
    left: `${rect.left + (inSheet ? 0 : window.scrollX)}px`,
    width: `${rect.width}px`,
    height: `${room}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(proxy);
  return proxy;
}

/** Walk the points counter from one figure to another, so the change is seen. */
async function animatePoints(from: number, to: number): Promise<void> {
  if (from === to) return;
  if (reducedMotion()) {
    bridge().setPoints(to);
    return;
  }
  const frames = 18;
  for (let i = 1; i <= frames; i++) {
    bridge().setPoints(Math.round(from + ((to - from) * i) / frames));
    await wait(45);
  }
}

/**
 * Hold the step for `ms`, counting only while not paused. Resolves early on
 * "Next".
 */
function dwell(ms: number, id: number): Promise<void> {
  return new Promise((resolve) => {
    let left = ms;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!useRewardsTour.getState().paused) left -= now - last;
      last = now;
      if (left <= 0 || id !== runId) done();
    }, 100);
    function done(): void {
      window.clearInterval(timer);
      skipWait = null;
      resolve();
    }
    skipWait = done;
  });
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') stopRewardsTour();
  else if (event.key === 'ArrowRight') skipWait?.();
  else if (event.key === ' ') {
    event.preventDefault();
    togglePause();
  }
}

function togglePause(): void {
  const paused = !useRewardsTour.getState().paused;
  useRewardsTour.setState({ paused });
  document.documentElement.classList.toggle('bombino-tour-paused', paused);
  const btn = document.querySelector<HTMLButtonElement>('.bombino-tour-pause');
  if (btn) btn.textContent = paused ? 'Resume' : 'Pause';
}

function show(step: TourStep, el: HTMLElement | null, index: number, ms: number): void {
  if (!driverObj) return;
  const body = typeof step.body === 'function' ? step.body() : step.body;
  driverObj.highlight({
    element: el ?? undefined,
    disableActiveInteraction: !step.interactive,
    popover: {
      title: step.title,
      description: body,
      side: step.side,
      align: step.align ?? 'center',
      showButtons: ['next', 'close'],
      nextBtnText: index === STEPS.length - 1 ? 'Finish' : 'Next',
      onPopoverRender: (popover) => {
        popover.progress.style.display = 'block';
        popover.progress.textContent = `${index + 1} of ${STEPS.length}`;

        const pause = document.createElement('button');
        pause.type = 'button';
        pause.className = 'bombino-tour-pause';
        pause.textContent = useRewardsTour.getState().paused ? 'Resume' : 'Pause';
        pause.addEventListener('click', togglePause);
        popover.footerButtons.prepend(pause);

        // The step's time running out, as a bar along the top of the card.
        const bar = document.createElement('div');
        bar.className = 'bombino-tour-timer';
        const fill = document.createElement('span');
        fill.style.animationDuration = `${ms}ms`;
        bar.appendChild(fill);
        popover.wrapper.prepend(bar);
      },
    },
  });
}

/** Start the rewards demo. Call from a screen the signed-in member can see. */
export function startRewardsTour(): void {
  if (useRewardsTour.getState().running) return;
  const id = ++runId;

  // Signed in as the demo account, set straight on the store rather than
  // through login(): nothing about a real session is touched.
  const auth = useAppStore.getState();
  authSnapshot = { isLoggedIn: auth.isLoggedIn, user: auth.user };
  useAppStore.setState({ isLoggedIn: true, user: DEMO_MEMBER });

  const state = useRewardsStore.getState();
  snapshot = { scenarioId: state.scenarioId, member: state.member, shipmentCursor: state.shipmentCursor };
  // Always the same member, so the figures in the script hold.
  state.setScenario('close');

  bookedWith = 0;
  useRewardsTour.setState({ running: true, paused: false, bookingDemo: false });
  driverObj = driver({
    // No sliding cutout between steps: each is drawn where its element is.
    // The popover still fades in (index.css).
    animate: false,
    // The runner scrolls each element into place itself before showing it.
    smoothScroll: false,
    allowClose: true,
    allowKeyboardControl: false,
    overlayClickBehavior: 'none',
    disableActiveInteraction: true,
    overlayOpacity: 0.62,
    overlayColor: '#0F1A2B',
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'bombino-tour',
    showProgress: true,
    onNextClick: () => skipWait?.(),
    onCloseClick: () => stopRewardsTour(),
    onDestroyStarted: () => stopRewardsTour(),
  });
  window.addEventListener('keydown', onKey);

  void run(id);
}

async function run(id: number): Promise<void> {
  try {
    for (let i = 0; i < STEPS.length; i++) {
      guard(id);
      const step = STEPS[i];
      // The screen is about to change under the highlight: hide it until the
      // new spot is ready, rather than leaving a cutout over the wrong thing.
      const switching = !!step.before || (!!step.path && window.location.pathname !== step.path);
      if (switching) setSwitching(true);
      if (step.before) await step.before();
      guard(id);
      if (step.path && window.location.pathname !== step.path) navigate(step.path);
      // The booking screen registers its controls once it has mounted.
      if (step.path === '/create') await waitForBridge(id);

      const el = step.element ? await waitFor(step.element, id) : null;
      guard(id);
      // A missing element is skipped rather than shown pointing at nothing.
      if (step.element && !el) {
        console.warn(`[rewards tour] skipped "${step.title}": ${step.element} not found`);
        continue;
      }
      const target = el ? await placeInView(el, id, step.interactive) : null;
      const ms = step.dwell ?? DEFAULT_DWELL;
      show(step, target, i, ms);
      setSwitching(false);
      const pauseOnTouch = (): void => {
        if (!useRewardsTour.getState().paused) togglePause();
      };
      // On the element itself: a stand-in box lets touches through to it.
      if (step.interactive) el?.addEventListener('pointerdown', pauseOnTouch);
      await dwell(ms, id);
      el?.removeEventListener('pointerdown', pauseOnTouch);
      guard(id);
      if (step.after) await step.after();
      await wait(350);
    }
    stopRewardsTour();
  } catch (err) {
    if (!(err instanceof TourStopped)) {
      console.error('[rewards tour]', err);
      stopRewardsTour();
    }
  }
}

/** End the demo, from anywhere, and put the member's figures back. */
export function stopRewardsTour(): void {
  if (!useRewardsTour.getState().running) return;
  runId++;
  skipWait?.();
  window.removeEventListener('keydown', onKey);
  document.documentElement.classList.remove('bombino-tour-paused');
  setSwitching(false);
  clearProxy();

  const d = driverObj;
  driverObj = null;
  if (d) {
    // destroy() calls onDestroyStarted again; `running` is still true here, so
    // clear the hooks first or this recurses.
    d.setConfig({ ...d.getConfig(), onDestroyStarted: undefined, onCloseClick: undefined });
    d.destroy();
  }

  if (snapshot) {
    useRewardsStore.setState({ ...snapshot, lastEarn: null, tierUp: null });
    snapshot = null;
  }
  useRewardsTour.setState({ running: false, paused: false, bookingDemo: false, bridge: null });

  // Back to whoever was here before. A visitor who could not see rewards is
  // not left on /rewards, and nobody is left on the booking form with the
  // dummy shipment in it.
  const before = authSnapshot ?? { isLoggedIn: false, user: null };
  authSnapshot = null;
  useAppStore.setState(before);
  const path = window.location.pathname;
  if (path.startsWith('/create') || (path === '/rewards' && !before.isLoggedIn)) {
    navigate(before.isLoggedIn ? '/rewards' : '/home', { replace: true });
  }
}
