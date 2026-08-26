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

interface AuthState {
  customerId: number | null;
  customerName: string | null;
  phone: string | null;
  token: string | null;
  isAuthenticated: boolean;
  
  login: (data: { customerId: number; customerName: string; phone: string; token: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      customerId: 1,
      customerName: 'Test User',
      phone: '1234567890',
      token: 'test_token_123',
      isAuthenticated: true,

      login: (data) => set({ 
        customerId: data.customerId, 
        customerName: data.customerName, 
        phone: data.phone, 
        token: data.token, 
        isAuthenticated: true 
      }),
      logout: () => set({ 
        customerId: null, 
        customerName: null, 
        phone: null, 
        token: null, 
        isAuthenticated: false 
      }),
    }),
    {
      name: 'auth-storage-v2',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
