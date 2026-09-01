import { router } from 'expo-router';
import { useCartStore } from '../store/useCartStore';
import { DeviceEventEmitter } from 'react-native';

export interface UIAction {
  action: string;
  route?: string;
  category_id?: number;
  category_name?: string;
  menu_item_id?: number;
  quantity?: number;
  order_type?: string;
  order_id?: string;
  name?: string;
  phone?: string;
  payload?: any;
}

export const executeMobileAgentActions = (actions: UIAction[]) => {
  for (const act of actions) {
    try {
      switch (act.action) {
        case 'navigate':
          if (act.route) {
            router.push(act.route as any);
          }
          break;
        case 'go_back':
          if (router.canGoBack()) {
            router.back();
          }
          break;
        case 'add_to_cart':
          if (act.menu_item_id && act.quantity) {
            // Assume menu item data is passed via payload or fetched.
            // Since useCartStore requires the full item, we might need to 
            // construct it. If the agent didn't provide full item, we skip for now.
            if (act.payload && act.payload.item) {
                useCartStore.getState().addItem(act.payload.item, act.quantity);
            } else {
                console.warn('add_to_cart missing full item payload');
            }
          }
          break;
        case 'select_order_type':
          if (act.order_type) {
             useCartStore.getState().setOrderType(act.order_type);
          }
          break;
        case 'open_tracking':
          if (act.order_id) {
             router.push(`/track-order?id=${act.order_id}`);
          }
          break;
        case 'set_signup_name':
          if (act.name) {
            DeviceEventEmitter.emit('set_signup_name', act.name);
          }
          break;
        case 'set_signup_phone':
          if (act.phone) {
            DeviceEventEmitter.emit('set_signup_phone', act.phone);
          }
          break;
        default:
          console.log('Unhandled UI action:', act.action);
      }
    } catch (e) {
      console.error('Failed to execute action:', act, e);
    }
  }
};
