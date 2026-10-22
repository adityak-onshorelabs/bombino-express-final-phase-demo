/**
 * Bombino Rewards: the tier ladder and the arithmetic behind it.
 *
 * The rules are written up in docs/rewards/rewards-logic.md, which is the
 * source of truth. This file is that doc in code, and nothing more. It is
 * UI-only for now: no API exists yet, so every member figure on screen comes
 * from DEMO_SCENARIOS below.
 *
 * Two rules shape everything here:
 *  - A tier unlocks on yearly billing (excl. GST) OR yearly weight, whichever
 *    reaches the target first. So a customer's tier is the highest one where
 *    either figure clears the bar.
 *  - ₹100 billed earns 1 point. A balance can be redeemed only once it
 *    reaches 100 points.
 */

export type TierId = 'standard' | 't1' | 't2' | 't3' | 't4' | 't5';

export interface Tier {
  id: TierId;
  rank: number;
  name: string;
  /** Yearly billing, excl. GST, that unlocks this tier. 0 for Standard. */
  value: number;
  /** Yearly shipped weight in kg that unlocks this tier. 0 for Standard. */
  weightKg: number;
  /** Bombino has not sent the T5 targets yet; the figures are a stand-in. */
  placeholder?: boolean;
}

export const TIERS: readonly Tier[] = [
  { id: 'standard', rank: 0, name: 'Standard', value: 0, weightKg: 0 },
  { id: 't1', rank: 1, name: 'Tier 1', value: 5_00_000, weightKg: 700 },
  { id: 't2', rank: 2, name: 'Tier 2', value: 10_00_000, weightKg: 1_400 },
  { id: 't3', rank: 3, name: 'Tier 3', value: 20_00_000, weightKg: 2_800 },
  { id: 't4', rank: 4, name: 'Tier 4', value: 30_00_000, weightKg: 4_400 },
  // Placeholder until Bombino confirms (open question 2 in the doc).
  { id: 't5', rank: 5, name: 'Tier 5', value: 50_00_000, weightKg: 7_000, placeholder: true },
];

/** ₹ billed (excl. GST) per point earned. */
export const RUPEES_PER_POINT = 100;
/** A balance below this cannot be redeemed. */
export const REDEEM_MIN_POINTS = 100;

export function tierById(id: TierId): Tier {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}

/** Highest tier where billing OR weight has reached the target. */
export function tierFor(billing: number, weightKg: number): Tier {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (tier.rank === 0) continue;
    if (billing >= tier.value || weightKg >= tier.weightKg) current = tier;
  }
  return current;
}

export function nextTier(tier: Tier): Tier | null {
  return TIERS.find((t) => t.rank === tier.rank + 1) ?? null;
}

export interface TierProgress {
  current: Tier;
  next: Tier | null;
  /** 0–1 toward next.value. */
  valuePct: number;
  /** 0–1 toward next.weightKg. */
  weightPct: number;
  /** The further-along of the two paths, because either one completes it. */
  pct: number;
  leading: 'value' | 'weight';
  valueLeft: number;
  weightLeft: number;
}

export function progressFor(billing: number, weightKg: number): TierProgress {
  const current = tierFor(billing, weightKg);
  const next = nextTier(current);
  if (!next) {
    return {
      current,
      next: null,
      valuePct: 1,
      weightPct: 1,
      pct: 1,
      leading: 'value',
      valueLeft: 0,
      weightLeft: 0,
    };
  }
  const valuePct = Math.min(billing / next.value, 1);
  const weightPct = Math.min(weightKg / next.weightKg, 1);
  return {
    current,
    next,
    valuePct,
    weightPct,
    pct: Math.max(valuePct, weightPct),
    leading: weightPct > valuePct ? 'weight' : 'value',
    valueLeft: Math.max(next.value - billing, 0),
    weightLeft: Math.max(next.weightKg - weightKg, 0),
  };
}

/** Points earned on one order's billing, excl. GST. */
export function pointsFor(billingExGst: number): number {
  return Math.floor(billingExGst / RUPEES_PER_POINT);
}

