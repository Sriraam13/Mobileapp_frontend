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
import { useDineInSessionStore } from '../store/useDineInSessionStore';
import { useAuthStore } from '../store/useAuthStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { SUPPORTED_ACTIONS, SCREEN_REGISTRY, resolveRoute } from './agentRegistry';

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
          return { success: false, action, message: `Route "${rawRoute}" is not a supported screen.` };
        }

        const params = act.payload?.params || {};
        if (Object.keys(params).length > 0) {
          router.push({ pathname: resolved as any, params });
        } else {
          router.push(resolved as any);
        }
        return { success: true, action, message: `Navigated to ${resolved}`, data: { route: resolved } };
      }

      case 'go_back': {
        if (router.canGoBack()) {
          router.back();
          return { success: true, action, message: 'Went back.' };
        }
        return { success: false, action, message: 'No previous screen to go back to.' };
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
      case 'select_order_type': {
        if (!act.order_type) return { success: false, action, message: 'No order type specified.' };

        const normalized = act.order_type.toLowerCase().replace(/[^a-z]/g, '');
        let mapped: 'Take Away' | 'Dine In' | 'Delivery' | null = null;

        if (normalized === 'takeaway' || normalized === 'takeout') mapped = 'Take Away';
        else if (normalized === 'dinein' || normalized === 'dine') mapped = 'Dine In';
        else if (normalized === 'delivery' || normalized === 'deliver') mapped = 'Delivery';

        if (!mapped) {
          return { success: false, action, message: `Unknown order type: "${act.order_type}". Valid types: Dine In, Take Away, Delivery.` };
        }
        useCartStore.getState().setOrderType(mapped);
        return { success: true, action, message: `Order type set to ${mapped}`, data: { orderType: mapped } };
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
        const itemId = act.menu_item_id || act.payload?.item_id;
        if (!itemId) return { success: false, action, message: 'No item ID to remove.' };

        const cart = useCartStore.getState().items;
        const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
        if (!existing) {
          return { success: false, action, message: `Item ${itemId} is not in cart.` };
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
        const count = useCartStore.getState().getItemCount();
        if (count === 0) {
          return { success: false, action, message: 'Your cart is empty.' };
        }
        router.push('/(checkout)/checkout' as any);
        return { success: true, action, message: 'Opened cart.' };
      }

      // ── Order Tracking ───────────────────────────────────────────────────────

      case 'open_tracking': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) return { success: false, action, message: 'No active order to track.' };

        const { restaurant_id } = useRestaurantStore.getState().selectedOutlet || {};
        router.push({
          pathname: '/(order)/track-order' as any,
          params: {
            dbOrderId: String(orderId),
            restaurantId: String(restaurant_id || ''),
          },
        });
        return { success: true, action, message: `Opened tracking for order ${orderId}.`, data: { orderId } };
      }

      // ── Order Details ────────────────────────────────────────────────────────

      case 'open_order_details': {
        const orderId = act.order_id || act.db_order_id;
        if (!orderId) return { success: false, action, message: 'No order ID provided.' };

        router.push({
          pathname: '/(order)/order-details' as any,
          params: { dbOrderId: String(orderId) },
        });
        return { success: true, action, message: `Opened order details for ${orderId}.`, data: { orderId } };
      }

      // ── Invoice ──────────────────────────────────────────────────────────────

      case 'open_invoice': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) return { success: false, action, message: 'No order ID to open invoice for.' };

        router.push({
          pathname: '/(checkout)/invoice' as any,
          params: { dbOrderId: String(orderId) },
        });
        return { success: true, action, message: `Opened invoice for order ${orderId}.`, data: { orderId } };
      }

      // ── Delivery Tracking ────────────────────────────────────────────────────

      case 'open_delivery_tracking': {
        const orderId = act.order_id || act.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) return { success: false, action, message: 'No active delivery to track.' };

        router.push({
          pathname: '/(order)/delivery-tracking' as any,
          params: { dbOrderId: String(orderId) },
        });
        return { success: true, action, message: `Opened delivery tracking for order ${orderId}.`, data: { orderId } };
      }

      // ── Addresses ────────────────────────────────────────────────────────────

      case 'open_addresses': {
        router.push('/(address)/my-addresses' as any);
        return { success: true, action, message: 'Opened saved addresses.' };
      }

      case 'open_add_address': {
        router.push('/(address)/add-address' as any);
        return { success: true, action, message: 'Opened Add Address screen.' };
      }

      // ── Catering ─────────────────────────────────────────────────────────────

      case 'open_catering': {
        router.push('/(main)/bulk-catering' as any);
        return { success: true, action, message: 'Opened Bulk Catering.' };
      }

      // ── Outlet ───────────────────────────────────────────────────────────────

      case 'select_outlet': {
        router.push('/(main)/outlet-selector' as any);
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
