import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEMO_SCENARIOS,
  DEMO_SHIPMENTS,
  pointsFor,
  tierFor,
  type PendingEarn,
  type RewardsMember,
  type ScenarioId,
  type TierId,
} from './rewards';

/**
 * Demo state for the rewards screens.
 *
 * Rewards has no API yet, so this stands in for one: the member's figures,
 * plus the two demo controls (pick a scenario, simulate a shipment) that let
 * the flows be shown end to end. It is persisted so a reload mid-demo does not
 * jump back to the start. When the API lands, this becomes a React Query hook
 * and the demo controls go away.
 *
 * The lifecycle of a booking's points, as the API will have to keep it:
 *  - Points used are taken off at booking (or when a due payment goes through).
 *  - Points earned wait in `pending` until the order settles, because the
 *    order can still be reweighed or cancelled.
 *  - A cancelled order gives back the points used on it and drops its pending
 *    earn.
 */

function scenario(id: ScenarioId): RewardsMember {
  const found = DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];
  // Copied so a simulated shipment never mutates the fixture.
  return { ...found.member, history: [...found.member.history], pending: [...found.member.pending] };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_SCENARIO: ScenarioId = 'close';

interface RewardsState {
  scenarioId: ScenarioId;
  member: RewardsMember;
  /** The account these figures belong to. Another account starts afresh. */
  ownerId: string | null;
  /** Points from the latest earn, so the wallet can show "+N". */
  lastEarn: { id: string; points: number } | null;
  /** Set when a shipment pushes the member up a tier; drives the celebration. */
  tierUp: TierId | null;
  shipmentCursor: number;

  setScenario: (id: ScenarioId) => void;
  simulateShipment: () => void;
  /** Spend points on a payment. `ref` is the order they went against. */
  redeem: (points: number, ref?: string) => void;
  /** A booking's points, held until the order settles. One per order. */
  addPending: (earn: Omit<PendingEarn, 'date'>) => void;
  /** Points were used on a due payment: the order's pending earn shrinks to what is paid. */
  repricePending: (ref: string, billingExGst: number) => void;
  /** The order settled: its pending points land and count towards the tier. */
  settle: (ref: string) => void;
  /** The order was cancelled: points used on it come back, its earn is dropped. */
  refund: (ref: string) => void;
  /** Point the demo figures at the signed-in account. */
  bindOwner: (id: string) => void;
  dismissTierUp: () => void;
}

