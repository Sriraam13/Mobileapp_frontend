/**
 * vapiStore.ts
 *
 * PHASES 3, 6, 7 — Vapi store with proper async tool-call handling
 *
 * Architecture:
 *   Vapi SDK fires 'message' events including 'tool-calls'.
 *   handleVapiToolCall() validates → executes via dispatcher or backend fetch → 
 *   returns result to Vapi via vapi.send({ type: 'tool-result', ... })
 *
 * This file does NOT directly query any database.
 * Backend data reads go through the mobile agent MCP endpoint.
 *
 * Transcript handling:
 *   - Real-time partial transcripts for zero lag
 *   - Final transcripts merged (same speaker → single bubble)
 *   - No duplicate bubbles
 */

import { Alert, NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { create } from 'zustand';
import { executeSingleAction, UIAction } from '../utils/mobileAgentActionDispatcher';
import { resolveRoute, getScreenDisplayName } from '../utils/agentRegistry';
import { getMobileAgentContext } from '../utils/agentContext';
import { API_BASE_URL } from '../constants/api';
import { useAuthStore } from '../store/useAuthStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useCartStore } from './useCartStore';

// ─── SDK Init ─────────────────────────────────────────────────────────────────
// Only the PUBLIC key is used here. Private key stays server-side.
let VapiClass: any = null;
let vapiInstance: any = null;
let listenersSetup = false;

const isWebRTCSupported = () => {
  if (Platform.OS === 'web') return false;
  return !!(
    NativeModules &&
    (NativeModules.WebRTCModule ||
      NativeModules.DailyWebRTC ||
      NativeModules.RNWebRTC)
  );
};

const getVapi = () => {
  if (!isWebRTCSupported()) {
    return null;
  }
  if (!vapiInstance) {
    if (!VapiClass) {
      try {
        const mod = require('@vapi-ai/react-native');
        VapiClass = mod.default || mod;
      } catch (e) {
        console.warn('[VapiStore] Native Vapi/WebRTC is not available in Expo Go client:', e);
        return null;
      }
    }
    try {
      if (VapiClass) {
        vapiInstance = new VapiClass(process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY || '');
      }
    } catch (e) {
      console.warn('[VapiStore] Failed to initialize Vapi instance:', e);
      return null;
    }
  }
  return vapiInstance;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'agent' | 'assistant';
  text: string;
  isFinal?: boolean;
}

interface VapiState {
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;
  messages: ChatMessage[];
  partialUserTranscript: string;
  partialAgentTranscript: string;
  startCall: () => Promise<void>;
  stopCall: () => void;
  toggleMute: () => void;
  clearMessages: () => void;
  setupListeners: (routerRef: any) => void;
  notifyRouteChanged: (route: string) => void;
}

// ─── Backend tool executor (READ-ONLY data fetch) ─────────────────────────────

async function fetchAgentData(toolName: string, args: Record<string, any>): Promise<any> {
  const auth = useAuthStore.getState();
  const restaurant = useRestaurantStore.getState();
  const restaurantId = restaurant.selectedOutlet?.restaurant_id;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/public/mcp/mobile-agent-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: toolName,
        arguments: args,
        customer_id: auth.customerId,
        phone: auth.phone,
        restaurant_id: restaurantId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VapiStore] Tool fetch failed ${toolName}:`, response.status, errText);
      return { error: `Failed to retrieve data (HTTP ${response.status})` };
    }

    return await response.json();
  } catch (e: any) {
    console.error(`[VapiStore] Tool network error ${toolName}:`, e);
    return { error: 'Network error. Could not retrieve data.' };
  }
}

// ─── Vapi Tool Call Handler ────────────────────────────────────────────────────

async function handleVapiToolCall(tool: any): Promise<{ toolCallId: string; result: string } | null> {
  const toolCallId = tool.id || tool.toolCallId || `tool-${Date.now()}`;
  const fnName: string = tool.function?.name || '';
  const fnArgs: Record<string, any> = tool.function?.arguments || {};

  console.log(`[VapiStore] Tool call received: ${fnName}`, fnArgs);

  try {
    switch (fnName) {

      // ── App Navigation ────────────────────────────────────────────────────────

      case 'app_navigate':
      case 'navigate': {
        const route = fnArgs.route || '';
        const resolved = resolveRoute(route);
        if (!resolved) {
          return { toolCallId, result: JSON.stringify({ success: false, message: `Route "${route}" is not supported.` }) };
        }
        const result = await executeSingleAction({
          action: 'navigate',
          route: resolved,
          payload: { params: fnArgs.params || {} },
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'app_go_back': {
        const result = await executeSingleAction({ action: 'go_back' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'proceed_to_checkout': {
        const cartCount = useCartStore.getState().getItemCount();
        if (cartCount === 0) {
           return { toolCallId, result: JSON.stringify({ success: false, message: 'Cart is empty. Cannot proceed to checkout.' }) };
        }
        const result = await executeSingleAction({ action: 'show_cart' }); // show_cart navigates to checkout
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── App Context ───────────────────────────────────────────────────────────

      case 'app_get_context': {
        const context = getMobileAgentContext();
        return {
          toolCallId,
          result: JSON.stringify({ success: true, context }),
        };
      }

      // ── Order Type ────────────────────────────────────────────────────────────

      case 'set_order_type':
      case 'select_order_mode': {
        const result = await executeSingleAction({
          action: 'set_order_type',
          order_type: fnArgs.order_type || fnArgs.orderType || '',
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'set_table_number': {
        // Just acknowledging in voice agent, actual table state handled by dine-in flow manually usually
        return { toolCallId, result: JSON.stringify({ success: true, message: `Table number acknowledged.` }) };
      }

      // ── Menu Search ───────────────────────────────────────────────────────────

      case 'menu_search':
      case 'get_menu': {
        const restaurantId = useRestaurantStore.getState().selectedOutlet?.restaurant_id;
        if (!restaurantId) {
          return {
            toolCallId,
            result: JSON.stringify({
              success: false,
              code: 'NO_RESTAURANT_SELECTED',
              message: 'Please select a restaurant outlet first.'
            })
          };
        }

        const cleanString = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const valueTrimmed = value.trim();
          return valueTrimmed.length > 0 ? valueTrimmed : undefined;
        };

        const query = cleanString(fnArgs.query);
        const categoryName = cleanString(fnArgs.category_name) ?? cleanString(fnArgs.category);

        const normalizedArgs: Record<string, any> = {};
        if (query) {
           normalizedArgs.query = query;
        }
        if (categoryName) {
           normalizedArgs.category_name = categoryName;
        }

        console.log("[VapiStore] RAW TOOL:", fnName);
        console.log("[VapiStore] CANONICAL TOOL: menu_search");
        console.log("[VapiStore] NORMALIZED ARGS:", normalizedArgs);
        console.log("[VapiStore] RESTAURANT ID:", restaurantId);

        const data = await fetchAgentData('menu_search', normalizedArgs);

        console.log("[VapiStore] BACKEND RESULT:", data.success ? 'success' : 'error');
        console.log("[VapiStore] MENU ITEM COUNT:", data.count ?? 0);
        console.log("[VapiStore] RESULT SENT TO VAPI:", data.success ? 'success' : 'error');

        // Forward structured errors appropriately
        if (data.error && data.code) {
           return { toolCallId, result: JSON.stringify({ success: false, code: data.code, message: data.error }) };
        }

        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Cart ──────────────────────────────────────────────────────────────────

      case 'open_cart':
      case 'show_cart': {
        const result = await executeSingleAction({ action: 'show_cart' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'add_to_cart': {
        const itemNameRaw = fnArgs.item_name;
        const qty = fnArgs.quantity || 1;

        console.log(`[VapiStore] ADD_TO_CART REQUEST`);
        console.log(`[VapiStore] Requested item: ${itemNameRaw}`);
        console.log(`[VapiStore] Quantity: ${qty}`);

        const restaurantId = useRestaurantStore.getState().selectedOutlet?.restaurant_id;
        console.log(`[VapiStore] Selected restaurant ID: ${restaurantId}`);

        if (!restaurantId) {
          const errRes = { success: false, code: 'NO_RESTAURANT_SELECTED', message: 'Please select a restaurant outlet first.' };
          console.log(`[VapiStore] final tool result:`, errRes);
          console.log(`[VapiStore] result sent to Vapi:`, errRes);
          return { toolCallId, result: JSON.stringify(errRes) };
        }

        if (!itemNameRaw) {
           const errRes = { success: false, message: 'Missing item_name' };
           console.log(`[VapiStore] final tool result:`, errRes);
           console.log(`[VapiStore] result sent to Vapi:`, errRes);
           return { toolCallId, result: JSON.stringify(errRes) };
        }

        const cleanString = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const valueTrimmed = value.trim();
          return valueTrimmed.length > 0 ? valueTrimmed : undefined;
        };

        const itemName = cleanString(itemNameRaw);
        if (!itemName) {
           const errRes = { success: false, message: 'Invalid item_name' };
           console.log(`[VapiStore] final tool result:`, errRes);
           console.log(`[VapiStore] result sent to Vapi:`, errRes);
           return { toolCallId, result: JSON.stringify(errRes) };
        }

        console.log(`[VapiStore] menu_search request:`, { query: itemName });
        const data = await fetchAgentData('menu_search', { query: itemName });
        console.log(`[VapiStore] menu_search response status: ${data.success ? 'success' : 'error'}`);
        
        if (data.error || !data.menu_items || data.menu_items.length === 0) {
           const errRes = { success: false, code: 'MENU_ITEM_NOT_FOUND', message: `I couldn't find ${itemName} on this outlet's menu.` };
           console.log(`[VapiStore] final tool result:`, errRes);
           console.log(`[VapiStore] result sent to Vapi:`, errRes);
           return { toolCallId, result: JSON.stringify(errRes) };
        }


        const candidates = data.menu_items;
        const normalizedRequested = itemName.toLowerCase().replace(/\s+/g, ' ').trim();

        console.log(`[VapiStore] REQUESTED NORMALIZED NAME: ${normalizedRequested}`);
        console.log(`[VapiStore] RAW CANDIDATE COUNT: ${candidates.length}`);
        console.log(`[VapiStore] RAW CANDIDATES:`, candidates.map((c: any) => c.name));

        const exactMatches = candidates.filter((c: any) => c.name.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedRequested);
        const partialMatches = candidates.filter((c: any) => c.name.toLowerCase().replace(/\s+/g, ' ').trim() !== normalizedRequested);

        // Deduplicate identical exact matches based on name and price
        const deduplicatedExact = [];
        const seenSignatures = new Set();
        for (const item of exactMatches) {
            const sig = `${item.name}|${item.price}`;
            if (!seenSignatures.has(sig)) {
                seenSignatures.add(sig);
                deduplicatedExact.push(item);
            }
        }

        console.log(`[VapiStore] EXACT MATCH COUNT: ${exactMatches.length}`);
        console.log(`[VapiStore] DEDUPLICATED EXACT MATCH COUNT: ${deduplicatedExact.length}`);
        console.log(`[VapiStore] EXACT MATCHES:`, exactMatches.map((c: any) => c.name));
        console.log(`[VapiStore] PARTIAL MATCHES:`, partialMatches.map((c: any) => c.name));

        let trustedMatch = null;
        
        if (deduplicatedExact.length === 1) {
            trustedMatch = deduplicatedExact[0];
        } else if (deduplicatedExact.length > 1) {
            const namesWithPrices = deduplicatedExact.map((i: any) => `${i.name} (Rs. ${i.price})`).join(', ');
            const errRes = { 
                success: false, 
                code: 'AMBIGUOUS_MENU_ITEM', 
                requested_item: itemName,
                candidates: deduplicatedExact,
                message: `I found multiple versions of ${itemName}. Please choose one: ${namesWithPrices}`
            };
            console.log(`[VapiStore] FINAL RESULT:`, errRes);
            console.log(`[VapiStore] RESULT SENT TO VAPI:`, errRes);
            return { toolCallId, result: JSON.stringify(errRes) };
        } else {
            const names = candidates.map((i: any) => i.name).join(', ');
            const errRes = { 
                success: false, 
                code: 'AMBIGUOUS_MENU_ITEM', 
                requested_item: itemName,
                candidates,
                message: `I found similar items like ${names}. Please clarify which one you mean.` 
            };
            console.log(`[VapiStore] FINAL RESULT:`, errRes);
            console.log(`[VapiStore] RESULT SENT TO VAPI:`, errRes);
            return { toolCallId, result: JSON.stringify(errRes) };
        }

        console.log(`[VapiStore] SELECTED TRUSTED ITEM:`, trustedMatch.name);

        if (!trustedMatch.is_available) {
           const errRes = { success: false, code: 'MENU_ITEM_UNAVAILABLE', message: `${trustedMatch.name} is currently unavailable.` };
           console.log(`[VapiStore] final tool result:`, errRes);
           console.log(`[VapiStore] result sent to Vapi:`, errRes);
           return { toolCallId, result: JSON.stringify(errRes) };
        }

        const uiAction: UIAction = {
          action: 'add_to_cart',
          quantity: qty,
          payload: { item: { id: trustedMatch.id, name: trustedMatch.name, price: trustedMatch.price, category: trustedMatch.category_id, desc: trustedMatch.description } },
        };
        
        const cartItemsBefore = useCartStore.getState().items;
        console.log(`[VapiStore] CART BEFORE:`, Object.values(cartItemsBefore).filter((i:any)=>i.quantity>0).map((i:any) => `${i.name} (x${i.quantity})`));

        const actionResult = await executeSingleAction(uiAction);
        console.log(`[VapiStore] cart action result:`, actionResult);

        // Verify actual cart changes
        const cartItemsAfter = useCartStore.getState().items;
        console.log(`[VapiStore] CART AFTER:`, Object.values(cartItemsAfter).filter((i:any)=>i.quantity>0).map((i:any) => `${i.name} (x${i.quantity})`));

        const itemInCart = Object.values(cartItemsAfter).find((i: any) => i.id === trustedMatch.id && i.quantity > 0);
        
        let finalRes;
        if (itemInCart) {
            finalRes = { success: true, code: 'ITEM_ADDED', item_name: trustedMatch.name, quantity: qty, message: `Added ${qty} ${trustedMatch.name} to the cart.` };
        } else {
            finalRes = { success: false, code: 'CART_UPDATE_FAILED', message: `Failed to add ${trustedMatch.name} to cart.` };
        }

        console.log(`[VapiStore] FINAL RESULT:`, finalRes);
        console.log(`[VapiStore] RESULT SENT TO VAPI:`, finalRes);
        return { toolCallId, result: JSON.stringify(finalRes) };
      }

      case 'remove_from_cart': {
        const result = await executeSingleAction({ action: 'remove_from_cart', menu_item_id: fnArgs.item_id });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'clear_cart': {
        const result = await executeSingleAction({ action: 'clear_cart' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'update_cart_item': {
        const uiAction: UIAction = {
          action: 'set_cart_quantity',
          menu_item_id: fnArgs.item_id,
          quantity: fnArgs.quantity,
        };
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'cart_update': {
        const subAction = fnArgs.sub_action || 'add';
        const actionMap: Record<string, string> = {
          add: 'add_to_cart',
          remove: 'remove_from_cart',
          increment: 'increment_cart_item',
          decrement: 'decrement_cart_item',
          set_quantity: 'set_cart_quantity',
          clear: 'clear_cart',
          show: 'show_cart',
        };
        const mappedAction = actionMap[subAction];
        if (!mappedAction) {
          return { toolCallId, result: JSON.stringify({ success: false, message: `Unknown cart sub_action: ${subAction}` }) };
        }

        const uiAction: UIAction = {
          action: mappedAction,
          menu_item_id: fnArgs.item_id,
          quantity: fnArgs.quantity,
          payload: fnArgs.item ? { item: fnArgs.item } : undefined,
        };
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── Customer Profile ──────────────────────────────────────────────────────

      case 'customer_get_profile': {
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }
        const data = await fetchAgentData('customer_get_profile', { customer_id: auth.customerId });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Rewards ───────────────────────────────────────────────────────────────

      case 'customer_get_rewards': {
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }
        const data = await fetchAgentData('customer_get_rewards', { customer_id: auth.customerId });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Order History ─────────────────────────────────────────────────────────

      case 'customer_get_orders': {
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        if (!auth.isAuthenticated || !auth.phone) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }
        const data = await fetchAgentData('customer_get_orders', {
          phone: auth.phone,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
          limit: fnArgs.limit || 10,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Single Order ──────────────────────────────────────────────────────────

      case 'customer_get_order': {
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        if (!auth.isAuthenticated) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }

        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'No order ID provided.' }) };
        }

        const data = await fetchAgentData('customer_get_order', {
          order_id: String(orderId),
          customer_id: auth.customerId,
          phone: auth.phone,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Order Tracking ────────────────────────────────────────────────────────

      case 'order_get_tracking': {
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }

        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'No active order to track.' }) };
        }

        const data = await fetchAgentData('order_get_tracking', {
          order_id: String(orderId),
          customer_id: auth.customerId,
          phone: auth.phone,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Catering ──────────────────────────────────────────────────────────────

      case 'catering_get_data': {
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        const subType = fnArgs.data_type || 'packages';

        const data = await fetchAgentData('catering_get_data', {
          data_type: subType,
          customer_id: auth.customerId,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
          catering_order_id: fnArgs.catering_order_id,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Confirmation & Platform Tools ─────────────────────────────────────────

      case 'app_confirm_action': {
        // This is handled conversationally by Vapi itself — no client action needed.
        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            message: 'Confirmation state acknowledged. Awaiting customer response.',
          }),
        };
      }

      case 'update_customer_info': {
        // Populate safe frontend state; do NOT mutate DB directly.
        if (fnArgs.name) await executeSingleAction({ action: 'set_signup_name', name: fnArgs.name });
        if (fnArgs.phone) await executeSingleAction({ action: 'set_signup_phone', phone: fnArgs.phone });
        return { toolCallId, result: JSON.stringify({ success: true, message: 'Frontend info updated.' }) };
      }

      case 'select_payment_method': {
        return { toolCallId, result: JSON.stringify({ success: false, message: 'Please use the app checkout screen to complete payment.' }) };
      }

      case 'place_order': {
        return { toolCallId, result: JSON.stringify({ success: false, message: 'Please use proceed_to_checkout and confirm your order in the app.' }) };
      }

      case 'mcp_tool':
      case 'voicemail_tool':
      case 'end_call_tool': {
        // These are Vapi platform-managed tools. Do not intercept or fake success.
        return null;
      }

      // ── Unknown Tool ──────────────────────────────────────────────────────────

      default: {
        console.warn(`[VapiStore] Unknown tool call rejected: "${fnName}"`);
        return {
          toolCallId,
          result: JSON.stringify({ success: false, code: 'UNKNOWN_TOOL', requested_tool: fnName, message: `Unsupported application tool.` }),
        };
      }
    }
  } catch (e: any) {
    console.error(`[VapiStore] Error handling tool "${fnName}":`, e);
    return {
      toolCallId,
      result: JSON.stringify({ success: false, message: `Internal error: ${e?.message || 'Unknown'}` }),
    };
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useVapiStore = create<VapiState>((set, get) => ({
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  messages: [],
  partialUserTranscript: '',
  partialAgentTranscript: '',

  startCall: async () => {
    const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      Alert.alert(
        'Voice Assistant Setup',
        'Vapi Assistant ID is missing. Please configure EXPO_PUBLIC_VAPI_ASSISTANT_ID in your environment variables.'
      );
      set({ isConnecting: false });
      return;
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message: "The Voice Assistant needs access to your microphone.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Permission Denied", "Microphone access is required to use the Voice Assistant.");
          set({ isConnecting: false });
          return;
        }
      } catch (err) {
        console.warn(err);
      }
    }

    const vapi = getVapi();
    if (!vapi) {
      Alert.alert(
        'Voice Assistant',
        'Voice calls require custom native WebRTC (Development Build / APK). Other app features work normally in Expo Go.'
      );
      set({ isConnecting: false });
      return;
    }
    const { messages } = get();
    const hasHistory = messages.filter((m) => m.isFinal && m.text).length > 0;
    
    set({ isConnecting: true });

    // Dynamic first message based on auth and restaurant state
    const auth = useAuthStore.getState();
    const restaurant = useRestaurantStore.getState();
    const isLoggedIn = auth.isAuthenticated && auth.phone;
    const hasOutlet = !!restaurant.selectedOutlet;

    let dynamicFirstMessage = "Welcome to Data Udipi! I'm your voice assistant.";
    
    if (hasHistory) {
      dynamicFirstMessage = "I'm back. Let's continue.";
    } else if (!isLoggedIn) {
      dynamicFirstMessage = "Welcome to Data Udipi! I'm your voice assistant. To get started, could you please tell me your phone number?";
    } else if (!hasOutlet) {
      dynamicFirstMessage = "Welcome back to Data Udipi! We have exciting delicious menu varieties and category items. Which outlet would you like to order from today?";
    } else {
      dynamicFirstMessage = "Welcome back to Data Udipi! We have exciting delicious menu varieties and category items. Which items would you prefer today?";
    }

    const overrides = { 
      firstMessage: dynamicFirstMessage, 
      maxDurationSeconds: 3600, // 1 hour max duration so it doesn't time out easily
    };

    try {
      vapi.start(assistantId, overrides);
    } catch (e) {
      console.warn('[VapiStore] startCall error:', e);
      set({ isConnecting: false });
    }
  },

  stopCall: () => {
    getVapi()?.stop();
    set({
      isConnected: false,
      isConnecting: false,
      partialUserTranscript: '',
      partialAgentTranscript: '',
    });
  },

  toggleMute: () => {
    const currentState = get().isMuted;
    const vapi = getVapi();
    if (vapi?.setMuted) {
      vapi.setMuted(!currentState);
    }
    set({ isMuted: !currentState });
  },

  clearMessages: () => {
    set({ messages: [], partialUserTranscript: '', partialAgentTranscript: '' });
  },

  notifyRouteChanged: (route: string) => {
    const vapi = getVapi();
    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[System Update] The user has navigated to screen: ${route}`
          }
        });
      } catch (e) {
        console.warn('[VapiStore] Failed to notify route change:', e);
      }
    }
  },

  setupListeners: (routerRef) => {
    if (listenersSetup) return;
    const vapi = getVapi();
    if (!vapi) return;
    listenersSetup = true;

    vapi.on('call-start', () => {
      set({ isConnected: true, isConnecting: false });

      // Inject previous context if this is a resumed conversation
      const { messages } = get();
      const pastMessages = messages.filter((m) => m.isFinal && m.text);
      if (pastMessages.length > 0) {
        const transcript = pastMessages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
        try {
          (vapi as any).send({
            type: 'add-message',
            message: {
              role: 'system',
              content: `The call was briefly disconnected. Here is the transcript of what was said right before you reconnected:\n\n${transcript}\n\nContinue seamlessly from where you left off. Do not repeat your initial greeting.`
            }
          });
        } catch (e) {
          console.warn('[VapiStore] Could not inject history:', e);
        }
      }
    });

    vapi.on('call-end', () => {
      set({
        isConnected: false,
        isConnecting: false,
        partialUserTranscript: '',
        partialAgentTranscript: '',
      });
    });

    vapi.on('message', async (message: any) => {

      // ── PHASE 3: Proper async tool-call handling with result return ────────────
      if (message.type === 'tool-calls' && message.toolCalls) {
        const toolCalls: any[] = message.toolCalls;

        // Execute all tool calls sequentially to ensure state mutations are ordered and predictable
        const results = [];
        for (const tool of toolCalls) {
          const res = await handleVapiToolCall(tool);
          results.push(res);
        }

        // Return results to Vapi so it can speak confirmed response
        try {
          // The @vapi-ai/react-native SDK uses vapi.send() with tool-call-result messages
          for (const result of results) {
            if (result) {
              (vapi as any).send({
                type: 'add-message',
                message: {
                  role: 'tool',
                  tool_call_id: result.toolCallId,
                  content: result.result,
                },
              });
            }
          }
        } catch (e) {
          // Fallback: if send() isn't available in this SDK version, log and continue
          console.warn('[VapiStore] vapi.send not available for tool results:', e);
          // Still execute UI actions via legacy path for navigation/cart
          for (const tool of toolCalls) {
            const fnName = tool.function?.name || '';
            const fnArgs = tool.function?.arguments || {};

            // Fallback: map well-known tools to legacy actions
            if (fnName === 'app_navigate' && fnArgs.route) {
              await executeSingleAction({ action: 'navigate', route: fnArgs.route });
            } else if (fnName === 'set_order_type' && fnArgs.order_type) {
              await executeSingleAction({ action: 'set_order_type', order_type: fnArgs.order_type });
            } else if (fnName === 'cart_update') {
              const sub = fnArgs.sub_action || 'add';
              const actionMap: Record<string, string> = {
                add: 'add_to_cart', remove: 'remove_from_cart',
                increment: 'increment_cart_item', decrement: 'decrement_cart_item',
                set_quantity: 'set_cart_quantity', clear: 'clear_cart', show: 'show_cart',
              };
              if (actionMap[sub]) {
                await executeSingleAction({
                  action: actionMap[sub],
                  menu_item_id: fnArgs.item_id,
                  quantity: fnArgs.quantity,
                  payload: fnArgs.item ? { item: fnArgs.item } : undefined,
                });
              }
            } else if (fnName === 'app_go_back') {
              await executeSingleAction({ action: 'go_back' });
            } else if (fnName === 'order_get_tracking') {
              await executeSingleAction({ action: 'open_tracking', order_id: fnArgs.order_id });
            }
          }
        }
      }

      // ── Transcript handling: real-time partial + merged final ────────────────

      if (message.type === 'transcript') {
        const text: string = message.transcript || '';
        const role: string = message.role || 'user';

        if (message.transcriptType === 'partial') {
          if (role === 'user') {
            set({ partialUserTranscript: text });
          } else {
            set({ partialAgentTranscript: text });
          }
        } else if (message.transcriptType === 'final') {
          set((state) => {
            if (!text.trim()) return state;

            const newMessages = [...state.messages];
            const lastMessage = newMessages[newMessages.length - 1];

            // Merge consecutive messages from the same speaker (no split bubbles)
            if (lastMessage && lastMessage.role === role) {
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                text: lastMessage.text + ' ' + text,
              };
            } else {
              newMessages.push({ role: role as any, text, isFinal: true });
            }

            return {
              messages: newMessages,
              partialUserTranscript: role === 'user' ? '' : state.partialUserTranscript,
              partialAgentTranscript:
                role === 'assistant' || role === 'agent' ? '' : state.partialAgentTranscript,
            };
          });
        }
      }
    });

    vapi.on('error', (e: any) => {
      console.error('[VapiStore] Vapi error:', e);
      set({ isConnected: false, isConnecting: false });
    });
  },
}));
