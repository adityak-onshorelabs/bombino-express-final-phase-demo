import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Shipment, shipments as initialShipments, Notification, notifications as initialNotifications } from './mockData';

export interface AuthUser {
  id: string;
  customerId: string;
  code: string;
  email: string;
  fullName: string;
  username: string;
  role: string;
}

interface AppState {
  hasSeenOnboarding: boolean;
  isLoggedIn: boolean;
  user: AuthUser | null;
  shipments: Shipment[];
  notifications: Notification[];

  setHasSeenOnboarding: (value: boolean) => void;
  login: (user: AuthUser) => void;
  logout: () => void;
  addShipment: (shipment: Shipment) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      isLoggedIn: false,
      user: null,
      shipments: initialShipments,
      notifications: initialNotifications,

      setHasSeenOnboarding: (value) => set({ hasSeenOnboarding: value }),

      login: (user) => set({ isLoggedIn: true, user }),

      logout: () => set({ isLoggedIn: false, user: null }),

      addShipment: (shipment) => set((state) => ({
        shipments: [shipment, ...state.shipments],
      })),

      addNotification: (notification) => set((state) => ({
        notifications: [notification, ...state.notifications],
      })),

      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, readAt: new Date() } : n
        ),
      })),
    }),
    {
      name: 'bombino-storage',
      partialize: (state) => ({
        hasSeenOnboarding: state.hasSeenOnboarding,
        isLoggedIn: state.isLoggedIn,
        user: state.user,
      }),
    }
  )
);
