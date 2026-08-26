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

export interface DineInBatch {
  id: string;
  items: any[];
  status: string;
  total: number;
}

interface DineInSessionState {
  isActive: boolean;
  tableId: string | null;
  sessionId: string | null; // Backend session ID
  batches: DineInBatch[];
  unpaidTotal: number;

  startSession: (tableId: string, sessionId: string) => void;
  addBatch: (batch: DineInBatch) => void;
  updateBatchStatus: (batchId: string, status: string) => void;
  closeSession: () => void;
}

export const useDineInSessionStore = create<DineInSessionState>()(
  persist(
    (set, get) => ({
      isActive: false,
      tableId: null,
      sessionId: null,
      batches: [],
      unpaidTotal: 0,

      startSession: (tableId, sessionId) => set({ isActive: true, tableId, sessionId, batches: [], unpaidTotal: 0 }),
      
      addBatch: (batch) => set((state) => ({ 
        batches: [...state.batches, batch],
        unpaidTotal: state.unpaidTotal + batch.total 
      })),

      updateBatchStatus: (batchId, status) => set((state) => ({
        batches: state.batches.map(b => b.id === batchId ? { ...b, status } : b)
      })),

      closeSession: () => set({
        isActive: false,
        tableId: null,
        sessionId: null,
        batches: [],
        unpaidTotal: 0
      })
    }),
    {
      name: 'dine-in-session-storage',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
