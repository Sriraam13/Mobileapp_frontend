import { useCartStore } from './useCartStore';
import { useOrderStore } from './useOrderStore';
import { useLiveOrderStore } from './useLiveOrderStore';
import { useDineInSessionStore } from './useDineInSessionStore';
// Note: usePaymentStore might need to be created or imported if it exists

export const completeTakeawaySession = (keepOrderId = true) => {
  useCartStore.getState().clearCart();
  
  if (!keepOrderId) {
    useOrderStore.getState().clearCurrentOrder();
    useLiveOrderStore.getState().clearLiveOrder();
  } else {
    // Retain completed order ID for receipt/feedback/reorder
    // We clear polling and live status, but keep the ID
    const liveStore = useLiveOrderStore.getState();
    liveStore.setPollingActive(false);
  }
};

export const completeDeliverySession = (keepOrderId = true) => {
  useCartStore.getState().clearCart();
  
  const liveStore = useLiveOrderStore.getState();
  liveStore.setPollingActive(false);
  
  if (!keepOrderId) {
    useOrderStore.getState().clearCurrentOrder();
    liveStore.clearLiveOrder();
  }
};

export const closeDineInSession = () => {
  useCartStore.getState().clearCart();
  useDineInSessionStore.getState().closeSession();
  useOrderStore.getState().clearCurrentOrder();
};


import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Automatically purges an order across all customer stores and local storage
 * when it has been deleted from the database.
 */
export const purgeDeletedOrderLocally = async (dbOrderIdOrOrderId: string | number) => {
  if (!dbOrderIdOrOrderId) return;
  const targetRaw = String(dbOrderIdOrOrderId).trim();
  const targetIdStr = targetRaw.replace(/\D/g, '');

  try {
    // 1. Clear live order if it matches the deleted order
    const liveOrder = useLiveOrderStore.getState();
    const liveDbId = String(liveOrder.dbOrderId || '').replace(/\D/g, '');
    const liveOrdId = String(liveOrder.orderId || '').trim();
    if ((targetIdStr && liveDbId === targetIdStr) || liveOrdId === targetRaw) {
      liveOrder.clearLiveOrder();
    }

    // 2. Remove from useOrderStore
    useOrderStore.getState().removePastOrder(targetRaw);
    if (targetIdStr) {
      useOrderStore.getState().removePastOrder(targetIdStr);
    }

    // 3. Remove from userOrders in AsyncStorage / localStorage
    let storedOrders: string | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      storedOrders = localStorage.getItem('userOrders');
    } else {
      storedOrders = await AsyncStorage.getItem('userOrders');
    }
    if (!storedOrders && typeof localStorage !== 'undefined') {
      storedOrders = localStorage.getItem('userOrders');
    }

    if (storedOrders) {
      const parsed = JSON.parse(storedOrders);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((o: any) => {
          const oDb = String(o.dbOrderId || o.id || '').replace(/\D/g, '');
          const oOrd = String(o.orderId || '').trim();
          if (targetIdStr && oDb === targetIdStr) return false;
          if (oOrd === targetRaw) return false;
          return true;
        });
        const serialized = JSON.stringify(filtered);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          localStorage.setItem('userOrders', serialized);
        } else {
          await AsyncStorage.setItem('userOrders', serialized);
        }
      }
    }
  } catch (err) {
    console.warn('[purgeDeletedOrderLocally] Cleanup note:', err);
  }
};
