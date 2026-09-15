import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const webSafeStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return localStorage.getItem(name);
    }
    return await AsyncStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem(name, value);
    } else {
      await AsyncStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.removeItem(name);
    } else {
      await AsyncStorage.removeItem(name);
    }
  },
};

export interface DineInItem {
  id: number | string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
}

export interface DineInBatch {
  id: string;
  items: any[];
  status: string;
  total: number;
}

interface DineInSessionState {
  isActive: boolean;
  tableNumber: string | null;
  tableId: string | null;
  sessionId: string | null;
  activeOrderId: string | null;
  activeDbOrderId: number | string | null;
  orderedItems: DineInItem[];
  totalAmount: number;
  unpaidTotal: number;
  paymentStatus: 'Pending' | 'Paid';
  batches: DineInBatch[];

  startDineInOrder: (
    tableNumber: string,
    orderId: string,
    dbOrderId: number | string,
    items: DineInItem[],
    total: number
  ) => void;
  appendItemsToOrder: (newItems: DineInItem[], additionalAmount: number) => void;
  completeDineInSession: () => void;

  // Backward-compatibility aliases
  startSession: (tableId: string, sessionId: string) => void;
  addBatch: (batch: DineInBatch) => void;
  updateBatchStatus: (batchId: string, status: string) => void;
  closeSession: () => void;
}

export const useDineInSessionStore = create<DineInSessionState>()(
  persist(
    (set, get) => ({
      isActive: false,
      tableNumber: null,
      tableId: null,
      sessionId: null,
      activeOrderId: null,
      activeDbOrderId: null,
      orderedItems: [],
      totalAmount: 0,
      unpaidTotal: 0,
      paymentStatus: 'Pending',
      batches: [],

      startDineInOrder: (tableNumber, orderId, dbOrderId, items, total) =>
        set({
          isActive: true,
          tableNumber,
          tableId: tableNumber,
          activeOrderId: orderId,
          activeDbOrderId: dbOrderId,
          sessionId: orderId,
          orderedItems: [...items],
          totalAmount: total,
          unpaidTotal: total,
          paymentStatus: 'Pending',
          batches: [
            {
              id: `batch-${Date.now()}`,
              items: [...items],
              status: 'CONFIRMED',
              total,
            },
          ],
        }),

      appendItemsToOrder: (newItems, additionalAmount) =>
        set((state) => {
          // Merge items or increment quantities if identical item exists
          const existingItems = [...state.orderedItems];
          newItems.forEach((newItem) => {
            const idx = existingItems.findIndex((x) => x.id === newItem.id);
            if (idx > -1) {
              existingItems[idx] = {
                ...existingItems[idx],
                quantity: existingItems[idx].quantity + newItem.quantity,
              };
            } else {
              existingItems.push(newItem);
            }
          });

          const newTotal = state.totalAmount + additionalAmount;
          return {
            orderedItems: existingItems,
            totalAmount: newTotal,
            unpaidTotal: newTotal,
            batches: [
              ...state.batches,
              {
                id: `batch-${Date.now()}`,
                items: [...newItems],
                status: 'CONFIRMED',
                total: additionalAmount,
              },
            ],
          };
        }),

      completeDineInSession: () =>
        set({
          isActive: false,
          tableNumber: null,
          tableId: null,
          sessionId: null,
          activeOrderId: null,
          activeDbOrderId: null,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Paid',
          batches: [],
        }),

      // Backward-compatible methods
      startSession: (tableId, sessionId) =>
        set({
          isActive: true,
          tableId,
          tableNumber: tableId,
          sessionId,
          activeOrderId: sessionId,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Pending',
          batches: [],
        }),

      addBatch: (batch) =>
        set((state) => ({
          batches: [...state.batches, batch],
          unpaidTotal: state.unpaidTotal + batch.total,
          totalAmount: state.totalAmount + batch.total,
        })),

      updateBatchStatus: (batchId, status) =>
        set((state) => ({
          batches: state.batches.map((b) => (b.id === batchId ? { ...b, status } : b)),
        })),

      closeSession: () =>
        set({
          isActive: false,
          tableNumber: null,
          tableId: null,
          sessionId: null,
          activeOrderId: null,
          activeDbOrderId: null,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Paid',
          batches: [],
        }),
    }),
    {
      name: 'dine-in-session-storage',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
