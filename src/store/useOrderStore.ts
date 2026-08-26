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

export interface PastOrder {
  orderId: string;
  dbOrderId: string;
  date: string;
  total: number;
  itemsCount: number;
  status: string;
}

interface OrderState {
  pastOrders: PastOrder[];
  currentOrder: any | null; // Detailed current order obj

  addPastOrder: (order: PastOrder) => void;
  setCurrentOrder: (order: any) => void;
  clearCurrentOrder: () => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      pastOrders: [],
      currentOrder: null,

      addPastOrder: (order) => set((state) => ({ pastOrders: [order, ...state.pastOrders] })),
      setCurrentOrder: (currentOrder) => set({ currentOrder }),
      clearCurrentOrder: () => set({ currentOrder: null })
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(() => webSafeStorage),
      partialize: (state) => ({ pastOrders: state.pastOrders }), // only persist past orders
    }
  )
);
