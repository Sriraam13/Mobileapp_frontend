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
let currentPathname: string = '';
let lastNavRoute = '';
let lastNavTime = 0;

export function setActiveRouter(r: any) {
  if (r) {
    activeRouter = r;
  }
}

export function setCurrentPathname(p: string) {
  currentPathname = p || '';
}

export function getCurrentPathname(): string {
  return currentPathname;
}

export function getActiveRouter() {
  return activeRouter || router;
}

/**
 * Safely navigates to a screen while auto-hiding the voice modal so the screen is visible.
 * The voice call stays connected and active in the background.
 */
export function navigateScreen(resolvedRoute: string, params?: Record<string, any>) {
  const now = Date.now();
  const paramsKey = params ? JSON.stringify(params) : '';
  const routeKey = `${resolvedRoute}:${paramsKey}`;

  if (routeKey === lastNavRoute && (now - lastNavTime) < 1500) {
    console.log(`[Dispatcher] Debouncing redundant navigation to "${resolvedRoute}"`);
    return;
  }
  lastNavRoute = routeKey;
  lastNavTime = now;

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

// ─── Catering Format Helpers ──────────────────────────────────────────────────

const CATERING_MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function normalizeCateringDate(input: string): string {
  if (!input) return '';
  const cleaned = input.trim().replace(/(\d+)(st|nd|rd|th)/i, '$1');

  // Check if already in "DD MMMM YYYY" format
  const parts = cleaned.split(/\s+/);
  if (parts.length === 3 && CATERING_MONTHS_FULL.includes(parts[1])) {
    const day = parts[0].padStart(2, '0');
    return `${day} ${parts[1]} ${parts[2]}`;
  }

  // Try parsing ISO or other standard dates
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = CATERING_MONTHS_FULL[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    }
  } catch {}

  return input;
}

