/**
 * mobileAgentActionDispatcher.ts
 *
 * PHASES 3, 4, 5, 7, 8, 9, 10, 11, 12, 13 — Complete action dispatcher
 *
 * ARCHITECTURE:
 *   Vapi tool call → handleVapiToolCall() → executeSingleAction() → result → Vapi
 *
 * ALL actions are validated against SUPPORTED_ACTIONS.
 * ALL routes are validated against SCREEN_REGISTRY / resolveRoute().
 * NO eval(). NO arbitrary function execution. NO direct DB writes.
 *
 * Returns ActionResult for every call so Vapi can confirm success/failure
 * before speaking to the customer.
 */

import { router } from 'expo-router';
import { DeviceEventEmitter } from 'react-native';
import { useCartStore } from '../store/useCartStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useVoiceAgentStore } from '../store/useVoiceAgentStore';
import { useAddressStore } from '../store/useAddressStore';
import { SUPPORTED_ACTIONS, resolveRoute } from './agentRegistry';

// ─── Active Router Reference ──────────────────────────────────────────────────
let activeRouter: any = null;

export function setActiveRouter(r: any) {
  if (r) {
    activeRouter = r;
  }
}

export function getActiveRouter() {
  return activeRouter || router;
}

/**
 * Safely navigates to a screen while auto-hiding the voice modal so the screen is visible.
 * The voice call stays connected and active in the background.
 */
export function navigateScreen(resolvedRoute: string, params?: Record<string, any>) {
  console.log(`[Dispatcher] navigateScreen triggered -> target: "${resolvedRoute}"`, params || '');

  // Dismiss modal overlay so the destination screen is visible to the user immediately
  try {
    useVoiceAgentStore.getState().hideAgent();
  } catch (err) {
    console.warn('[Dispatcher] Could not minimize voice modal:', err);
  }

  const r = getActiveRouter();

  setTimeout(() => {
    try {
      if (params && Object.keys(params).length > 0) {
        r.push({ pathname: resolvedRoute as any, params });
      } else {
        r.push(resolvedRoute as any);
      }
      console.log(`[Dispatcher] Successfully navigated to ${resolvedRoute}`);
    } catch (pushErr) {
      console.warn(`[Dispatcher] router.push failed, falling back to router.replace:`, pushErr);
      try {
        if (params && Object.keys(params).length > 0) {
          r.replace({ pathname: resolvedRoute as any, params });
        } else {
          r.replace(resolvedRoute as any);
        }
        console.log(`[Dispatcher] Successfully replaced to ${resolvedRoute}`);
      } catch (repErr) {
        console.error(`[Dispatcher] Complete navigation failure for "${resolvedRoute}":`, repErr);
      }
    }
  }, 50);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  action: string;
  message: string;
  data?: any;
}

export interface UIAction {
  action: string;
  route?: string;
  category_id?: number;
  category_name?: string;
  menu_item_id?: number;
  quantity?: number;
  order_type?: string;
  order_id?: string;
  db_order_id?: string;
  name?: string;
  phone?: string;
  payload?: any;
}

// ─── Single Action Executor ───────────────────────────────────────────────────