/**
 * The year that tiers are counted over. Assumed to be the Indian financial
 * year, Apr–Mar (open question 3).
 */
export function rewardsYear(now: Date = new Date()): { label: string; ends: Date; daysLeft: number } {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const ends = new Date(startYear + 1, 2, 31, 23, 59, 59);
  const daysLeft = Math.max(Math.ceil((ends.getTime() - now.getTime()) / 86_400_000), 0);
  return {
    label: `FY ${startYear}–${String(startYear + 1).slice(2)}`,
    ends,
    daysLeft,
  };
}

/** ₹4,62,000 → "₹4.62 L"; under a lakh stays in full Indian grouping. */
export function formatInrShort(amount: number): string {
  if (amount >= 1_00_000) {
    const lakhs = amount / 1_00_000;
    const fixed = Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(2).replace(/\.?0+$/, '');
    return `₹${fixed} L`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatKg(kg: number): string {
  return `${Math.round(kg).toLocaleString('en-IN')} kg`;
}

export function formatPoints(points: number): string {
  return points.toLocaleString('en-IN');
}

// ─── Demo data ─────────────────────────────────────────────────────────────

export interface PointsEntry {
  id: string;
  kind: 'earn' | 'redeem';
  label: string;
  /** Order number for an earn row. */
  ref?: string;
  date: string;
  points: number;
}

export interface RewardsMember {
  /** This year's billing, excl. GST. */
  billing: number;
  /** This year's shipped weight in kg. */
  weightKg: number;
  /** Spendable balance. */
  points: number;
  history: PointsEntry[];
}

export type ScenarioId = 'new' | 'close' | 'weight' | 'top';

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  member: RewardsMember;
}

function earn(id: string, ref: string, date: string, billing: number): PointsEntry {
  return { id, kind: 'earn', label: 'Shipment to USA', ref, date, points: pointsFor(billing) };
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 'new',
    label: 'New member',
    member: {
      billing: 6_480,
      weightKg: 9,
      points: 64,
      history: [earn('n1', 'BOM-104233', '2026-10-18', 6_480)],
    },
  },
  {
    id: 'close',
    label: 'Close to Tier 1',
    member: {
      billing: 4_62_000,
      weightKg: 512,
      points: 1_620,
      history: [
        earn('c1', 'BOM-104219', '2026-10-17', 38_400),
        earn('c2', 'BOM-104102', '2026-10-09', 52_100),
        { id: 'c3', kind: 'redeem', label: 'Redeemed on a booking', date: '2026-09-28', points: -3_000 },
        earn('c4', 'BOM-103877', '2026-09-21', 27_650),
        earn('c5', 'BOM-103650', '2026-09-02', 61_300),
      ],
    },
  },
  {
    // Value alone says Tier 1; weight has already cleared Tier 2.
    id: 'weight',
    label: 'Tier 2 by weight',
    member: {
      billing: 8_40_000,
      weightKg: 1_620,
      points: 2_150,
      history: [
        earn('w1', 'BOM-104240', '2026-10-19', 44_800),
        earn('w2', 'BOM-104188', '2026-10-12', 71_200),
        earn('w3', 'BOM-104015', '2026-10-01', 39_900),
        { id: 'w4', kind: 'redeem', label: 'Redeemed on a booking', date: '2026-09-15', points: -6_000 },
      ],
    },
  },
  {
    id: 'top',
    label: 'Top tier',
    member: {
      billing: 52_80_000,
      weightKg: 7_340,
      points: 9_870,
      history: [
        earn('t1', 'BOM-104251', '2026-10-20', 1_84_000),
        earn('t2', 'BOM-104230', '2026-10-16', 2_12_500),
        earn('t3', 'BOM-104199', '2026-10-11', 96_400),
      ],
    },
  },
];

/** Shipments the demo's "Simulate a shipment" button cycles through. */
export const DEMO_SHIPMENTS: readonly { billing: number; weightKg: number }[] = [
  { billing: 48_500, weightKg: 62 },
  { billing: 27_300, weightKg: 34 },
  { billing: 72_900, weightKg: 118 },
  { billing: 15_600, weightKg: 21 },
];