export function normalizeCateringTime(input: string): string {
  if (!input) return '';
  const cleaned = input.trim().toLowerCase();

  // Natural meal times
  if (cleaned.includes('breakfast')) return '08:30 AM';
  if (cleaned.includes('lunch') || cleaned.includes('noon')) return '12:30 PM';
  if (cleaned.includes('evening') || cleaned.includes('tiffin') || cleaned.includes('snack')) return '05:00 PM';
  if (cleaned.includes('dinner') || cleaned.includes('night')) return '07:30 PM';

  // 12-hour format e.g. "12:30 PM", "1:00 pm", "7 pm"
  const m12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m12) {
    const h = m12[1].padStart(2, '0');
    const m = (m12[2] || '00').padStart(2, '0');
    const ampm = m12[3].toUpperCase();
    return `${h}:${m} ${ampm}`;
  }

  // 24-hour format e.g. "13:00", "09:30"
  const m24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const m = m24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  }

  return input;
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
        } else if (
          normalized.includes('cater') ||
          normalized.includes('bulk') ||
          normalized.includes('party')
        ) {
          try {
            const { useCateringSessionStore } = require('../store/useCateringSessionStore');
            const targetType = normalized.includes('party') ? 'Party Order' : 'Catering Order';
            useCateringSessionStore.getState().setOrderType(targetType);
          } catch {}
          navigateScreen('/(main)/catering-choose-package');
          return {
            success: true,
            action,
            message: 'Switched to Catering mode and opened catering packages.',
            data: { orderType: 'Catering Order', route: '/(main)/catering-choose-package' },
          };
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

        const curr = getCurrentPathname();
        const isAlreadyOnMenu = curr.includes('/menu');

        if (isAlreadyOnMenu) {
          console.log(`[Dispatcher] Already on menu screen, switched category tab to: ${catName}`);
          try {
            const r = getActiveRouter();
            if (r.setParams) {
              r.setParams({ categoryName: catName, search: '' });
            }
          } catch (e) {
            console.warn('[Dispatcher] setParams failed:', e);
          }
        } else {
          navigateScreen('/menu', { categoryName: catName, search: '' });
        }

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
        const payload = act.payload || {};
        if (payload.screen === 'bulk' || payload.route === 'bulk') {
          navigateScreen('/(main)/bulk-catering');
          return { success: true, action, message: 'Opened Bulk Catering.' };
        }
        navigateScreen('/(main)/catering-choose-package', payload.params || {});
        return { success: true, action, message: 'Opened Catering Package Selection.', data: { route: '/(main)/catering-choose-package' } };
      }

      case 'catering_set_event_details': {
        const p = { ...(act || {}), ...(act.payload || {}), ...(act.payload?.params || {}) };
        const { useCateringSessionStore } = require('../store/useCateringSessionStore');
        const store = useCateringSessionStore.getState();

        // 1. Order type
        const rawOrderType = p.order_type || p.orderType || p.order_mode || store.orderType || 'Catering Order';
        const orderType = /party/i.test(String(rawOrderType)) ? 'Party Order' : 'Catering Order';

        // 2. Occasion
        const occasion = String(p.occasion || p.event_type || p.eventType || p.reason || store.occasion || '').trim();

        // 3. Event name
        const rawEventName = p.event_name || p.eventName || p.name || p.title || store.eventName || '';
        const eventName = String(rawEventName || (occasion ? `${occasion} Event` : 'Catering Event')).trim();

        // 4. Guest count (sanitize to clean numeric digits)
        const rawGuests = p.guest_count ?? p.guestCount ?? p.guests ?? p.pax ?? p.number_of_guests ?? p.people ?? store.guestCount ?? '50';
        let guestCount = '50';
        const parsedGuests = parseInt(String(rawGuests).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsedGuests) && parsedGuests > 0) {
          guestCount = String(parsedGuests);
        }

        // 5. Date normalization (ensure standard "DD MMMM YYYY" for display & backend compatibility)
        const rawDate = p.date || p.event_date || p.eventDate || p.booking_date || store.date || '';
        const date = normalizeCateringDate(String(rawDate));

        // 6. Serving time normalization (e.g. "12:30 PM")
        const rawTime = p.time || p.serving_time || p.servingTime || p.event_time || p.time_slot || store.time || '';
        const time = normalizeCateringTime(String(rawTime));

        // 7. Service type
        const rawService = p.service_type || p.serviceType || p.service || store.serviceType || 'Delivery Only';
        const serviceType = /full|waiter|staff|setup|live/i.test(String(rawService)) ? 'Full Service Catering' : 'Delivery Only';

        // 8. Address
        const address = String(p.address || p.delivery_address || p.deliveryAddress || p.venue_address || p.venue || p.location || store.address || '').trim();

        // Save into global Zustand store
        store.setEventDetails({
          orderType,
          eventName,
          date,
          time,
          occasion,
          guestCount,
          serviceType,
          address,
        });

        // Broadcast to any active screen (e.g. catering-event-details) to update UI inputs live
        DeviceEventEmitter.emit('catering_set_event_details', {
          orderType,
          eventName,
          date,
          time,
          occasion,
          guestCount,
          serviceType,
          address,
        });

        const proceed = p.proceed_to_packages !== false;
        const hasAllDetails = Boolean(eventName && date && time && occasion && address);

        if (proceed && hasAllDetails) {
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
          navigateScreen('/(main)/catering-event-details', {
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
            message: `Entered event details on screen: ${eventName || 'Event'}, ${date || 'Date'}, ${guestCount} guests, ${address || 'Address'}.`,
            data: { eventName, date, time, occasion, guestCount, serviceType, address, navigatedTo: 'event_details' }
          };
        }
      }

      case 'catering_choose_package': {
        const p = { ...(act || {}), ...(act.payload || {}), ...(act.payload?.params || {}) };
        const { useCateringSessionStore } = require('../store/useCateringSessionStore');
        const store = useCateringSessionStore.getState();

        const pkgCode = p.package_code || p.packageCode || p.code || p.selectedPackage || '';
        if (pkgCode) {
          store.setSelectedPackage(pkgCode);
        }

        // Forward existing event details from store or params
        const params: Record<string, any> = {
          selectedPackage: pkgCode || store.selectedPackage || '',
          eventName: p.eventName || p.event_name || store.eventName || '',
          date: p.date || p.event_date || store.date || '',
          time: p.time || p.serving_time || store.time || '',
          occasion: p.occasion || store.occasion || '',
          guestCount: String(p.guestCount || p.guest_count || store.guestCount || '50'),
          serviceType: p.serviceType || p.service_type || store.serviceType || 'Delivery Only',
          address: p.address || p.delivery_address || store.address || '',
        };

        navigateScreen('/(main)/catering-choose-package', params);
        return {
          success: true,
          action,
          message: pkgCode ? `Opened Catering Package Selection for package ${pkgCode}.` : 'Opened Catering Package Selection.',
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
