import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEMO_SCENARIOS,
  DEMO_SHIPMENTS,
  pointsFor,
  tierFor,
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
 */

function scenario(id: ScenarioId): RewardsMember {
  const found = DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];
  // Copied so a simulated shipment never mutates the fixture.
  return { ...found.member, history: [...found.member.history] };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RewardsState {
  scenarioId: ScenarioId;
  member: RewardsMember;
  /** Points from the latest simulated shipment, so the wallet can show "+N". */
  lastEarn: { id: string; points: number } | null;
  /** Set when a shipment pushes the member up a tier; drives the celebration. */
  tierUp: TierId | null;
  shipmentCursor: number;

  setScenario: (id: ScenarioId) => void;
  simulateShipment: () => void;
  redeem: (points: number) => void;
  dismissTierUp: () => void;
}

export const useRewardsStore = create<RewardsState>()(
  persist(
    (set) => ({
      scenarioId: 'close',
      member: scenario('close'),
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

      redeem: (points) =>
        set((state) => ({
          member: {
            ...state.member,
            points: state.member.points - points,
            history: [
              {
                id: `red-${Date.now()}`,
                kind: 'redeem',
                label: 'Redeemed on next booking',
                date: today(),
                points: -points,
              },
              ...state.member.history,
            ],
          },
          lastEarn: null,
        })),

      dismissTierUp: () => set({ tierUp: null }),
    }),
    {
      name: 'bombino-rewards-demo',
      partialize: (state) => ({
        scenarioId: state.scenarioId,
        member: state.member,
        shipmentCursor: state.shipmentCursor,
      }),
    },
  ),
);
