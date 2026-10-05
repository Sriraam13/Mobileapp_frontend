import { create } from 'zustand';

interface CateringSessionState {
  orderType: 'Catering Order' | 'Party Order';
  eventName: string;
  date: string;
  time: string;
  occasion: string;
  guestCount: string;
  serviceType: string;
  address: string;
  setOrderType: (type: 'Catering Order' | 'Party Order') => void;
  setEventDetails: (details: Partial<CateringSessionState>) => void;
  reset: () => void;
}

export const useCateringSessionStore = create<CateringSessionState>((set) => ({
  orderType: 'Catering Order',
  eventName: '',
  date: '',
  time: '',
  occasion: '',
  guestCount: '50',
  serviceType: 'Delivery Only',
  address: '',
  setOrderType: (type) => set({ orderType: type }),
  setEventDetails: (details) => set((state) => ({ ...state, ...details })),
  reset: () => set({
    orderType: 'Catering Order',
    eventName: '',
    date: '',
    time: '',
    occasion: '',
    guestCount: '50',
    serviceType: 'Delivery Only',
    address: '',
  }),
}));
