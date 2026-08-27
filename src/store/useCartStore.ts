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

export interface CartItem {
  id: number | string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  category: string;
  desc?: string;
  note?: string;
}

export type OrderType = 'Dine In' | 'Take Away' | 'Delivery';

interface CartState {
  items: Record<string | number, CartItem>;
  orderType: OrderType;
  tableNumber: string;
  tableStatus: string | null;
  discountCode: string | null;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (id: number) => void;
  incrementQuantity: (id: number) => void;
  decrementQuantity: (id: number) => void;
  clearCart: () => void;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (tableNumber: string) => void;
  setTableStatus: (tableStatus: string | null) => void;
  applyDiscount: (code: string) => void;
  removeDiscount: () => void;

  // Computed
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getItemCount: () => number;
  getGst: () => number;
  getServiceCharge: () => number;

  getGrandTotal: (explicitDiscountAmount?: number) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
  items: {},
  orderType: 'Dine In',
  tableNumber: '',
  tableStatus: null,
  discountCode: null,

  addItem: (item) => set((state) => {
    const existing = state.items[item.id];
    return {
      items: {
        ...state.items,
        [item.id]: {
          ...item,
          quantity: existing ? existing.quantity + (item.quantity || 1) : (item.quantity || 1)
        }
      }
    };
  }),

  removeItem: (id) => set((state) => {
    const { [id]: _, ...rest } = state.items;
    return { items: rest };
  }),

  incrementQuantity: (id) => set((state) => {
    const existing = state.items[id];
    if (!existing) return state;
    return {
      items: {
        ...state.items,
        [id]: { ...existing, quantity: existing.quantity + 1 }
      }
    };
  }),

  decrementQuantity: (id) => set((state) => {
    const existing = state.items[id];
    if (!existing) return state;
    if (existing.quantity <= 1) {
      const { [id]: _, ...rest } = state.items;
      return { items: rest };
    }
    return {
      items: {
        ...state.items,
        [id]: { ...existing, quantity: existing.quantity - 1 }
      }
    };
  }),

  clearCart: () => set({ items: {}, discountCode: null }),
  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setTableStatus: (tableStatus) => set({ tableStatus }),
  applyDiscount: (code) => set({ discountCode: code }),
  removeDiscount: () => set({ discountCode: null }),

  getSubtotal: () => {
    return Object.values(get().items).reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  getItemCount: () => {
    return Object.keys(get().items).length;
  },

  getGst: () => 0,
  getServiceCharge: () => 0,


  getDiscountAmount: () => {
    const code = get().discountCode;
    if (!code) return 0;
    const match = code.match(/(\d+)%/);
    if (!match) return 0;
    return get().getSubtotal() * (parseInt(match[1], 10) / 100);
  },

  getGrandTotal: () => {
    const { getSubtotal, getGst, getServiceCharge, getDiscountAmount } = get();
    return getSubtotal() - getDiscountAmount() + getGst() + getServiceCharge();
  }
}),
{
  name: 'cart-storage',
  storage: createJSONStorage(() => webSafeStorage),
}
)
);
