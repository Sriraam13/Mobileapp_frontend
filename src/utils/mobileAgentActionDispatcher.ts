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
            if (act.payload && act.payload.item) {
                useCartStore.getState().addItem({
                  ...act.payload.item,
                  category: act.payload.item.category ?? 'General',
                  quantity: act.quantity
                });
            } else {
                console.warn('add_to_cart missing full item payload');
            }
          }
          break;
        case 'select_order_type':
          if (act.order_type) {
             const validTypes = ['Dine In', 'Take Away', 'Delivery'] as const;
             const matched = validTypes.find(t => t === act.order_type);
             if (matched) useCartStore.getState().setOrderType(matched);
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