export async function executeSingleAction(act: UIAction): Promise<ActionResult> {
  const { action } = act;

  // Validate action against registry
  if (!SUPPORTED_ACTIONS.has(action)) {
    console.warn(`[Dispatcher] Unknown action rejected: "${action}"`);
    return { success: false, action, message: `Action "${action}" is not supported.` };
  }

  try {
    switch (action) {

      // ── Navigation ──────────────────────────────────────────────────────────

      case 'navigate': {
        const rawRoute = act.route || '';
        const resolved = resolveRoute(rawRoute);
        if (!resolved) {
          console.warn(`[Dispatcher] Route "${rawRoute}" could not be resolved!`);
          return { success: false, action, message: `Route "${rawRoute}" is not a supported screen.` };
        }

        const params = act.payload?.params || {};
        navigateScreen(resolved, params);
        return { success: true, action, message: `Navigated to ${resolved}`, data: { route: resolved } };
      }

      case 'go_back': {
        try {
          useVoiceAgentStore.getState().hideAgent();
        } catch {}
        const r = getActiveRouter();
        setTimeout(() => {
          if (r.canGoBack && r.canGoBack()) {
            r.back();
          } else {
            navigateScreen('/home');
          }
        }, 50);
        return { success: true, action, message: 'Went back.' };
      }

      // ── Authentication form field fill (via events) ──────────────────────────

      case 'set_signup_name': {
        if (!act.name) return { success: false, action, message: 'No name provided.' };
        DeviceEventEmitter.emit('set_signup_name', act.name);
        return { success: true, action, message: `Name set to ${act.name}`, data: { name: act.name } };
      }

      case 'set_signup_phone': {
        if (!act.phone) return { success: false, action, message: 'No phone provided.' };
        DeviceEventEmitter.emit('set_signup_phone', act.phone);
        return { success: true, action, message: `Phone set to ${act.phone}`, data: { phone: act.phone } };
      }

      // ── Order Type ───────────────────────────────────────────────────────────

      case 'set_order_type':
      case 'select_order_type':
      case 'switch_order_type':
      case 'switch_mode':
      case 'set_order_mode':
      case 'switch_to_takeaway':
      case 'switch_to_dine_in':
      case 'switch_to_delivery': {
        const raw = (
          act.order_type ||
          (act as any).mode ||
          (act as any).order_mode ||
          (act as any).type ||
          (action === 'switch_to_takeaway' ? 'Take Away' : '') ||
          (action === 'switch_to_dine_in' ? 'Dine In' : '') ||
          (action === 'switch_to_delivery' ? 'Delivery' : '') ||
          ''
        ).trim();

        if (!raw) return { success: false, action, message: 'No order type specified.' };

        const normalized = raw.toLowerCase().replace(/[^a-z]/g, '');
        let mapped: 'Take Away' | 'Dine In' | 'Delivery' | null = null;

        if (
          normalized.includes('takeaway') ||
          normalized.includes('takeout') ||
          normalized.includes('parcel') ||
          normalized.includes('pickup')
        ) {
          mapped = 'Take Away';
        } else if (
          normalized.includes('dine') ||
          normalized.includes('table') ||
          normalized.includes('eatin')
        ) {
          mapped = 'Dine In';
        } else if (
          normalized.includes('deliver') ||
          normalized.includes('home')
        ) {
          mapped = 'Delivery';
        }

        if (!mapped) {
          return { success: false, action, message: `Unknown order type: "${raw}". Valid types: Dine In, Take Away, Delivery.` };
        }
        useCartStore.getState().setOrderType(mapped);
        return { success: true, action, message: `Order type successfully set to ${mapped}`, data: { orderType: mapped } };
      }

      // ── Cart: Add ────────────────────────────────────────────────────────────

      case 'add_to_cart': {
        const itemPayload = act.payload?.item;
        const qty = act.quantity || 1;

        if (!itemPayload || !itemPayload.id || !itemPayload.name || itemPayload.price == null) {
          return {
            success: false,
            action,
            message: 'Cannot add to cart: missing item details. The menu item must be resolved from real menu data first.',
          };
        }

        // Validate numeric ID
        const numId = Number(itemPayload.id);
        if (isNaN(numId) || numId <= 0) {
          return { success: false, action, message: `Invalid menu item ID: ${itemPayload.id}` };
        }

        useCartStore.getState().addItem({
          id: numId,
          name: String(itemPayload.name),
          price: Number(itemPayload.price),
          image: String(itemPayload.image || ''),
          quantity: qty,
          category: String(itemPayload.category || 'General'),
          desc: itemPayload.desc,
        });

        return {
          success: true,
          action,
          message: `Added ${qty}x ${itemPayload.name} to cart.`,
          data: { item_id: numId, name: itemPayload.name, quantity: qty },
        };
      }

      // ── Cart: Remove ─────────────────────────────────────────────────────────

      case 'remove_from_cart': {
        let itemId = act.menu_item_id || act.payload?.item_id;
        const cart = useCartStore.getState().items;
        const targetName = (act as any).item_name || act.payload?.item_name || act.payload?.name;
        if (!itemId && targetName) {
          const normTarget = String(targetName).toLowerCase().trim();
          const match = Object.values(cart).find(i => {
            const iName = i.name.toLowerCase().trim();
            return iName.includes(normTarget) || normTarget.includes(iName);
          });
          if (match) itemId = match.id;
        }
        if (!itemId) {
          const lastItem = Object.values(cart).pop();
          if (lastItem) {
            useCartStore.getState().removeItem(lastItem.id);
            return { success: true, action, message: `Removed ${lastItem.name} from cart.`, data: { item_id: lastItem.id } };
          }
          return { success: false, action, message: 'No item in cart to remove.' };
        }

        const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
        if (!existing) {
          return { success: false, action, message: `Item is not in cart.` };
        }
        useCartStore.getState().removeItem(existing.id);
        return { success: true, action, message: `Removed ${existing.name} from cart.`, data: { item_id: itemId } };
      }

      // ── Cart: Increment ──────────────────────────────────────────────────────

      case 'increment_cart_item': {
        const itemId = act.menu_item_id || act.payload?.item_id;
        if (!itemId) return { success: false, action, message: 'No item ID to increment.' };

        const cart = useCartStore.getState().items;
        const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
        if (!existing) return { success: false, action, message: `Item ${itemId} is not in cart.` };

        useCartStore.getState().incrementQuantity(existing.id);
        return {
          success: true,
          action,
          message: `Increased ${existing.name} quantity to ${existing.quantity + 1}.`,
          data: { item_id: itemId },
        };
      }

      // ── Cart: Decrement ──────────────────────────────────────────────────────

      case 'decrement_cart_item': {
        const itemId = act.menu_item_id || act.payload?.item_id;
        if (!itemId) return { success: false, action, message: 'No item ID to decrement.' };

        const cart = useCartStore.getState().items;
        const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
        if (!existing) return { success: false, action, message: `Item ${itemId} is not in cart.` };

        useCartStore.getState().decrementQuantity(existing.id);
        return {
          success: true,
          action,
          message: `Decreased ${existing.name} quantity.`,
          data: { item_id: itemId },
        };
      }

      // ── Cart: Set Quantity ────────────────────────────────────────────────────

      case 'set_cart_quantity': {
        const itemId = act.menu_item_id || act.payload?.item_id;
        const targetQty = act.quantity;
        if (!itemId || targetQty == null) return { success: false, action, message: 'No item ID or quantity provided.' };

        const cartState = useCartStore.getState();
        const cart = cartState.items;
        const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
        if (!existing) return { success: false, action, message: `Item ${itemId} is not in cart.` };

        const currentQty = existing.quantity;
        if (targetQty <= 0) {
          cartState.removeItem(existing.id);
          return { success: true, action, message: `Removed ${existing.name} from cart.` };
        } else if (targetQty > currentQty) {
          const diff = targetQty - currentQty;
          for (let i = 0; i < diff; i++) cartState.incrementQuantity(existing.id);
        } else if (targetQty < currentQty) {
          const diff = currentQty - targetQty;
          for (let i = 0; i < diff; i++) cartState.decrementQuantity(existing.id);
        }
        return { success: true, action, message: `Set ${existing.name} quantity to ${targetQty}.`, data: { item_id: itemId, quantity: targetQty } };
      }

      // ── Cart: Clear ──────────────────────────────────────────────────────────

      case 'clear_cart': {
        const count = useCartStore.getState().getItemCount();
        useCartStore.getState().clearCart();
        return { success: true, action, message: `Cart cleared (${count} items removed).` };
      }

      // ── Cart: Show ───────────────────────────────────────────────────────────

      case 'show_cart': {
        // Show cart navigates to checkout (cart UI lives there)
        navigateScreen('/(checkout)/checkout');
        return { success: true, action, message: 'Opened cart.' };
      }

      // ── Order Tracking ───────────────────────────────────────────────────────

      case 'open_tracking': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        const { restaurant_id } = useRestaurantStore.getState().selectedOutlet || {};
        if (orderId) {
          navigateScreen('/(order)/track-order', {
            dbOrderId: String(orderId),
            restaurantId: String(restaurant_id || ''),
          });
          return { success: true, action, message: `Opened tracking for order ${orderId}.`, data: { orderId } };
        } else {
          navigateScreen('/(order)/orders');
          return { success: true, action, message: 'Opened orders screen to track your orders.' };
        }
      }

      // ── Order Details ────────────────────────────────────────────────────────

      case 'open_order_details': {
        const orderId = act.order_id || act.db_order_id;
        if (!orderId) {
          navigateScreen('/(order)/orders');
          return { success: true, action, message: 'Opened orders screen.' };
        }

        navigateScreen('/(order)/order-details', { dbOrderId: String(orderId) });
        return { success: true, action, message: `Opened order details for ${orderId}.`, data: { orderId } };
      }

      // ── Invoice ──────────────────────────────────────────────────────────────

      case 'open_invoice': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) {
          navigateScreen('/(order)/orders');
          return { success: true, action, message: 'Opened orders screen.' };
        }

        navigateScreen('/(checkout)/invoice', { dbOrderId: String(orderId) });
        return { success: true, action, message: `Opened invoice for order ${orderId}.`, data: { orderId } };
      }

      // ── Delivery Tracking ────────────────────────────────────────────────────

      case 'open_delivery_tracking': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        navigateScreen('/(order)/delivery-tracking', orderId ? { dbOrderId: String(orderId) } : {});
        return { success: true, action, message: `Opened delivery tracking.` };
      }

      // ── Addresses ────────────────────────────────────────────────────────────

      case 'open_addresses': {
        navigateScreen('/(address)/my-addresses');
        return { success: true, action, message: 'Opened saved addresses.' };
      }

      case 'open_add_address': {
        navigateScreen('/(address)/add-address');
        return { success: true, action, message: 'Opened Add Address screen.' };
      }

      case 'select_address': {
        const query = String((act as any).address || (act as any).type || (act as any).address_id || '').toLowerCase().trim();
        const addressStore = useAddressStore.getState();
        const addresses = addressStore.addresses;
        let matched = addresses.find(a => String(a.id) === query);
        if (!matched && query) {
          matched = addresses.find(a => 
            a.type?.toLowerCase().includes(query) || 
            a.address?.toLowerCase().includes(query) || 
            a.full_address?.toLowerCase().includes(query)
          );
        }
        if (!matched && addresses.length > 0) {
          matched = addresses[0];
        }

        if (matched) {
          addressStore.setSelectedDeliveryAddress(matched.address || matched.full_address, Number(matched.id));
          return {
            success: true,
            action,
            message: `Selected address: ${matched.type} (${matched.address || matched.full_address}).`,
            data: matched,
          };
        }
        navigateScreen('/(address)/my-addresses');
        return { success: false, action, message: 'Opened addresses screen.' };
      }

      // ── Shortcuts ─────────────────────────────────────────────────────────────

      case 'open_profile': {
        navigateScreen('/profile');
        return { success: true, action, message: 'Opened Profile.' };
      }

      case 'open_rewards': {
        navigateScreen('/rewards');
        return { success: true, action, message: 'Opened Rewards & Loyalty Points.' };
      }

      case 'open_orders': {
        navigateScreen('/(order)/orders');
        return { success: true, action, message: 'Opened Orders.' };
      }

      case 'open_menu': {
        navigateScreen('/menu', act.payload?.params || {});
        return { success: true, action, message: 'Opened Menu.' };
      }

      // ── Category Navigation ──────────────────────────────────────────────────

      case 'open_category': {
        const rawName = String(
          act.category_name ||
          (act as any).category ||
          act.payload?.categoryName ||
          act.payload?.category_name ||
          ''
        ).trim();

        let catName = 'Rice Varieties';
        const lower = rawName.toLowerCase();
        if (lower.includes('rice')) catName = 'Rice Varieties';
        else if (lower.includes('dosa')) catName = 'Dosa Varieties';
        else if (lower.includes('snack')) catName = 'Evening Snacks';
        else if (lower.includes('beverage') || lower.includes('coffee') || lower.includes('tea')) catName = 'Hot Beverages';
        else if (lower.includes('soup')) catName = 'Soups';
        else if (lower.includes('starter') || lower.includes('tandoori')) catName = 'Tandoori Starters';
        else if (lower.includes('noodle')) catName = 'Noodles';
        else if (lower.includes('salad')) catName = 'Salad';
        else if (lower.includes('breakfast')) catName = 'Breakfast & Dinner';
        else if (lower.includes('lunch')) catName = 'Lunch';
        else if (rawName) catName = rawName;

        try {
          useVoiceAgentStore.getState().hideAgent();
        } catch {}

        DeviceEventEmitter.emit('open_category', { categoryName: catName });
        navigateScreen('/menu', { categoryName: catName, search: '' });

        return {
          success: true,
          action,
          message: `Opened menu category: ${catName}.`,
          data: { categoryName: catName },
        };
      }

      // ── Dine-In Actions ──────────────────────────────────────────────────────

      case 'dine_in_pay_later': {
        useCartStore.getState().setOrderType('Dine In');
        navigateScreen('/(checkout)/checkout', { payLater: 'true' });
        return {
          success: true,
          action,
          message: 'Switched to Dine In mode with Pay Later selected at checkout.',
        };
      }

      case 'dine_in_pay_bill': {
        try {
          const { useDineInSessionStore } = require('../store/useDineInSessionStore');
          const dineSession = useDineInSessionStore.getState();
          if (dineSession.isActive && dineSession.activeOrderId) {
            navigateScreen('/(checkout)/payment', {
              isDineInSettlement: 'true',
              orderId: dineSession.activeOrderId,
              dbOrderId: dineSession.activeDbOrderId ? String(dineSession.activeDbOrderId) : '',
              tableNumber: dineSession.tableNumber || 'T-01',
              totalAmount: String(dineSession.totalAmount || 0),
            });
            return {
              success: true,
              action,
              message: `Opened Dine-In settlement bill payment for Table ${dineSession.tableNumber || 'your table'}.`,
              data: { tableNumber: dineSession.tableNumber, totalAmount: dineSession.totalAmount }
            };
          }
        } catch {}
        navigateScreen('/(checkout)/checkout', { payLater: 'true' });
        return {
          success: true,
          action,
          message: 'Opened your cart and bill screen.',
        };
      }

      // ── Catering ─────────────────────────────────────────────────────────────

      case 'open_catering': {
        navigateScreen('/(main)/bulk-catering');
        return { success: true, action, message: 'Opened Bulk Catering.' };
      }

      case 'catering_set_event_details': {
        const payload = act.payload || {};
        const { useCateringSessionStore } = require('../store/useCateringSessionStore');
        const store = useCateringSessionStore.getState();

        const orderType = payload.order_type || payload.orderType || store.orderType || 'Catering Order';
        const eventName = payload.event_name || payload.eventName || store.eventName || '';
        const date = payload.date || store.date || '';
        const time = payload.time || payload.serving_time || store.time || '';
        const occasion = payload.occasion || store.occasion || '';
        const guestCount = String(payload.guest_count || payload.guestCount || store.guestCount || '50');
        const serviceType = payload.service_type || payload.serviceType || store.serviceType || 'Delivery Only';
        const address = payload.address || payload.delivery_address || store.address || '';

        store.setEventDetails({
          orderType: orderType === 'Party Order' ? 'Party Order' : 'Catering Order',
          eventName,
          date,
          time,
          occasion,
          guestCount,
          serviceType,
          address,
        });

        const proceed = payload.proceed_to_packages !== false;
        if (proceed && eventName && date && time && occasion && address) {
          navigateScreen('/(main)/catering-choose-package', {
            eventName,
            date,
            time,
            occasion,
            guestCount,
            serviceType,
            address,
          });
          return {
            success: true,
            action,
            message: `Event details saved for ${eventName} on ${date} (${guestCount} guests). Moving to package selection.`,
            data: { eventName, date, time, occasion, guestCount, serviceType, address, navigatedTo: 'packages' }
          };
        } else {
          navigateScreen('/(main)/catering-event-details');
          return {
            success: true,
            action,
            message: `Entered event details on screen: ${eventName || 'Event'}, ${date || 'Date'}, ${guestCount} guests, ${address || 'Address'}.`,
            data: { eventName, date, time, occasion, guestCount, serviceType, address, navigatedTo: 'event_details' }
          };
        }
      }

      case 'catering_choose_package': {
        const params = act.payload?.params || act.payload || {};
        navigateScreen('/(main)/catering-choose-package', params);
        return {
          success: true,
          action,
          message: 'Opened Catering Package Selection.',
          data: params
        };
      }

      case 'catering_customise_item': {
        const payload = act.payload || {};
        const actionType = String(payload.action_type || 'ADD').toUpperCase();
        const itemName = payload.item_name || '';
        const newItemName = payload.new_item_name || '';

        navigateScreen('/(main)/catering-customise-menu');
        DeviceEventEmitter.emit('catering_customise_item', {
          action_type: actionType,
          item_name: itemName,
          new_item_name: newItemName,
        });

        return {
          success: true,
          action,
          message: `${actionType === 'REPLACE' ? `Swapped ${itemName} with ${newItemName}` : actionType === 'REMOVE' ? `Removed ${itemName}` : `Added ${itemName}`} in catering menu.`,
          data: payload,
        };
      }

      case 'catering_navigate_step': {
        const step = String(act.payload?.step || (act as any).step || '').toLowerCase();
        const stepMap: Record<string, string> = {
          'event_details': '/(main)/catering-event-details',
          'details': '/(main)/catering-event-details',
          'step1': '/(main)/catering-event-details',
          'packages': '/(main)/catering-choose-package',
          'choose_package': '/(main)/catering-choose-package',
          'step2': '/(main)/catering-choose-package',
          'customise_menu': '/(main)/catering-customise-menu',
          'customise': '/(main)/catering-customise-menu',
          'step3': '/(main)/catering-customise-menu',
          'extras': '/(main)/catering-add-extras',
          'add_extras': '/(main)/catering-add-extras',
          'step4': '/(main)/catering-add-extras',
          'review_quote': '/(main)/catering-review-quote',
          'quote': '/(main)/catering-review-quote',
          'step5': '/(main)/catering-review-quote',
          'payment': '/(main)/catering-advance-payment',
          'step6': '/(main)/catering-advance-payment',
          'orders': '/(main)/catering-order-details',
          'order_details': '/(main)/catering-order-details',
          'hub': '/(main)/bulk-catering',
          'bulk': '/(main)/bulk-catering',
        };
        const targetRoute = stepMap[step] || '/(main)/catering-event-details';
        navigateScreen(targetRoute, act.payload?.params || {});
        return {
          success: true,
          action,
          message: `Navigated to catering step: ${step || 'event_details'}.`,
          data: { route: targetRoute, step }
        };
      }

      // ── Outlet ───────────────────────────────────────────────────────────────

      case 'select_outlet': {
        navigateScreen('/outlet-selector');
        return { success: true, action, message: 'Opened Outlet Selector.' };
      }

      // ── Default / Unknown ─────────────────────────────────────────────────────

      default:
        console.warn(`[Dispatcher] Unhandled action (passed validation but not handled): "${action}"`);
        return { success: false, action, message: `Action "${action}" is registered but not handled.` };
    }
  } catch (e: any) {
    console.error(`[Dispatcher] Error executing action "${action}":`, e);
    return { success: false, action, message: `Error: ${e?.message || 'Unknown error'}` };
  }
}

// ─── Legacy batch executor (backward compat) ──────────────────────────────────

export const executeMobileAgentActions = (actions: UIAction[]) => {
  for (const act of actions) {
    executeSingleAction(act).then(result => {
      if (!result.success) {
        console.warn(`[Dispatcher] Action failed: ${result.message}`);
      }
    });
  }
};