export const useRewardsStore = create<RewardsState>()(
  persist(
    (set) => ({
      scenarioId: DEFAULT_SCENARIO,
      member: scenario(DEFAULT_SCENARIO),
      ownerId: null,
      lastEarn: null,
      tierUp: null,
      shipmentCursor: 0,

      setScenario: (id) =>
        set({ scenarioId: id, member: scenario(id), lastEarn: null, tierUp: null }),

      simulateShipment: () =>
        set((state) => {
          const shipment = DEMO_SHIPMENTS[state.shipmentCursor % DEMO_SHIPMENTS.length];
          const before = tierFor(state.member.billing, state.member.weightKg);
          const billing = state.member.billing + shipment.billing;
          const weightKg = state.member.weightKg + shipment.weightKg;
          const after = tierFor(billing, weightKg);
          const points = pointsFor(shipment.billing);
          const id = `sim-${Date.now()}`;
          const orderNo = `BOM-${String(104300 + state.shipmentCursor).padStart(6, '0')}`;
          return {
            member: {
              ...state.member,
              billing,
              weightKg,
              points: state.member.points + points,
              history: [
                { id, kind: 'earn', label: 'Shipment to USA', ref: orderNo, date: today(), points },
                ...state.member.history,
              ],
            },
            lastEarn: { id, points },
            tierUp: after.rank > before.rank ? after.id : state.tierUp,
            shipmentCursor: state.shipmentCursor + 1,
          };
        }),

      redeem: (points, ref) =>
        set((state) => ({
          member: {
            ...state.member,
            points: Math.max(state.member.points - points, 0),
            history: [
              {
                id: `red-${Date.now()}`,
                kind: 'redeem',
                label: 'Used on a payment',
                ref,
                date: today(),
                points: -points,
              },
              ...state.member.history,
            ],
          },
          lastEarn: null,
        })),

      addPending: (earn) =>
        set((state) => {
          if (earn.points <= 0 || state.member.pending.some((p) => p.ref === earn.ref)) return state;
          return {
            member: { ...state.member, pending: [{ ...earn, date: today() }, ...state.member.pending] },
          };
        }),

      repricePending: (ref, billingExGst) =>
        set((state) => {
          if (!state.member.pending.some((p) => p.ref === ref)) return state;
          return {
            member: {
              ...state.member,
              pending: state.member.pending.map((p) =>
                p.ref === ref ? { ...p, billing: billingExGst, points: pointsFor(billingExGst) } : p,
              ),
            },
          };
        }),

      settle: (ref) =>
        set((state) => {
          const due = state.member.pending.find((p) => p.ref === ref);
          if (!due) return state;
          const before = tierFor(state.member.billing, state.member.weightKg);
          const billing = state.member.billing + due.billing;
          const weightKg = state.member.weightKg + due.weightKg;
          const after = tierFor(billing, weightKg);
          const id = `earn-${Date.now()}`;
          return {
            member: {
              ...state.member,
              billing,
              weightKg,
              points: state.member.points + due.points,
              pending: state.member.pending.filter((p) => p.ref !== ref),
              history: [
                { id, kind: 'earn', label: 'Shipment to USA', ref, date: today(), points: due.points },
                ...state.member.history,
              ],
            },
            lastEarn: { id, points: due.points },
            tierUp: after.rank > before.rank ? after.id : state.tierUp,
          };
        }),

      refund: (ref) =>
        set((state) => {
          const { history, pending } = state.member;
          const used = history
            .filter((h) => h.ref === ref && h.kind === 'redeem')
            .reduce((sum, h) => sum - h.points, 0);
          const alreadyBack = history.some((h) => h.ref === ref && h.kind === 'refund');
          const giveBack = used > 0 && !alreadyBack;
          const hasPending = pending.some((p) => p.ref === ref);
          if (!giveBack && !hasPending) return state;
          return {
            member: {
              ...state.member,
              points: state.member.points + (giveBack ? used : 0),
              pending: pending.filter((p) => p.ref !== ref),
              history: giveBack
                ? [
                    {
                      id: `ref-${Date.now()}`,
                      kind: 'refund',
                      label: 'Returned: order cancelled',
                      ref,
                      date: today(),
                      points: used,
                    },
                    ...history,
                  ]
                : history,
            },
          };
        }),

      bindOwner: (id) =>
        set((state) => {
          if (state.ownerId === id) return state;
          // The first account on this device keeps whatever the demo was
          // showing; a different account must not inherit that balance.
          if (state.ownerId === null) return { ownerId: id };
          return {
            ownerId: id,
            scenarioId: DEFAULT_SCENARIO,
            member: scenario(DEFAULT_SCENARIO),
            lastEarn: null,
            tierUp: null,
            shipmentCursor: 0,
          };
        }),

      dismissTierUp: () => set({ tierUp: null }),
    }),
    {
      name: 'bombino-rewards-demo',
      version: 1,
      // v0 had no pending earns and no owner.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<Pick<RewardsState, 'member' | 'ownerId'>>;
        if (version < 1 && state.member) {
          state.member = { ...state.member, pending: state.member.pending ?? [] };
        }
        return state as RewardsState;
      },
      partialize: (state) => ({
        scenarioId: state.scenarioId,
        member: state.member,
        ownerId: state.ownerId,
        shipmentCursor: state.shipmentCursor,
      }),
    },
  ),
);
