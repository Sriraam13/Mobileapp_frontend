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
import { executeSingleAction, setActiveRouter, navigateScreen, UIAction } from '../utils/mobileAgentActionDispatcher';
import { resolveRoute } from '../utils/agentRegistry';
import { getMobileAgentContext } from '../utils/agentContext';
import { buildMenuKeyterms, matchMenuItem, normalizeName } from '../utils/menuMatching';
import { API_BASE_URL, getFullImageUrl } from '../constants/api';
import { useAuthStore } from '../store/useAuthStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useAddressStore } from '../store/useAddressStore';
import { useCartStore } from './useCartStore';
import { useFavoritesStore } from './useFavoritesStore';
import { useCateringSessionStore } from './useCateringSessionStore';
import { customerApi } from '../services/apiService';

// Cache executed toolCallIds and debounce actions to avoid duplicate execution
const executedToolCallIds = new Set<string>();
let lastExecutedActionFingerprint = '';
let lastExecutedActionTime = 0;
let lastNotifiedRoute = '';
let lastNotifiedRouteTime = 0;
let lastSpeechIntentTime = 0;
let lastCategoryActionTime = 0;

function extractToolCalls(message: any): any[] {
  if (!message) return [];

  // 1. Direct toolCallList (Vapi ServerMessageToolCalls / ClientMessageToolCalls standard)
  if (Array.isArray(message.toolCallList)) {
    return message.toolCallList;
  }

  // 2. toolCalls array
  if (Array.isArray(message.toolCalls)) {
    return message.toolCalls;
  }

  // 3. tool_calls array (OpenAI snake_case)
  if (Array.isArray(message.tool_calls)) {
    return message.tool_calls;
  }

  // 4. toolWithToolCallList array
  if (Array.isArray(message.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((item: any) => item?.toolCall || item);
  }

  // 5. Singular toolCall
  if (message.toolCall && typeof message.toolCall === 'object') {
    return [message.toolCall];
  }

  // 6. function-call message type
  if (message.type === 'function-call' && message.functionCall) {
    return [{
      id: message.functionCall.id || `fn-${Date.now()}`,
      function: message.functionCall,
    }];
  }

  // 7. Singular functionCall
  if (message.functionCall && typeof message.functionCall === 'object') {
    return [{
      id: message.functionCall.id || `fn-${Date.now()}`,
      function: message.functionCall,
    }];
  }

  return [];
}

// ─── SDK Init ─────────────────────────────────────────────────────────────────
// Only the PUBLIC key is used here. Private key stays server-side.
let VapiClass: any = null;
let vapiInstance: any = null;
let listenersSetup = false;
let connectionWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearConnectionWatchdog() {
  if (connectionWatchdog) {
    clearTimeout(connectionWatchdog);
    connectionWatchdog = null;
  }
}

const isWebRTCSupported = () => {
  if (Platform.OS === 'web') return false;
  return !!(
    NativeModules &&
    (NativeModules.WebRTCModule ||
      NativeModules.DailyWebRTC ||
      NativeModules.DailyNativeUtils ||
      NativeModules.RNWebRTC ||
      (NativeModules as any).Daily)
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

export function speakAgentFeedback(message: string) {
  // Log feedback; suppressed from vapi.say to prevent overlapping speech and user turn interruptions
  console.log('[VapiStore] Agent feedback (spoken natively by Vapi):', message);
}

/**
 * Sanitizes speech transcripts to prevent brand corruption, phonetic errors,
 * and common speech-to-text mis-hearings across both user and assistant speech.
 */
export function sanitizeTranscript(raw: string, role?: string): string {
  if (!raw) return '';
  let text = raw;

  // 1. Universal Brand, Outlet & Name pronunciations/STT corruptions
  text = text
    .replace(/\b(DataUtipes|DataUtipies|Data\s*Utipes|Data\s*ODP|data\s*ODP|data\s*UDP|Data\s*UDP|data\s*udp|DataUdipi)\b/gi, 'Data Udipi')
    .replace(/\b(m\s*g\s*r\s*nagar|mgr\s*nagar)\b/gi, 'MGR Nagar')
    .replace(/\b(m\s*g\s*r)\b/gi, 'MGR')
    .replace(/\b(mugalivakam|mugalivakkam)\b/gi, 'Mugalivakkam');

  // Customer Name fix: "Riram" -> "Sriram"
  text = text.replace(/\bRiram\b/g, 'Sriram');

  // 2. Common user STT mis-hearings for food and cart actions
  if (role === 'user') {
    text = text
      .replace(/\b(to my car|in my car|into my car|to car|in car|to my card|in my card|to card|in card)\b/gi, 'to my cart')
      .replace(/\b(view my card|view card|show card|open card|my card|view my car|show car|open car|check my card|see my card)\b/gi, 'view my cart')
      .replace(/\b(add on)\b/gi, 'add')
      .replace(/\b(take away)\b/gi, 'takeaway')
      .replace(/\bdinein\b/gi, 'dine in')
      .replace(/\b(pay counter|counter pay|pay in counter|at counter)\b/gi, 'pay at counter');

    if (/^(card|car)$/i.test(text.trim())) {
      text = 'cart';
    }
  }

  return text;
}

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
  prewarm: () => void;
  notifyRouteChanged: (route: string) => void;
  sendTextMessage: (text: string) => void;
}

// ─── Backend tool executor (READ-ONLY data fetch) ─────────────────────────────

/**
 * Short-lived response cache + in-flight request dedupe.
 * Voice turns frequently repeat the same read (e.g. menu_search for the same
 * dish), and every extra network round-trip is dead air for the caller.
 */
const AGENT_TOOL_TIMEOUT_MS = 6000;
const AGENT_TOOL_CACHE_TTL: Record<string, number> = {
  menu_search: 60000,
  catering_get_data: 60000,
  customer_get_profile: 30000,
  customer_get_rewards: 30000,
};

const agentDataCache = new Map<string, { timestamp: number; data?: any; promise?: Promise<any> }>();

export function clearAgentDataCache() {
  agentDataCache.clear();
}

// Cached reads are outlet-scoped. If the user switches outlet mid-session the
// cached menu is no longer valid, so drop it immediately.
useRestaurantStore.subscribe((state: any, prevState: any) => {
  if (state?.selectedOutlet?.restaurant_id !== prevState?.selectedOutlet?.restaurant_id) {
    clearAgentDataCache();
  }
});

async function fetchAgentDataNetwork(
  toolName: string,
  args: Record<string, any>,
  restaurantIdArg?: any,
): Promise<any> {
  const auth = useAuthStore.getState();
  const restaurantState = useRestaurantStore.getState();
  let restaurantId = restaurantIdArg || restaurantState.selectedOutlet?.restaurant_id
    ? Number(restaurantIdArg || restaurantState.selectedOutlet?.restaurant_id)
    : (restaurantState.selectedOutlet?.id && !isNaN(Number(restaurantState.selectedOutlet.id))
        ? Number(restaurantState.selectedOutlet.id)
        : 1);

  if (!restaurantState.selectedOutlet) {
    restaurantState.setSelectedOutlet({
      id: 'mugalivakkam',
      restaurant_id: 1,
      name: 'Data Udipi — Mugalivakkam',
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TOOL_TIMEOUT_MS);

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
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VapiStore] Tool fetch failed ${toolName}:`, response.status, errText);
      return { error: `Failed to retrieve data (HTTP ${response.status})` };
    }

    return await response.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn(`[VapiStore] Tool timed out ${toolName} after ${AGENT_TOOL_TIMEOUT_MS}ms`);
      return { error: 'That took too long to load. Please try again.' };
    }
    console.error(`[VapiStore] Tool network error ${toolName}:`, e);
    return { error: 'Network error. Could not retrieve data.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAgentData(toolName: string, args: Record<string, any>): Promise<any> {
  const restaurant = useRestaurantStore.getState();
  const restaurantId = restaurant.selectedOutlet?.restaurant_id;

  const ttl = AGENT_TOOL_CACHE_TTL[toolName] ?? 0;
  if (ttl <= 0) {
    return fetchAgentDataNetwork(toolName, args, restaurantId);
  }

  const cacheKey = `${toolName}|${restaurantId ?? 'none'}|${JSON.stringify(args)}`;
  const now = Date.now();
  const existing = agentDataCache.get(cacheKey);

  if (existing) {
    if (existing.data && now - existing.timestamp < ttl) {
      console.log(`[VapiStore] Tool cache hit: ${toolName}`);
      return existing.data;
    }
    // Another turn already asked for this - ride along instead of re-fetching.
    if (existing.promise) {
      console.log(`[VapiStore] Tool request deduped: ${toolName}`);
      return existing.promise;
    }
  }

  const promise = fetchAgentDataNetwork(toolName, args, restaurantId).then((data) => {
    // Never cache failures, otherwise one blip poisons the whole call.
    if (data && !data.error) {
      agentDataCache.set(cacheKey, { timestamp: Date.now(), data });
    } else {
      agentDataCache.delete(cacheKey);
    }
    return data;
  }).catch((err) => {
    agentDataCache.delete(cacheKey);
    throw err;
  });

  agentDataCache.set(cacheKey, { timestamp: now, promise });
  return promise;
}

// ─── Live Cart Sync with Vapi Session ──────────────────────────────────────────

let lastSyncContent = '';

export function syncCartContextWithVapi() {
  const vapi = getVapi();
  if (!vapi || !useVapiStore.getState().isConnected) return;
  try {
    const cartState = useCartStore.getState();
    const count = cartState.getItemCount();
    const subtotal = cartState.getSubtotal();
    const rawItems = Object.values(cartState.items);
    let content = '';
    if (count > 0) {
      const summary = rawItems.map(i => `${i.quantity}x ${i.name} (₹${i.price})`).join(', ');
      content = `[Live Cart Updated] Cart currently has ${count} item(s): ${summary}. Subtotal: ₹${subtotal}. The cart is NOT empty! When the customer asks to see or view their cart or checkout, confirm these items and call "open_cart".`;
    } else {
      content = `[Live Cart Updated] Cart is currently empty (0 items).`;
    }

    if (content === lastSyncContent) return; // Prevent duplicate messages
    lastSyncContent = content;

    (vapi as any).send({
      type: 'add-message',
      message: {
        role: 'system',
        content,
      }
    });
    console.log('[VapiStore] Synced live cart with Vapi:', content);
  } catch (err) {
    console.warn('[VapiStore] Could not sync cart context with Vapi:', err);
  }
}

// Auto-sync cart changes to active Vapi session
useCartStore.subscribe(() => {
  if (useVapiStore.getState().isConnected) {
    syncCartContextWithVapi();
  }
});

// ─── Robust Cart Resolver Helper ─────────────────────────────────────────────

async function resolveAndAddToCart(fnArgs: any): Promise<{ success: boolean; code?: string; message: string; data?: any; [key: string]: any }> {
  const restaurantState = useRestaurantStore.getState();
  const selectedOutlet = restaurantState.selectedOutlet;

  if (!selectedOutlet) {
    restaurantState.setSelectedOutlet({
      id: 'mugalivakkam',
      restaurant_id: 1,
      name: 'Data Udipi — Mugalivakkam',
    });
  }

  const qty = Math.max(1, Number(fnArgs.quantity || fnArgs.qty || fnArgs.count || 1));
  const rawInput = String(
    fnArgs.item_name ||
    fnArgs.name ||
    fnArgs.dish ||
    (typeof fnArgs.item === 'string' ? fnArgs.item : '') ||
    (fnArgs.item && typeof fnArgs.item === 'object' ? fnArgs.item.name : '') ||
    fnArgs.query ||
    ''
  ).trim();
  const rawId = fnArgs.menu_item_id || fnArgs.item_id || fnArgs.id || (fnArgs.item && typeof fnArgs.item === 'object' ? fnArgs.item.id : null);

  // Clean conversational fluff (e.g. "to my car", "to my card", "to my cart", "please add on", "can you please add")
  const strippedFluff = rawInput
    .replace(/\b(to my car|to my card|to my cart|in my cart|to the car|to the card|to the cart|to cart|in cart|please add on|can you please add|please add|add on|can you add|add|order|want|give me|give|put|take)\b/gi, '')
    .trim();
  const rawName = strippedFluff || rawInput;

  console.log(`[VapiStore] resolveAndAddToCart: rawInput="${rawInput}" -> cleanName="${rawName}", rawId="${rawId}", qty=${qty}`);

  // STRICT GUARD: Masala Dosa & Ragi Dosa do not exist on Data Udipi menu (only Rava Masala Dosai and Veg. Dosai exist).
  // Never substitute them or open categories! Inform the customer immediately.
  const isExplicitRava = /\brava\b/i.test(rawName);
  const isMasalaDosa = /\bmasala\s*dosa/i.test(rawName);
  const isRagiDosa = /\bragi\s*dosa/i.test(rawName);

  if ((isMasalaDosa && !isExplicitRava) || isRagiDosa) {
    const itemLabel = isRagiDosa ? 'Ragi Dosa' : 'Masala Dosa';
    const msg = `Sorry, ${itemLabel} is not available on our menu today. Would you like to try Rava Masala Dosai or Veg. Dosai?`;
    console.log(`[VapiStore] Strictly rejected unavailable dish: ${itemLabel}`);
    try {
      const v = getVapi();
      if (v?.say) v.say(`Sorry, ${itemLabel} is not available on our menu today.`, false, true, true);
    } catch {}
    return {
      success: false,
      code: 'MENU_ITEM_NOT_FOUND',
      message: msg,
    };
  }

  // STRICT GUARD: Pure Sambar request without vadai or idly
  const isPureSambar = /\bsambar\b/i.test(rawName) && !/\b(vadai|vada|idly|idli|rice)\b/i.test(rawName);
  if (isPureSambar) {
    const localSambar = (restaurantState.menuItems || []).find((i: any) => /^sambar$|^tiffin sambar$/i.test(normalizeName(i.name)));
    if (!localSambar) {
      const msg = `Sorry, Sambar is not available as a separate item. We serve sambar with our tiffin dishes, or you can order Sambar Vadai or Sambar Rice.`;
      console.log(`[VapiStore] Pure sambar unavailable as standalone item.`);
      try {
        const v = getVapi();
        if (v?.say) v.say(`Sorry, Sambar is not available as a separate dish today.`, false, true, true);
      } catch {}
      return {
        success: false,
        code: 'MENU_ITEM_NOT_FOUND',
        message: msg,
      };
    }
  }

  // STRICT GUARD: Standalone Paneer Butter Masala without pulkha/phulka/naan combo:
  // "Pulkha with Paneer Butter Masala" and "Butter Nan with Paneer Butter Masala" are bread combos.
  // If customer asked for "Paneer Butter Masala" or "Paneer Masala" without specifying pulkha/phulka/nan combo,
  // do NOT silently add a combo! Check if standalone curry exists in database.
  const isExplicitCombo = /\b(pulkha|phulka|nan\s*with|naan\s*with|combo|roti\s*with)\b/i.test(rawName);
  const isPaneerButter = /\bpaneer\s*butter(\s*masala)?\b/i.test(rawName) || /\bpaneer\s*masala\b/i.test(rawName);
  if (isPaneerButter && !isExplicitCombo) {
    const standalone = (restaurantState.menuItems || []).find((i: any) => {
      const n = normalizeName(i.name);
      return (n === 'paneer butter masala' || n === 'paneer butter' || n === 'paneer masala') && !/\b(pulkha|phulka|naan|nan|roti|combo)\b/i.test(n);
    });
    if (!standalone) {
      const msg = `Sorry, Paneer Butter Masala is only available as a combo (such as Pulkha with Paneer Butter Masala or Butter Naan with Paneer Butter Masala), not as a standalone dish. Would you like to order the combo or a side dish like Paneer 65?`;
      console.log(`[VapiStore] Standalone Paneer Butter Masala not found in database; refused combo substitution.`);
      try {
        const v = getVapi();
        if (v?.say) v.say(msg, false, true, true);
      } catch {}
      return {
        success: false,
        code: 'MENU_ITEM_NOT_FOUND',
        message: msg,
      };
    }
  }

  // If item object was directly passed with price and id
  if (fnArgs.item && typeof fnArgs.item === 'object' && fnArgs.item.id && fnArgs.item.price != null) {
    const item = fnArgs.item;
    useCartStore.getState().addItem({
      id: Number(item.id),
      name: String(item.name),
      price: Number(item.price),
      image: getFullImageUrl(item.image || item.image_url, item.name),
      quantity: qty,
      category: String(item.category || item.category_id || 'General'),
      desc: item.desc || item.description || '',
    });
    syncCartContextWithVapi();
    const cartCount = useCartStore.getState().getItemCount();
    const subtotal = useCartStore.getState().getSubtotal();
    return {
      success: true,
      code: 'ITEM_ADDED',
      message: `Added ${qty}x ${item.name} to your cart. Cart now has ${cartCount} item(s) totaling ${subtotal} rupees.`,
      data: { item_id: item.id, name: item.name, quantity: qty, price: item.price }
    };
  }

  // 1. Try local menu match if menuItems are preloaded (or load from database on demand)
  let localMenuItems = restaurantState.menuItems || [];
  if (localMenuItems.length === 0) {
    try {
      const dbMenuData = await fetchAgentData('menu_search', {});
      if (dbMenuData && Array.isArray(dbMenuData.menu_items) && dbMenuData.menu_items.length > 0) {
        restaurantState.setMenuItems(dbMenuData.menu_items);
        localMenuItems = dbMenuData.menu_items;
        console.log(`[VapiStore] On-demand loaded ${dbMenuData.menu_items.length} items from database.`);
      }
    } catch {}
  }
  if (localMenuItems.length > 0 && rawName) {
    const localMatch = matchMenuItem(rawName, localMenuItems);
    if (localMatch.item) {
      const best = localMatch.item;
      useCartStore.getState().addItem({
        id: Number(best.id),
        name: String(best.name),
        price: Number(best.price),
        image: getFullImageUrl(best.image || best.image_url, best.name),
        quantity: qty,
        category: String(best.category || best.category_id || 'General'),
        desc: best.desc || best.description || '',
      });
      syncCartContextWithVapi();
      const cartCount = useCartStore.getState().getItemCount();
      const subtotal = useCartStore.getState().getSubtotal();
      return {
        success: true,
        code: 'ITEM_ADDED',
        item_id: best.id,
        item_name: best.name,
        quantity: qty,
        price: best.price,
        message: `Added ${qty}x ${best.name} to your cart. Cart total is ${subtotal} rupees.`,
        data: { item_id: best.id, name: best.name, quantity: qty, price: best.price, cartCount, subtotal }
      };
    }
  }

  // Look for candidates from menu_search
  let candidates: any[] = [];

  // If rawId provided, check local store menuItems first
  if (rawId) {
    const localMatch = localMenuItems.find((i: any) => String(i.id) === String(rawId));
    if (localMatch) {
      candidates = [localMatch];
    }
  }

  // If no candidate yet, search backend
  if (candidates.length === 0) {
    const searchParam = normalizeName(rawName) || rawName || (rawId ? String(rawId) : '');
    if (!searchParam) {
      return { success: false, code: 'MISSING_ITEM', message: 'Please tell me which item you would like to add to your cart.' };
    }

    const data = await fetchAgentData('menu_search', { query: searchParam });
    if (data.menu_items && Array.isArray(data.menu_items) && data.menu_items.length > 0) {
      candidates = data.menu_items;
    } else {
      // Try searching by base food noun (e.g. "biryani", "dosa", "idli", "naan", "coffee")
      const words = searchParam.split(' ').filter(w => w.length > 2);
      for (const w of words) {
        const retryData = await fetchAgentData('menu_search', { query: w });
        if (retryData.menu_items && Array.isArray(retryData.menu_items) && retryData.menu_items.length > 0) {
          candidates = retryData.menu_items;
          break;
        }
      }
    }

    // Cross-outlet fallback search if current outlet doesn't have it
    if (candidates.length === 0) {
      try {
        const globalRes = await fetch(`${API_BASE_URL}/api/v1/public/mcp/mobile-agent-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: 'menu_search',
            arguments: { query: searchParam },
            restaurant_id: null,
          }),
        });
        const globalData = await globalRes.json();
        if (globalData.menu_items && Array.isArray(globalData.menu_items) && globalData.menu_items.length > 0) {
          candidates = globalData.menu_items;
        }
      } catch {}
    }
  }

  if (candidates.length === 0) {
    return {
      success: false,
      code: 'MENU_ITEM_NOT_FOUND',
      message: `Sorry, "${rawName || rawId}" is not available on our menu today. We have Rava Masala Dosai, Veg. Dosai, Paneer Biriyani, Butter Naan, and Mini Coffee available. Would you like to try one of those?`
    };
  }

  // 1. Sambar filtering: If customer asked for sambar (without explicitly requesting vadai or idly), exclude composite dishes
  const isPureSambarRequest = /\bsambar\b/i.test(rawName) && !/\b(vadai|vada|idly|idli|rice)\b/i.test(rawName);
  if (isPureSambarRequest) {
    const pureSambarCandidates = candidates.filter((c: any) => !/\b(vadai|vada|idly|idli|rice)\b/i.test(c.name));
    if (pureSambarCandidates.length > 0) {
      candidates = pureSambarCandidates;
    }
  }

  // 2. Idly filtering: If customer asked for idly (without explicitly requesting mini idly), do NOT pick mini idly
  const isMiniIdlyRequest = /\bmini\b/i.test(rawName);
  const isSingleIdlyRequest = /\b(single|one|1)\b/i.test(rawName);
  if (!isMiniIdlyRequest && /\b(idli|idly|idlis)\b/i.test(rawName)) {
    const nonMiniCandidates = candidates.filter((c: any) => !/\bmini\b/i.test(c.name));
    if (nonMiniCandidates.length > 0) {
      candidates = nonMiniCandidates;
    }
  }

  // 3. Unrequested combo carrier filtering:
  const STAPLE_CARRIERS = ['pulkha', 'phulka', 'roti', 'chapati', 'paratha', 'parotta', 'combo', 'meals', 'thali'];
  const rawLower = rawName.toLowerCase();
  const nonComboCandidates = candidates.filter((c: any) => {
    const cLower = c.name.toLowerCase();
    const hasUnrequested = STAPLE_CARRIERS.some(sc => cLower.includes(sc) && !rawLower.includes(sc));
    return !hasUnrequested;
  });
  if (nonComboCandidates.length > 0) {
    candidates = nonComboCandidates;
  }

  // Best candidate selection
  const normTarget = normalizeName(rawName).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  let bestMatch = candidates.find((c: any) => normalizeName(c.name).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim() === normTarget);

  if (!bestMatch && !isMiniIdlyRequest && /\b(idli|idly|idlis)\b/i.test(rawName)) {
    if (isSingleIdlyRequest) {
      bestMatch = candidates.find((c: any) => /single piece|idly\(1\)/i.test(c.name));
    } else {
      bestMatch = candidates.find((c: any) => /idly\s*\(2\)|idly\(2\)/i.test(c.name));
    }
  }

  if (!bestMatch && isPureSambarRequest) {
    bestMatch = candidates.find((c: any) => /^sambar$/i.test(c.name.trim())) ||
                candidates.find((c: any) => /tiffin sambar/i.test(c.name));
  }

  if (!bestMatch && normTarget) {
    bestMatch = candidates.find((c: any) => {
      const cNorm = normalizeName(c.name).toLowerCase();
      return cNorm === normTarget;
    });
  }

  // STRICT REQUIREMENT: If the exact item requested by the user does not exist in the database,
  // DO NOT substitute candidates[0]! Inform the customer politely that the item is not available.
  if (!bestMatch) {
    console.warn(`[VapiStore] No exact match for "${rawName}" in candidates:`, candidates.map(c => c.name));
    return {
      success: false,
      code: 'MENU_ITEM_NOT_FOUND',
      message: `Sorry, "${rawName}" is not available on our menu today. Would you like to try something else from our menu?`
    };
  }

  // Add to cart in useCartStore
  useCartStore.getState().addItem({
    id: Number(bestMatch.id),
    name: String(bestMatch.name),
    price: Number(bestMatch.price),
    image: getFullImageUrl(bestMatch.image || bestMatch.image_url, bestMatch.name),
    quantity: qty,
    category: String(bestMatch.category || bestMatch.category_id || 'General'),
    desc: bestMatch.desc || bestMatch.description || '',
  });
  syncCartContextWithVapi();

  const cartTotalCount = useCartStore.getState().getItemCount();
  const subtotal = useCartStore.getState().getSubtotal();
  const feedbackMsg = `Added ${qty}x ${bestMatch.name} at ${bestMatch.price} rupees to cart. You now have ${cartTotalCount} items in cart totaling ${subtotal} rupees.`;

  return {
    success: true,
    code: 'ITEM_ADDED',
    item_id: bestMatch.id,
    item_name: bestMatch.name,
    quantity: qty,
    price: bestMatch.price,
    message: feedbackMsg,
    data: {
      item_id: bestMatch.id,
      name: bestMatch.name,
      quantity: qty,
      price: bestMatch.price,
      cartCount: cartTotalCount,
      subtotal,
    }
  };
}

// ─── Vapi Tool Call Handler ────────────────────────────────────────────────────

async function handleVapiToolCall(tool: any): Promise<{ toolCallId: string; result: string } | null> {
  const toolCallId = tool.id || tool.toolCallId || `tool-${Date.now()}`;
  const fnName: string = tool.function?.name || tool.name || '';
  let fnArgs: Record<string, any> = {};

  const rawArgs = tool.function?.arguments ?? tool.arguments;
  if (typeof rawArgs === 'string') {
    try {
      fnArgs = JSON.parse(rawArgs);
    } catch {
      console.warn(`[VapiStore] Failed to parse tool arguments string:`, rawArgs);
      fnArgs = {};
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    fnArgs = rawArgs;
  }

  console.log(`[VapiStore] >>> Tool call received: "${fnName}"`, fnArgs);

  try {
    switch (fnName) {

      // ── App Navigation ────────────────────────────────────────────────────────

      case 'app_navigate':
      case 'navigate':
      case 'open_screen':
      case 'switch_screen': {
        const rawTarget =
          fnArgs.route ||
          fnArgs.destination ||
          fnArgs.page ||
          fnArgs.screen ||
          fnArgs.target ||
          '';

        console.log(`[VapiStore] Navigation requested for target: "${rawTarget}"`);

        // Check if destination enum implies order type (e.g. DINE_IN or TAKEAWAY)
        if (typeof rawTarget === 'string') {
          const upper = rawTarget.toUpperCase();
          if (upper.includes('DINE')) {
            useCartStore.getState().setOrderType('Dine In');
          } else if (
            upper.includes('TAKEAWAY') ||
            upper.includes('TAKE_AWAY') ||
            upper.includes('TAKE AWAY') ||
            upper.includes('PARCEL') ||
            upper.includes('PICKUP')
          ) {
            useCartStore.getState().setOrderType('Take Away');
          } else if (upper.includes('DELIVER')) {
            useCartStore.getState().setOrderType('Delivery');
          }
        }

        const resolved = resolveRoute(String(rawTarget));
        if (!resolved) {
          console.warn(`[VapiStore] Route "${rawTarget}" could not be resolved!`);
          return {
            toolCallId,
            result: JSON.stringify({
              success: false,
              code: 'ROUTE_NOT_FOUND',
              message: `Screen "${rawTarget}" is not supported.`
            })
          };
        }

        console.log(`[VapiStore] Resolved route: "${resolved}", executing navigation...`);

        // Guard against rogue navigation to checkout screen when user is talking about food / menu
        if (resolved === '/(checkout)/checkout') {
          const recentUserText = useVapiStore.getState().messages
            .filter((m: any) => m.role === 'user')
            .slice(-3)
            .map((m: any) => m.text.toLowerCase())
            .join(' ');
          const explicitCartRequest = /\b(open cart|show cart|view cart|go to cart|my cart|checkout|basket)\b/i.test(recentUserText);
          const cartCount = useCartStore.getState().getItemCount();
          if (!explicitCartRequest || cartCount === 0) {
            console.log(`[VapiStore] Suppressed navigation to checkout screen (explicit=${explicitCartRequest}, cartCount=${cartCount})`);
            return {
              toolCallId,
              result: JSON.stringify({
                success: true,
                message: 'Your cart is currently empty. Feel free to explore our menu categories!',
              })
            };
          }
        }

        const navParams: Record<string, any> = { ...(fnArgs.params || {}) };
        if (fnArgs.category || fnArgs.category_name) {
          navParams.categoryName = fnArgs.category || fnArgs.category_name;
        }
        if (fnArgs.payLater !== undefined || fnArgs.pay_later !== undefined) {
          navParams.payLater = String(fnArgs.payLater ?? fnArgs.pay_later);
        }

        const result = await executeSingleAction({
          action: 'navigate',
          route: resolved,
          payload: { params: navParams },
        });

        console.log(`[VapiStore] Navigation result:`, result);
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'app_go_back':
      case 'go_back': {
        const result = await executeSingleAction({ action: 'go_back' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'proceed_to_checkout': {
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
      case 'select_order_mode':
      case 'switch_order_type':
      case 'switch_order_mode':
      case 'switch_mode':
      case 'set_order_mode':
      case 'change_order_type':
      case 'select_order_type':
      case 'switch_to_takeaway':
      case 'switch_to_dine_in':
      case 'switch_to_delivery':
      case 'takeaway':
      case 'dine_in':
      case 'delivery': {
        let typeToSet =
          fnArgs.order_type ||
          fnArgs.orderType ||
          (fnName === 'switch_to_takeaway' || fnName === 'takeaway' ? 'Take Away' :
           fnName === 'switch_to_dine_in' || fnName === 'dine_in' ? 'Dine In' :
           fnName === 'switch_to_delivery' || fnName === 'delivery' ? 'Delivery' : undefined);

        const uiAction: UIAction = {
          action: 'set_order_type',
          order_type: typeToSet,
        };
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'set_table_number':
      case 'table_number': {
        const table = fnArgs.table_number || fnArgs.table || fnArgs.tableNumber || '';
        const uiAction: UIAction = {
          action: 'set_table_number',
          table_number: table,
        };
        const result = await executeSingleAction(uiAction);
        speakAgentFeedback(`Set table to ${table} for Dine In. What can I get for you today?`);
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── Menu Search ───────────────────────────────────────────────────────────

      case 'menu_search':
      case 'get_menu': {
        const restaurantState = useRestaurantStore.getState();
        const selectedOutlet = restaurantState.selectedOutlet;
        const restaurantId = selectedOutlet?.restaurant_id 
          ? Number(selectedOutlet.restaurant_id) 
          : (selectedOutlet?.id && !isNaN(Number(selectedOutlet.id)) ? Number(selectedOutlet.id) : 1);

        if (!selectedOutlet) {
          restaurantState.setSelectedOutlet({
            id: 'mugalivakkam',
            restaurant_id: 1,
            name: 'Data Udipi — Mugalivakkam',
          });
        }

        const cleanString = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const valueTrimmed = value.trim();
          return valueTrimmed.length > 0 ? valueTrimmed : undefined;
        };

        const rawQuery = cleanString(fnArgs.query);
        const rawCategory = cleanString(fnArgs.category_name) ?? cleanString(fnArgs.category);

        const isShowAll = !rawQuery || /^(all|all menus?|menu|everything|items)$/i.test(rawQuery || '');

        // menu_search is a data read tool. Screen navigation is only performed if explicit category navigation is requested without a search query.
        if (rawCategory && !rawQuery) {
          executeSingleAction({
            action: 'open_category',
            category_name: rawCategory,
          }).catch(() => {});
        }

        const normalizedArgs: Record<string, any> = {};
        if (rawQuery && !isShowAll) normalizedArgs.query = rawQuery;
        if (rawCategory) normalizedArgs.category_name = rawCategory;

        console.log("[VapiStore] RAW TOOL:", fnName);
        console.log("[VapiStore] CANONICAL TOOL: menu_search");
        console.log("[VapiStore] NORMALIZED ARGS:", normalizedArgs);
        console.log("[VapiStore] RESTAURANT ID:", restaurantId);

        let data = await fetchAgentData('menu_search', normalizedArgs);

        // Fallback: If category_name resulted in CATEGORY_NOT_FOUND, search by query
        if (data.code === 'CATEGORY_NOT_FOUND' && rawCategory) {
          console.log('[VapiStore] Category search failed, falling back to query search for:', rawCategory);
          data = await fetchAgentData('menu_search', { query: rawCategory });
        }

        if (data.code === 'MENU_ITEM_NOT_FOUND' && rawQuery) {
          const firstWord = rawQuery.split(/\s+/)[0];
          if (firstWord && firstWord.length > 2 && firstWord !== rawQuery) {
            data = await fetchAgentData('menu_search', { query: firstWord });
          }
        }

        console.log("[VapiStore] BACKEND RESULT:", data.success ? 'success' : 'error');
        console.log("[VapiStore] MENU ITEM COUNT:", data.count ?? (data.menu_items?.length || 0));

        // Add spoken summary for conversational TTS
        if (data.success && data.menu_items && data.menu_items.length > 0) {
          const sample = data.menu_items.slice(0, 5).map((i: any) => `${i.name} at ${i.price} rupees`).join(', ');
          data.summary = `Found ${data.count || data.menu_items.length} items. Here are some: ${sample}. I have opened the menu on your screen.`;
        }

        if (data.error && data.code) {
          return { toolCallId, result: JSON.stringify({ success: false, code: data.code, message: data.error }) };
        }

        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Cart ──────────────────────────────────────────────────────────────────

      case 'open_cart':
      case 'show_cart':
      case 'view_cart':
      case 'get_cart':
      case 'cart_get': {
        const cartState = useCartStore.getState();
        const rawItems = Object.values(cartState.items);
        const cartCount = cartState.getItemCount();
        const subtotal = cartState.getSubtotal();
        const itemsList = rawItems.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        }));

        const isReadOperation = fnName === 'get_cart' || fnName === 'cart_get';
        const now = Date.now();
        const recentlyOpenedCategory = (now - lastCategoryActionTime) < 15000;

        // Check if the user explicitly commanded to VIEW the cart
        const recentUserText = useVapiStore.getState().messages
          .filter((m: any) => m.role === 'user')
          .slice(-3)
          .map((m: any) => m.text.toLowerCase())
          .join(' ');
        const explicitCartRequest = /\b(open cart|show cart|view cart|go to cart|my cart|the cart|checkout|open basket|view basket|view my card|open card|show card|my card|check cart|cart)\b/i.test(recentUserText);

        // ONLY navigate if user explicitly commanded cart, it's not a read operation, not right after category, and cart has items
        if (explicitCartRequest && !isReadOperation && !recentlyOpenedCategory && cartCount > 0) {
          console.log('[VapiStore] Explicit cart navigation confirmed.');
          await executeSingleAction({ action: 'show_cart', payload: { force: true } });
        } else {
          console.log(`[VapiStore] Suppressed cart screen navigation (explicit=${explicitCartRequest}, isRead=${isReadOperation}, recentCat=${recentlyOpenedCategory}, count=${cartCount})`);
        }

        let speechSummary = '';
        if (cartCount === 0) {
          speechSummary = 'Your cart is currently empty. Would you like to add some delicious dishes from our menu?';
        } else {
          const itemNames = itemsList.map(i => `${i.quantity}x ${i.name}`).join(', ');
          speechSummary = explicitCartRequest && cartCount > 0 && !recentlyOpenedCategory
            ? `You have ${cartCount} items in your cart: ${itemNames}, totaling ${subtotal} rupees. I have opened your cart on screen.`
            : `You have ${cartCount} items in your cart totaling ${subtotal} rupees: ${itemNames}.`;
        }

        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            itemCount: cartCount,
            subtotal,
            items: itemsList,
            message: speechSummary,
            summary: speechSummary,
          }),
        };
      }

      case 'add_to_cart': {
        console.log(`[VapiStore] ADD_TO_CART REQUEST:`, fnArgs);
        const res = await resolveAndAddToCart(fnArgs);
        console.log(`[VapiStore] ADD_TO_CART RESULT:`, res);
        return { toolCallId, result: JSON.stringify(res) };
      }

      case 'remove_from_cart': {
        const result = await executeSingleAction({
          action: 'remove_from_cart',
          menu_item_id: fnArgs.item_id,
          payload: fnArgs.item_name ? { item_name: fnArgs.item_name } : undefined,
        } as any);
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
        if (subAction === 'add') {
          console.log(`[VapiStore] CART_UPDATE (ADD) REQUEST:`, fnArgs);
          const res = await resolveAndAddToCart(fnArgs);
          console.log(`[VapiStore] CART_UPDATE (ADD) RESULT:`, res);
          return { toolCallId, result: JSON.stringify(res) };
        }

        if (subAction === 'show') {
          await executeSingleAction({ action: 'show_cart' });
          const cartState = useCartStore.getState();
          const rawItems = Object.values(cartState.items);
          const cartCount = cartState.getItemCount();
          const subtotal = cartState.getSubtotal();
          const itemsList = rawItems.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          }));

          let speechSummary = '';
          if (cartCount === 0) {
            speechSummary = 'Your cart is currently empty.';
          } else {
            const itemNames = itemsList.map(i => `${i.quantity}x ${i.name}`).join(', ');
            speechSummary = `You have ${cartCount} items in your cart: ${itemNames}, totaling ${subtotal} rupees. I have opened your cart on screen.`;
          }

          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              itemCount: cartCount,
              subtotal,
              items: itemsList,
              message: speechSummary,
              summary: speechSummary,
            }),
          };
        }

        const actionMap: Record<string, string> = {
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
          payload: fnArgs.item ? { item: fnArgs.item } : (fnArgs.item_name ? { item_name: fnArgs.item_name } : undefined),
        } as any;
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── Customer Profile ──────────────────────────────────────────────────────

      case 'customer_get_profile':
      case 'open_profile':
      case 'profile':
      case 'my_profile': {
        executeSingleAction({ action: 'navigate', route: '/profile' }).catch(() => {});
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          return { toolCallId, result: JSON.stringify({ success: true, message: 'Opened profile screen. Please log in to view full profile details.' }) };
        }
        const data = await fetchAgentData('customer_get_profile', { customer_id: auth.customerId });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Rewards ───────────────────────────────────────────────────────────────

      case 'customer_get_rewards':
      case 'open_rewards':
      case 'rewards':
      case 'loyalty_points':
      case 'my_rewards': {
        executeSingleAction({ action: 'open_rewards' }).catch(() => {});
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          speakAgentFeedback('Please sign in to view your loyalty points balance. Opening rewards screen.');
          return { toolCallId, result: JSON.stringify({ success: true, message: 'Please sign in to view your loyalty points balance. Opened rewards screen.' }) };
        }
        try {
          const res = await customerApi.getLoyalty(auth.customerId);
          const points = res?.balance ?? 0;
          const worth = (points * 0.1).toFixed(2);
          speakAgentFeedback(`You currently have ${points} loyalty points, worth ₹${worth}.`);
          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              loyalty_points: points,
              balance: points,
              worth_in_rupees: worth,
              transactions: res?.transactions || [],
              message: `You currently have ${points} loyalty points, worth ₹${worth}. Opened your rewards screen.`
            })
          };
        } catch (err: any) {
          const data = await fetchAgentData('customer_get_rewards', { customer_id: auth.customerId });
          return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
        }
      }

      // ── Favourites & For You ──────────────────────────────────────────────────

      case 'open_favourites':
      case 'open_favorites':
      case 'favourites':
      case 'favorites':
      case 'customer_get_favorites':
      case 'my_favourites':
      case 'my_favorites':
      case 'get_favorites': {
        executeSingleAction({ action: 'open_favourites' }).catch(() => {});
        const auth = useAuthStore.getState();
        const favStore = useFavoritesStore.getState();
        let favCount = (favStore.favorites || []).length;
        if (auth.isAuthenticated && auth.customerId) {
          try {
            const res = await customerApi.getFavorites(auth.customerId);
            if (Array.isArray(res)) {
              favCount = res.length;
            }
          } catch {}
        }
        speakAgentFeedback('Opening your favourite orders and recommendations.');
        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            favorites_count: favCount,
            message: `Opened your Favourite Orders and recommendations screen. You have ${favCount} saved favourite items.`
          })
        };
      }

      // ── Addresses ─────────────────────────────────────────────────────────────

      case 'open_addresses':
      case 'customer_get_addresses':
      case 'get_addresses':
      case 'my_addresses':
      case 'addresses': {
        executeSingleAction({ action: 'open_addresses' }).catch(() => {});
        const addresses = useAddressStore.getState().addresses;
        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            count: addresses.length,
            addresses,
            message: `You have ${addresses.length} saved addresses. Opened your addresses screen.`
          })
        };
      }

      case 'select_address':
      case 'choose_address':
      case 'set_delivery_address': {
        const query = String(fnArgs.address || fnArgs.type || fnArgs.address_id || fnArgs.name || '').toLowerCase().trim();
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
            toolCallId,
            result: JSON.stringify({
              success: true,
              message: `Selected delivery address: ${matched.type} (${matched.address || matched.full_address}).`,
              data: matched
            })
          };
        }
        executeSingleAction({ action: 'open_addresses' }).catch(() => {});
        return {
          toolCallId,
          result: JSON.stringify({
            success: false,
            message: 'No matching saved address found. Opened your addresses screen.'
          })
        };
      }

      // ── Order History ─────────────────────────────────────────────────────────

      case 'customer_get_orders':
      case 'open_orders':
      case 'orders':
      case 'my_orders': {
        executeSingleAction({ action: 'navigate', route: '/(order)/orders' }).catch(() => {});
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

      case 'track_order':
      case 'delivery_tracking': {
        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;
        const result = await executeSingleAction({
          action: 'open_tracking',
          order_id: orderId ? String(orderId) : undefined,
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'order_get_tracking': {
        const auth = useAuthStore.getState();
        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;

        // Also navigate to tracking screen so the UI shows it
        if (orderId) {
          executeSingleAction({ action: 'open_tracking', order_id: String(orderId) }).catch(() => {});
        } else {
          executeSingleAction({ action: 'open_tracking' }).catch(() => {});
        }

        if (!auth.isAuthenticated) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }

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

      // ── Menu Category & Region Navigation ─────────────────────────────────────

      case 'switch_region':
      case 'select_region':
      case 'open_region': {
        const region = fnArgs.region || fnArgs.region_name || fnArgs.name || fnArgs.cuisine || '';
        lastCategoryActionTime = Date.now();
        const result = await executeSingleAction({
          action: 'switch_region',
          region,
        });
        const speech = `I have switched your menu to ${result.data?.region || region || 'your requested region'}.`;
        return {
          toolCallId,
          result: JSON.stringify({ ...result, message: speech }),
        };
      }

      case 'open_category':
      case 'menu_filter_category':
      case 'filter_category': {
        const catName = fnArgs.category_name || fnArgs.category || fnArgs.name || fnArgs.query || '';
        const region = fnArgs.region || fnArgs.region_name || '';

        // Check if recent user message was attempting to order food or ask for dishes (e.g. "ragi dosa", "masala dosa", "paneer biryani")
        const recentUserText = useVapiStore.getState().messages
          .filter((m: any) => m.role === 'user')
          .slice(-2)
          .map((m: any) => m.text.toLowerCase())
          .join(' ');

        const isOrderingContext = /\b(add|order|cart|car|card|want|give|put|take|dosa|biryani|idli|idly|poori|coffee|tea|naan|roti|paneer|gobi)\b/i.test(recentUserText);

        if (isOrderingContext) {
          console.log(`[VapiStore] Suppressed open_category ("${catName}") because user is in ordering intent: "${recentUserText}"`);
          return {
            toolCallId,
            result: JSON.stringify({
              success: false,
              code: 'CATEGORY_OPEN_SUPPRESSED',
              message: 'Do not open menu categories when the customer is ordering, adding, or inquiring about specific dishes. Handle dish ordering or state dish availability directly without navigating categories.',
            }),
          };
        }

        lastCategoryActionTime = Date.now();
        const result = await executeSingleAction({
          action: 'open_category',
          category_name: catName,
          region,
        } as any);
        const speech = `I have opened the ${catName || 'menu'} category on your screen.`;
        return {
          toolCallId,
          result: JSON.stringify({ success: true, message: speech, categoryName: catName, region }),
        };
      }

      // ── Dine-In Workflows (Pay Later, Pay at Counter & Pay Bill) ──────────────

      case 'dine_in_action':
      case 'dine_in_pay_later':
      case 'dine_in_pay_bill':
      case 'dine_in_pay_counter':
      case 'pay_bill':
      case 'pay_later':
      case 'pay_counter':
      case 'pay_at_counter': {
        const rawAction = String(
          fnArgs.action_type ||
          fnArgs.action ||
          (fnName === 'pay_bill' || fnName === 'dine_in_pay_bill' ? 'pay_bill' :
           fnName === 'dine_in_pay_counter' || fnName === 'pay_counter' || fnName === 'pay_at_counter' ? 'pay_counter' :
           'pay_later')
        ).toLowerCase();

        if (rawAction.includes('counter') || rawAction.includes('cash')) {
          const result = await executeSingleAction({ action: 'dine_in_pay_counter' });
          return { toolCallId, result: JSON.stringify(result) };
        } else if (rawAction.includes('bill') || rawAction.includes('settle')) {
          const result = await executeSingleAction({ action: 'dine_in_pay_bill' });
          return { toolCallId, result: JSON.stringify(result) };
        } else {
          const result = await executeSingleAction({ action: 'dine_in_pay_later' });
          return { toolCallId, result: JSON.stringify(result) };
        }
      }

      // ── Catering ──────────────────────────────────────────────────────────────

      case 'open_catering': {
        const result = await executeSingleAction({ action: 'open_catering' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'catering_set_event_details':
      case 'catering_fill_event_details': {
        const result = await executeSingleAction({
          action: 'catering_set_event_details',
          payload: fnArgs,
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'catering_navigate_step': {
        const result = await executeSingleAction({
          action: 'catering_navigate_step',
          payload: fnArgs,
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'catering_customise_item': {
        const result = await executeSingleAction({
          action: 'catering_customise_item',
          payload: fnArgs,
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'catering_choose_package':
      case 'catering_select_package': {
        const pkgCode = fnArgs.package_code || fnArgs.code || '';
        const pkgName = fnArgs.package_name || fnArgs.name || '';
        const currentStoreCount = useCateringSessionStore.getState().guestCount;
        const rawCount = fnArgs.guest_count || fnArgs.pax || currentStoreCount || '50';
        const parsedCount = parseInt(String(rawCount), 10);
        const guestCount = (!isNaN(parsedCount) && parsedCount >= 50) ? parsedCount : 50;
        const params: Record<string, any> = {};
        if (pkgCode) params.selectedPackage = pkgCode;
        if (guestCount) params.guestCount = String(guestCount);
        const result = await executeSingleAction({
          action: 'catering_choose_package',
          payload: { params },
        });
        const navigatedToEventDetails = result.data?.navigatedTo === 'event_details';
        const speech = navigatedToEventDetails
          ? `I have opened catering event details on your screen. Please provide your event date, occasion, and guest count (minimum 50 guests) first.`
          : pkgName
          ? `I have opened catering package selection for ${pkgName} on your screen.`
          : `I have opened the catering packages on your screen. You can select from Grand Breakfast, Variety Feast, Regular Lunch, and more.`;
        return { toolCallId, result: JSON.stringify({ success: true, message: speech, ...params }) };
      }

      case 'select_outlet':
      case 'choose_outlet':
      case 'outlet_selector': {
        const result = await executeSingleAction({ action: 'select_outlet' });
        return { toolCallId, result: JSON.stringify(result) };
      }

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

        if (subType === 'packages' && data.packages && data.packages.length > 0) {
          const sample = data.packages.slice(0, 4).map((p: any) => `${p.name} at ${p.price_per_person} rupees per person`).join(', ');
          data.summary = `We offer ${data.packages.length} catering packages, including ${sample}. Would you like to view package details or choose one?`;
        }

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
        const method = String(fnArgs.payment_method || fnArgs.method || '').toLowerCase();
        if (method.includes('counter') || method.includes('cash')) {
          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              message: 'Selected Pay at Counter. You can pay with Cash, Card, or UPI directly at the counter.',
              payment_method: 'Pay at Counter',
            })
          };
        } else {
          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              message: 'Selected UPI / Online Payment. You can pay via Google Pay, PhonePe, Paytm, or Cards.',
              payment_method: 'UPI',
            })
          };
        }
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

    // Reflect intent immediately so the UI never looks frozen while we set up.
    set({ isConnecting: true });

    if (Platform.OS === 'android') {
      try {
        // check() is a cheap no-UI lookup; only fall back to the (slow) request
        // dialog when permission has not been granted yet.
        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );

        if (!alreadyGranted) {
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
      dynamicFirstMessage = "Welcome to Data Udipi! Which outlet would you like to order from today? We have Mugalivakkam and MGR Nagar.";
    } else {
      const { useDineInSessionStore } = require('../store/useDineInSessionStore');
      const dineIn = useDineInSessionStore.getState();
      if (dineIn.isActive && dineIn.activeOrderId) {
        dynamicFirstMessage = `Welcome back! You have an active Dine-In session at Table ${dineIn.tableNumber || 'your table'}. Would you like to order more items, check order status, or pay your bill?`;
      } else {
        dynamicFirstMessage = "Welcome to Data Udipi! Would you like to Dine-In, Takeaway, or order Delivery today?";
      }
    }

    // Clean up any stale or half-open native call before starting a new one
    if ((vapi as any).started) {
      try {
        vapi.stop();
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch {}
    }

    // 15-second connection watchdog: if call never reaches connected or error state, auto-reset
    clearConnectionWatchdog();
    connectionWatchdog = setTimeout(() => {
      const state = useVapiStore.getState();
      if (state.isConnecting && !state.isConnected) {
        console.warn('[VapiStore] Voice agent connection timed out (15s watchdog). Resetting state.');
        try {
          getVapi()?.stop();
        } catch {}
        set({ isConnecting: false, isConnected: false });
      }
    }, 15000);

    try {
      console.log('[VapiStore] Starting Vapi call with assistantId:', assistantId);
      await vapi.start(assistantId);
    } catch (e) {
      console.error('[VapiStore] startCall error:', e);
      clearConnectionWatchdog();
      set({ isConnecting: false });
    }
  },

  stopCall: () => {
    clearConnectionWatchdog();
    try {
      getVapi()?.stop();
    } catch {}
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

  /**
   * Loads the native Vapi SDK ahead of time so the first tap doesn't pay for
   * the module require + client construction. Safe to call repeatedly.
   */
  prewarm: () => {
    if (vapiInstance) return;
    const warm = () => {
      try {
        getVapi();
      } catch (e) {
        console.warn('[VapiStore] prewarm skipped:', e);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(warm);
    } else {
      setTimeout(warm, 0);
    }
  },

  notifyRouteChanged: (route: string) => {
    if (!route) return;
    const cleanRoute = route.replace(/^\/\([^)]+\)/, '') || route;
    const now = Date.now();
    // Don't repeat identical route notification within 3.5 seconds
    if (cleanRoute === lastNotifiedRoute && (now - lastNotifiedRouteTime) < 3500) {
      return;
    }
    // Also throttle all route notifications to at least 2000ms apart
    if ((now - lastNotifiedRouteTime) < 2000) {
      return;
    }
    lastNotifiedRoute = cleanRoute;
    lastNotifiedRouteTime = now;

    const vapi = getVapi();
    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[System Update] The user has navigated to screen: ${cleanRoute}`
          }
        });
      } catch (e) {
        console.warn('[VapiStore] Failed to notify route change:', e);
      }
    }
  },

  sendTextMessage: (text: string) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const vapi = getVapi();

    // Optimistically add user message to transcript
    set((state) => ({
      messages: [...state.messages, { role: 'user', text: trimmed, isFinal: true }],
      partialUserTranscript: '',
    }));

    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'user',
            content: trimmed,
          },
        });
      } catch (e) {
        console.warn('[VapiStore] Failed to send user message to vapi:', e);
      }
    }
  },

  setupListeners: (routerRef) => {
    if (routerRef) {
      setActiveRouter(routerRef);
    }
    if (listenersSetup) return;
    const vapi = getVapi();
    if (!vapi) return;
    listenersSetup = true;

    vapi.on('call-start', () => {
      clearConnectionWatchdog();
      lastSyncContent = '';
      set({ isConnected: true, isConnecting: false });

      // Warm the menu cache in the background so the first food request does
      // not stall on a cold network fetch, and populate store with real database items.
      const hasLocalMenu = (useRestaurantStore.getState().menuItems || []).length > 0;
      if (!hasLocalMenu) {
        fetchAgentData('menu_search', {}).then((data: any) => {
          if (data && Array.isArray(data.menu_items) && data.menu_items.length > 0) {
            useRestaurantStore.getState().setMenuItems(data.menu_items);
            console.log(`[VapiStore] Preloaded ${data.menu_items.length} menu items from database into store.`);
          }
        }).catch(() => {});
      }

      // Inject current app context on call start
      try {
        const initialContext = getMobileAgentContext();
        const auth = useAuthStore.getState();

        // Asynchronously prefetch loyalty points so Vapi has the latest exact balance
        if (auth.isAuthenticated && auth.customerId) {
          customerApi.getLoyalty(auth.customerId).then((res: any) => {
            if (res && res.balance !== undefined) {
              const pts = res.balance || 0;
              const worth = (pts * 0.1).toFixed(2);
              const v = getVapi();
              if (v && get().isConnected) {
                try {
                  (v as any).send({
                    type: 'add-message',
                    message: {
                      role: 'system',
                      content: `[Customer Loyalty Status] Points Balance: ${pts} loyalty points (worth ₹${worth}). 10 points = ₹1. When the customer asks about their points or rewards, announce their exact balance and rupee value!`
                    }
                  });
                } catch {}
              }
            }
          }).catch(() => {});
        }

        const customerName = auth.customerName ? auth.customerName.replace(/\bRiram\b/gi, 'Sriram') : 'Customer';
        const outletName = initialContext.restaurant.selectedOutletName || 'MGR Nagar';
        const rawOrderType = initialContext.cart.orderType || 'Take Away';
        const hasCartItems = initialContext.cart.itemCount > 0;
        const hasActiveDineIn = initialContext.dineIn.isActive && !!initialContext.dineIn.activeOrderId;

        let workflowStatus = '';
        if (hasActiveDineIn) {
          workflowStatus = `Active Dine-In session at Table ${initialContext.dineIn.tableNumber || 'your table'}.`;
        } else if (hasCartItems) {
          workflowStatus = `Active ${rawOrderType} order in progress with ${initialContext.cart.itemCount} items in cart.`;
        } else {
          workflowStatus = `No order mode selected yet. Default app tab is ${rawOrderType}. DO NOT assume the customer wants ${rawOrderType}!`;
        }

        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[Current App Context]
- Restaurant Brand: Data Udipi (Pronunciation: "Dah-tah Oo-dih-pee"). ALWAYS say "Data Udipi". NEVER say "DataUtipes", "Data ODP", or "data UDP".
- Customer Name: ${customerName} (Pronunciation: "Shree-rahm" or "Sree-ram"). ALWAYS say "${customerName}". NEVER say "Riram".
- Selected Outlet: ${outletName} (Pronunciation: "M-G-R Nagar"). NEVER say or write "m g r nagar".
- Status: ${workflowStatus}
- Cart Items: ${initialContext.cart.itemCount}, Subtotal: ₹${initialContext.cart.subtotal}.${auth.isAuthenticated ? ` Customer ID: ${auth.customerId}.` : ''}

CRITICAL GREETING & WORKFLOW DIRECTIVES:
1. GREETING DIRECTIVE:
   - Unless the customer has an active Dine-In session or items already in their cart, DO NOT assert an order mode!
   - NEVER say "You've selected takeaway" or "Would you like to order for takeaway today?"!
   - Greet warmly: "Welcome to Data Udipi, ${customerName}! Would you like to Dine-In, Takeaway, or order Delivery today?"
   - Let the customer choose their preferred order workflow!
2. Spoken Announcements: ALWAYS verbally announce what you are opening, switching, or adding. Never navigate or execute silently!
2. FOOD ORDERING & ADD TO CART (TOP PRIORITY):
   - Whenever the customer wants to add, order, get, buy, or put any dish or drink into their cart (e.g. "add one ragi dosa", "add paneer biryani to cart", "give me 2 idlis", "order coffee", "add veg fried rice"):
     • ALWAYS call tool "add_to_cart" with { item_name: "<dish_name>", quantity: <number> } immediately!
     • NEVER call "open_category" or "open_menu" when the customer is ordering or adding an item!
     • When "add_to_cart" succeeds, enthusiastically confirm: "Added [quantity] [item_name] to your cart."
   - STRICT REAL MENU MATCHING & NO ARBITRARY SUBSTITUTIONS:
     • If an item is NOT in the database (e.g. Masala Dosa, Ragi Dosa), DO NOT substitute another dish and DO NOT call open_category. Politely announce that it is not available on today's menu.
     • When customer asks for "idly", add "Idly (2)" or single piece idly if single piece is asked. NEVER add "Mini Idly(14)".
     • When customer asks for "sambar", add only "Sambar" or "Tiffin Sambar". NEVER add "Sambar Vadai" or "Sambar Idly".
3. VIEWING CART & CHECKOUT:
   - When the customer asks to see, view, open, check, or go to their cart, basket, or checkout (e.g. "view my cart", "cart", "show cart", "view my card", "checkout"):
     • ALWAYS call tool "open_cart"!
     • DO NOT assume the cart is empty from your initial prompt. The "open_cart" tool checks the live items and subtotal.
4. BROWSING CATEGORIES & CUISINES:
   - ONLY call "open_category" (category_name) or "switch_region" ("North Indian" or "South Indian") when the customer explicitly asks to BROWSE, VIEW, SHOW, or EXPLORE categories or cuisines without ordering (e.g. "show dosa varieties", "what rice dishes do you have", "show tandoori starters", "switch to North Indian").
   - NEVER call "open_category" if the customer says "add", "order", "get", "cart", or names a specific dish to add.
5. DATABASE AS THE SOLE SOURCE OF TRUTH (STRICT MANDATORY):
   - The backend database is the ONLY source of truth for all menu items, prices, and availability!
   - NEVER invent, assume, or guess dishes or prices.
   - NEVER substitute an item with a combo or bread combo!
     • If the customer asks for "Paneer Butter Masala" as a curry, DO NOT add "Pulkha with Paneer Butter Masala" or "Butter Naan with Paneer Butter Masala"!
     • If a customer asks for a dish that does not exist in the database, politely explain that it is not available on today's menu.
   - When the customer asks to browse categories or asks what dishes exist, call tool "menu_search" or "open_category" to fetch real database items.
   - When the customer asks to add an item to the cart, call "add_to_cart" with their EXACT dish request name.
7. Catering Knowledge & Event Booking:
   - Catering Navigation Flow:
     • The first page of catering is the Bulk Catering overview screen (bulk-catering) with features, featured packages, and terms & conditions.
     • When planning or booking an order, the flow order is: FIRST Event Details screen (catering-event-details), THEN Packages section (catering-choose-package).
   - Guest Count Rules:
     • Minimum order quantity for bulk catering is strictly 50 guests.
     • Customers can enter 50 or ANY number greater than 50 (e.g. 50, 75, 100, 200, 500+).
     • NEVER clamp or restrict guest count to only 50 when the customer wants more.
     • Orders for fewer than 50 guests (e.g. 10, 25, 40) are NOT permitted. If a customer requests fewer than 50, politely explain:
       "Bulk catering requires a minimum of 50 guests. The order count must be 50 or more."
   - Available Catering Packages:
     • Regular Breakfast (Code: MENU 1) - ₹160/plate
     • Special Breakfast (Code: MENU 2) - ₹210/plate
     • Grand Breakfast (Code: MENU 3) - ₹225/plate
     • Regular Lunch (Code: L-MENU 1) - ₹150/plate
     • Special Lunch (Code: L-MENU 2) - ₹190/plate
     • Special Feast (Code: L-MENU 3) - ₹225/plate
     • Grand Feast (Code: L-MENU 4) - ₹275/plate
     • Variety Lunch/Dinner (Code: V-RICE MENU 1) - ₹200/plate
     • Special Variety Lunch/Dinner (Code: V-RICE MENU 2) - ₹240/plate
     • Variety Feast Lunch/Dinner (Code: V-RICE MENU 3) - ₹270/plate
     • Variety Grand Feast Lunch/Dinner (Code: V-RICE MENU 4) - ₹320/plate
     • Evening Tiffin 1 (Code: E-MENU 1) - ₹135/plate
     • Evening Tiffin 2 (Code: E-MENU 2) - ₹150/plate
     • Evening Tiffin 3 (Code: E-MENU 3) - ₹160/plate
     • Seemantham (Code: S-MENU 1) - ₹210/plate
   - When user asks to open catering, explore catering, or show catering:
     Call tool "open_catering" to navigate to the Bulk Catering screen (bulk-catering).
   - When user provides event details (e.g. guest count, date, time, occasion, address):
     Call tool "catering_set_event_details" with { guest_count, event_name, occasion, date, time, address }.
     If user specifies a count of 50 or more (e.g. 100 guests), pass that exact count. If user asks for fewer than 50, state that 50 is the minimum.
   - When user asks to see or choose catering packages:
     Call "catering_choose_package" with { package_code }. If event details are not filled yet, it will open Event Details first.
8. Dine-In Workflow (MANDATORY PRESENTATION SCENARIO):
   - When user starts, always offer or confirm order type: Dine-In, Takeaway, or Delivery.
   - For Dine-In: ask for their table number and call "set_table_number" with { table_number: "T-04" }.
   - MAIN DINE-IN ORDERING & PAYMENT FLOW (CRITICAL):
     • When the customer has selected items in their cart and is ready to order or checkout:
       YOU MUST ASK THE CUSTOMER VERBATIM:
       "Do you want to proceed to payment or want to pay later?"
     • If customer says "Pay later" (or "send to kitchen", "after eating"):
       Call tool "dine_in_pay_later". Food is sent to the kitchen and status is tracked.
     • If customer says "Cash" or "Pay at counter" or "Counter" or "Proceed to payment":
       In Dine-In, "Cash" means "Pay at Counter"!
       Call tool "dine_in_pay_counter". This places the order with Pay at Counter and navigates directly to the final completed screen (/order-completed).
   - This flow applies ONLY to Dine-In.
   - Multiple Rounds: Users seated at their table can order more items at any time. When more items are ordered, they automatically append as Round 2, Round 3, etc. to the same table.
   - Order Status: When user asks "where is my food?", "order status", or "track order", call tool "open_tracking" to show live status.
   - Bill Settlement: When user is done eating and says "pay bill", "settle bill", or "complete meal", call tool "dine_in_pay_bill" to open the table settlement payment screen.
9. Rewards & Loyalty Points:
   - When user asks "how many reward points do I have?", "what is my loyalty balance?", "my points balance", or "check rewards":
     • Announce their exact points balance and worth (10 points = ₹1 discount).
     • Call tool "customer_get_rewards" or "open_rewards" to navigate to the Rewards screen.
10. Favourite Orders & Recommendations:
   - When user asks for "favourite order", "favourite orders", "my favorites", "open favourites", or "recommendations":
     • Call tool "open_favourites".
     • Verbally confirm: "Opening your favourite orders and recommendations."`
          }
        });
      } catch (e) {
        console.warn('[VapiStore] Could not inject initial context:', e);
      }

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
      clearConnectionWatchdog();
      set({
        isConnected: false,
        isConnecting: false,
        partialUserTranscript: '',
        partialAgentTranscript: '',
      });
    });

    vapi.on('call-start-failed', (err: any) => {
      console.error('[VapiStore] Call start failed:', err);
      clearConnectionWatchdog();
      set({ isConnected: false, isConnecting: false });
    });

    vapi.on('message', async (message: any) => {
      if (!message) return;

      console.log(`[VapiStore] Incoming Vapi message: "${message.type || 'unknown'}"`);

      // ── Speech-update / interruption lifecycle ───────────────────────────────
      if (message.type === 'speech-update') {
        if (message.status === 'stopped' && (message.role === 'assistant' || message.role === 'agent')) {
          const partial = get().partialAgentTranscript.trim();
          if (partial) {
            set((state) => {
              const newMessages = [...state.messages];
              const last = newMessages[newMessages.length - 1];
              const lastIsAgent = last && (last.role === 'assistant' || last.role === 'agent');
              if (last && lastIsAgent) {
                if (!last.text.includes(partial)) {
                  newMessages[newMessages.length - 1] = {
                    ...last,
                    text: `${last.text.trim()} ${partial}`.trim(),
                  };
                }
              } else {
                newMessages.push({ role: 'assistant', text: partial, isFinal: true });
              }
              return { messages: newMessages, partialAgentTranscript: '' };
            });
          } else {
            set({ partialAgentTranscript: '' });
          }
        } else if (message.status === 'stopped' && message.role === 'user') {
          set({ partialUserTranscript: '' });
        }
      }

      if (message.type === 'user-interrupted') {
        set({ partialAgentTranscript: '' });
      }

      // ── Tool Call Extraction & Execution ──────────────────────────────────────
      const isToolCallsMessage =
        message.type === 'tool-calls' ||
        message.type === 'tool_calls' ||
        message.type === 'function-call';

      if (isToolCallsMessage) {
        const toolCalls = extractToolCalls(message);
        if (toolCalls && toolCalls.length > 0) {
          console.log(`[VapiStore] Processing ${toolCalls.length} tool call(s) from message type "${message.type}"...`);

          const pending = toolCalls.filter((tool: any) => {
            const toolCallId = tool.id || tool.toolCallId || '';
            const fnName = tool.function?.name || tool.name || '';
            const rawArgs = tool.function?.arguments ?? tool.arguments ?? '';
            const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
            const fingerprint = `${fnName}:${argsStr}`;
            const now = Date.now();

            if (toolCallId && executedToolCallIds.has(toolCallId)) {
              console.log(`[VapiStore] Skipping already executed toolCallId: ${toolCallId}`);
              return false;
            }
            if (fingerprint === lastExecutedActionFingerprint && (now - lastExecutedActionTime) < 2500) {
              console.log(`[VapiStore] Debouncing duplicate tool execution: ${fingerprint}`);
              return false;
            }

            if (toolCallId) {
              executedToolCallIds.add(toolCallId);
              setTimeout(() => executedToolCallIds.delete(toolCallId), 120000);
            }
            lastExecutedActionFingerprint = fingerprint;
            lastExecutedActionTime = now;
            return true;
          });

          // Run tool calls concurrently
          await Promise.all(
            pending.map(async (tool: any) => {
              try {
                const res = await handleVapiToolCall(tool);
                if (res && res.toolCallId) {
                  const vapi = getVapi();
                  if (vapi && get().isConnected) {
                    try {
                      // 1. Send client message tool-calls-result to resolve Vapi server call
                      (vapi as any).send({
                        type: 'tool-calls-result',
                        toolCallResult: {
                          toolCallId: res.toolCallId,
                          result: res.result,
                        },
                      });
                    } catch (sendErr) {
                      console.warn('[VapiStore] Failed to send tool-calls-result:', sendErr);
                    }
                    try {
                      // 2. Also send tool message to add-message for OpenAI tool format compatibility
                      (vapi as any).send({
                        type: 'add-message',
                        message: {
                          role: 'tool',
                          tool_call_id: res.toolCallId,
                          content: res.result,
                        },
                      });
                    } catch {}
                  }
                }
              } catch (e) {
                console.error('[VapiStore] Tool execution failed:', e);
              }
            })
          );
        }
      }

      // ── Transcript handling: real-time partial + merged final ────────────────

      if (message.type === 'transcript') {
        const rawText: string = message.transcript || '';
        const rawRole: string = message.role || 'user';
        const role: 'user' | 'assistant' =
          (rawRole === 'assistant' || rawRole === 'agent' || rawRole === 'bot') ? 'assistant' : 'user';

        // Clean up common STT phonetics, brand names, and mis-hearings across both speakers
        const text: string = sanitizeTranscript(rawText, role);

        if (message.transcriptType === 'partial') {
          if (role === 'user') {
            set({ partialUserTranscript: text });
          } else {
            set({ partialAgentTranscript: text });
          }
        } else if (message.transcriptType === 'final') {
          // Process speech intent detection only on FINAL, confirmed user transcripts
          if (role === 'user' && text) {
            const lower = text.toLowerCase().trim();
            const now = Date.now();
            const isOrderIntent = /\b(add|order|cart|car|card|want|give|buy|get|take|plus|put|parcel|plate|cup|please add)\b/i.test(lower);

            if (now - lastSpeechIntentTime >= 1500) {
              // 1.05 Direct Voice Food Ordering Fallback (catches "add on paneer biryani to my car", "add 1 paneer biryani", etc.)
              if (
                /\b(add|order|get|want|put|give me)\b.*\b(biryani|dosa|idli|idly|vadai|vada|coffee|tea|poori|naan|roti|paneer|gobi|meals|rice|fried rice)\b/i.test(lower)
              ) {
                const dishTokens = lower
                  .replace(/\b(to my car|to my card|to my cart|in my cart|to cart|in cart|please add on|can you please add|please add|add on|can you add|add|order|want|give me|give|put|take|uh|can i get|i want)\b/gi, '')
                  .replace(/\b(one|1|two|2|three|3|four|4)\b/gi, '')
                  .trim();

                const parsedQty = /\b(two|2)\b/i.test(lower) ? 2 : /\b(three|3)\b/i.test(lower) ? 3 : /\b(four|4)\b/i.test(lower) ? 4 : 1;
                if (dishTokens.length > 2) {
                  lastSpeechIntentTime = now;
                  console.log(`[VapiStore] Speech fallback ordering dish: "${dishTokens}" qty=${parsedQty}`);
                  resolveAndAddToCart({ item_name: dishTokens, quantity: parsedQty });
                }
              }
              // 1. Order Mode Switches (Takeaway / Dine In / Delivery)
              else if (
                /\b(switch|change|set|make|select|turn|go|put)\b.*\b(takeaway|take away|take out|parcel|pickup)\b/i.test(lower) ||
                /^(switch to |change to )?(takeaway|take away)(\s*(please|mode|option))?$/i.test(lower)
              ) {
                if (useCartStore.getState().orderType !== 'Take Away') {
                  lastSpeechIntentTime = now;
                  console.log('[VapiStore] Speech detected intent: switch to takeaway');
                  useCartStore.getState().setOrderType('Take Away');
                }
              } else if (
                /\b(switch|change|set|make|select|turn|go|put)\b.*\b(dine in|dine-in|dinein|table)\b/i.test(lower) ||
                /^(switch to |change to )?(dine in|dine-in)(\s*(please|mode|option))?$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: switch to dine in');
                useCartStore.getState().setOrderType('Dine In');
                const tableMatch = lower.match(/\btable\s*(?:no\.?|number)?\s*([a-z0-9-]+)\b/i);
                if (tableMatch && tableMatch[1]) {
                  const rawTable = tableMatch[1].toUpperCase();
                  const formatted = rawTable.startsWith('T') ? rawTable : `T-${rawTable.padStart(2, '0')}`;
                  useCartStore.getState().setTableNumber(formatted);
                }
              } else if (
                /\b(switch|change|set|make|select|turn|go|put)\b.*\b(delivery|deliver|home delivery)\b/i.test(lower) ||
                /^(switch to |change to )?(delivery)(\s*(please|mode|option))?$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: switch to delivery');
                useCartStore.getState().setOrderType('Delivery');
              }
              // 1.45 Table Number Selection ("table 4", "table T-02", "seated at table 5", "i am at table 3")
              else if (
                /\b(table|table number|seated at table|i am at table)\s*(?:no\.?|number)?\s*([a-z0-9-]+)\b/i.test(lower)
              ) {
                const match = lower.match(/\b(?:table|table number|seated at table|i am at table)\s*(?:no\.?|number)?\s*([a-z0-9-]+)\b/i);
                if (match && match[1]) {
                  lastSpeechIntentTime = now;
                  const rawTable = match[1].toUpperCase();
                  const formatted = rawTable.startsWith('T') ? rawTable : `T-${rawTable.padStart(2, '0')}`;
                  useCartStore.getState().setTableNumber(formatted);
                  useCartStore.getState().setOrderType('Dine In');
                  console.log('[VapiStore] Speech detected intent: set table number', formatted);
                }
              }
              // 1.48 Dine-In Checkout Inquiries ("place order", "checkout", "order now", "ready to order")
              else if (
                useCartStore.getState().orderType === 'Dine In' &&
                useCartStore.getState().getItemCount() > 0 &&
                /\b(checkout|place order|order now|ready to order|confirm order|proceed to checkout)\b/i.test(lower) &&
                !/\b(pay later|cash|counter|pay at counter|pay bill)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: dine-in prompt payment choice');
                try {
                  const v = getVapi();
                  if (v?.say) v.say("Do you want to proceed to payment or want to pay later?", false, true, true);
                } catch {}
              }
              // 1.5 Dine-In Pay Later / Send to Kitchen ("pay later", "send to kitchen")
              else if (
                /\b(pay later|pay-later|paylater|send to kitchen|pay after eating)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: dine in pay later / send to kitchen');
                executeSingleAction({ action: 'dine_in_pay_later' });
                try {
                  const v = getVapi();
                  if (v?.say) v.say("Your order has been sent to the kitchen. You can enjoy your meal and pay later.", false, true, true);
                } catch {}
              }
              // 1.55 Dine-In Pay at Counter / Cash ("cash", "pay at counter", "counter", "pay with cash", "proceed to payment")
              else if (
                useCartStore.getState().orderType === 'Dine In' &&
                useCartStore.getState().getItemCount() > 0 &&
                /\b(cash|pay at counter|pay counter|counter|pay with cash|pay by cash|proceed to payment|pay now)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: dine in pay at counter (cash)');
                executeSingleAction({ action: 'dine_in_pay_counter' });
                try {
                  const v = getVapi();
                  if (v?.say) v.say("I have placed your order with Pay at Counter. Please settle the bill at the counter when you are ready.", false, true, true);
                } catch {}
              }
              // 1.6 Dine-In Pay Bill / Settle Meal ("pay bill", "settle bill", "complete meal")
              else if (
                /\b(pay bill|pay the bill|pay my bill|settle bill|paybill|complete meal|settle at counter)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: dine in pay bill');
                executeSingleAction({ action: 'dine_in_pay_bill' });
              }
              // 1.62 Order Status / Tracking ("where is my food", "order status", "track order", "track my food")
              else if (
                /\b(where is my food|where is my order|order status|track order|track my order|is my food ready)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: track order');
                executeSingleAction({ action: 'open_tracking' });
              }
              // 1.65 Region Switches (North Indian / South Indian / All Regions)
              else if (
                /\b(north indian|north-indian|northindian)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                lastCategoryActionTime = now;
                console.log('[VapiStore] Speech detected intent: switch to North Indian');
                executeSingleAction({ action: 'switch_region', region: 'North Indian' });
              }
              else if (
                /\b(south indian|south-indian|southindian)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                lastCategoryActionTime = now;
                console.log('[VapiStore] Speech detected intent: switch to South Indian');
                executeSingleAction({ action: 'switch_region', region: 'South Indian' });
              }
              else if (
                /\b(all regions|all foods|both regions|all foods menu|full menu)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                lastCategoryActionTime = now;
                console.log('[VapiStore] Speech detected intent: switch to All Regions');
                executeSingleAction({ action: 'switch_region', region: 'All Regions' });
              }
              // 1.7 Menu Categories (Rice Varieties, Dosa Varieties, Starters, Breads, Noodles, Lunch, etc.)
              // CRITICAL: NEVER trigger category navigation if the user is attempting to add/order an item!
              else if (!isOrderIntent && (
                /\b(show|open|view|see|go to|take me to|display|switch to|explore)\b.*\b(rice|dosa|beverages|coffee|tea|snacks|soups|soup|starters|tandoori|noodles|noodle|salad|salads|raitha|raita|breakfast|lunch|dinner|categories|category|meals|breads|roti|naan|biryani|fried rice)\b/i.test(lower) ||
                /^(rice varieties|rice varities|dosa varieties|dosa varities|hot beverages|evening snacks|breakfast & dinner|tandoori starters|tandoori breads|tandoori side dishes|lunch|breakfast|dinner|soups|soup|noodles|noodle|salad|salads|raitha|raita|starters|starter|breads|bread|roti|naan|categories|menu)$/i.test(lower)
              )) {
                lastSpeechIntentTime = now;
                lastCategoryActionTime = now;
                let catName = 'Rice Varieties';
                let targetRegion: string | undefined = undefined;

                // North Indian
                if (/bread|roti|naan|kulcha|paratha/i.test(lower)) {
                  catName = 'Tandoori Breads';
                  targetRegion = 'North Indian';
                } else if (/side dish|side dishes|paneer butter|gravy|dal makhani|curry/i.test(lower)) {
                  catName = 'Tandoori Side Dishes';
                  targetRegion = 'North Indian';
                } else if (/starter|tikka|kabab/i.test(lower)) {
                  catName = 'Tandoori Starters';
                  targetRegion = 'North Indian';
                } else if (lower.trim() === 'tandoori') {
                  catName = 'Tandoori Starters';
                  targetRegion = 'North Indian';
                } else if (/noodle/i.test(lower)) {
                  catName = 'Noodles';
                  targetRegion = 'North Indian';
                } else if (/salad/i.test(lower)) {
                  catName = 'Salad';
                  targetRegion = 'North Indian';
                } else if (/raitha|raita/i.test(lower)) {
                  catName = 'Raitha';
                  targetRegion = 'North Indian';
                } else if (/fried rice|biryani|pulao|pulav|jeera rice/i.test(lower)) {
                  catName = 'Rice Varieties';
                  targetRegion = 'North Indian';
                }
                // South Indian
                else if (/dosa|dosai|roast|uthappam/i.test(lower)) {
                  catName = 'Dosa Varieties';
                  targetRegion = 'South Indian';
                } else if (/snack|vada|samosa|bajji|bonda/i.test(lower)) {
                  catName = 'Evening Snacks';
                  targetRegion = 'South Indian';
                } else if (/beverage|coffee|tea|filter coffee|drink/i.test(lower)) {
                  catName = 'Hot Beverages';
                  targetRegion = 'South Indian';
                } else if (/soup/i.test(lower)) {
                  catName = 'Soups';
                  targetRegion = 'South Indian';
                } else if (/breakfast|idli|pongal|poori|dinner/i.test(lower)) {
                  catName = 'Breakfast & Dinner';
                  targetRegion = 'South Indian';
                } else if (/lunch|meal|thali/i.test(lower)) {
                  catName = 'Lunch';
                  targetRegion = 'South Indian';
                } else if (/rice/i.test(lower)) {
                  catName = 'Rice Varieties';
                  targetRegion = 'South Indian';
                } else if (/categories|category/i.test(lower)) {
                  catName = '';
                }

                console.log('[VapiStore] Speech detected intent: open category', catName || 'all', targetRegion || '');
                if (catName) {
                  executeSingleAction({ action: 'open_category', category_name: catName, region: targetRegion } as any);
                } else {
                  executeSingleAction({ action: 'open_menu' });
                }
              }
              // 1.8 Catering Event Details ("catering for 100 people", "100 guests", "set guest count to 80", "wedding catering")
              else if (
                /\b(catering for|guests?|event details|guest count|occasion|service type)\b/i.test(lower) &&
                /\b(\d{1,4}|wedding|birthday|anniversary|reception|people|guests)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                const guestMatch = lower.match(/\b(\d{1,4})\s*(guests?|people|persons?|members?|pax)?\b/);
                let countNum = guestMatch ? parseInt(guestMatch[1], 10) : undefined;
                let guestFeedback = '';
                if (countNum !== undefined) {
                  if (countNum < 50) {
                    guestFeedback = ' (minimum 50 guests required, set to 50)';
                    countNum = 50;
                  } else {
                    guestFeedback = ` for ${countNum} guests`;
                  }
                }
                const count = countNum !== undefined ? String(countNum) : undefined;
                
                let occasion = undefined;
                if (/wedding|marriage/i.test(lower)) occasion = 'Wedding';
                else if (/birthday/i.test(lower)) occasion = 'Birthday Party';
                else if (/anniversary/i.test(lower)) occasion = 'Anniversary';
                else if (/reception/i.test(lower)) occasion = 'Reception';
                else if (/seemantham/i.test(lower)) occasion = 'Seemantham';
                else if (/party/i.test(lower)) occasion = 'Party';

                console.log('[VapiStore] Speech detected intent: catering event details', { count, occasion });
                executeSingleAction({
                  action: 'catering_set_event_details',
                  guest_count: count,
                  occasion,
                  event_name: occasion,
                } as any);
                speakAgentFeedback(`Entered event details${guestFeedback}${occasion ? ` for ${occasion}` : ''}.`);
              }
              // 1.85 Catering Packages ("catering packages", "choose catering package", "order catering package")
              else if (
                /\b(catering package|catering packages|choose catering|order catering package|bulk catering packages)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: catering packages');
                executeSingleAction({ action: 'catering_choose_package' });
                speakAgentFeedback('Here are our catering packages.');
              }
              // 1.9 Bulk Catering ("catering", "bulk catering", "event catering", "switch to catering")
              else if (
                /\b(show|open|view|see|go to|take me to|switch to|switch mode to)\b.*\b(catering|bulk catering|event catering)\b/i.test(lower) ||
                /^(catering|bulk catering)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: open catering event details');
                executeSingleAction({ action: 'open_catering' });
                speakAgentFeedback('Opening catering event details. Please share your event date, occasion, and guest count (minimum 50 guests).');
              }
              // 2. Menu Navigation ("show all the menus", "show menu", "open menu", "view menu")
              else if (
                /\b(show|open|view|see|go to|take me to|display)\b.*\b(menu|menus|all the menu|all menus|items)\b/i.test(lower) ||
                /\b(all the menus|show menu|browse menu|food menu)\b/i.test(lower) ||
                /^(menu|the menu|show all the menus)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: show all menus');
                navigateScreen('/menu');
                speakAgentFeedback('Opening menu for you.');
              }
              // 3. Profile Navigation ("open profile", "show profile", "my account")
              else if (
                /\b(show|open|view|go to|take me to)\b.*\b(profile|account|my profile|my account)\b/i.test(lower) ||
                /^(profile|my profile|my account)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: open profile');
                navigateScreen('/profile');
                speakAgentFeedback('Opening your profile.');
              }
              // 4. Rewards / Loyalty Points ("loyalty points", "rewards", "my points", "how many points")
              else if (
                /\b(reward|rewards|loyalty|loyalty point|loyalty points|my points|points balance|how many points)\b/i.test(lower) ||
                /^(rewards|loyalty points)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: open rewards');
                navigateScreen('/rewards');
                const auth = useAuthStore.getState();
                if (auth.isAuthenticated && auth.customerId) {
                  customerApi.getLoyalty(auth.customerId).then((res: any) => {
                    const pts = res?.balance ?? 0;
                    const worth = (pts * 0.1).toFixed(2);
                    speakAgentFeedback(`You have ${pts} loyalty points, worth ₹${worth}. Opening your rewards.`);
                  }).catch(() => {
                    speakAgentFeedback('Opening your rewards and loyalty points.');
                  });
                } else {
                  speakAgentFeedback('Opening your rewards.');
                }
              }
              // 4.5 Favourite Orders / Recommendations ("favourite order", "favourite orders", "favorite order", "my favorites")
              else if (
                /\b(favourite order|favourite orders|favorite order|favorite orders|favourite|favourites|favorite|favorites|for you|frequently ordered|recommended items|recommendations)\b/i.test(lower) ||
                /^(favourites|favorites|favourite order|favorite order)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: open favourites');
                navigateScreen('/favourites');
                speakAgentFeedback('Opening your favourite orders and recommendations.');
              }
              // 5. Addresses ("show addresses", "my address", "select address")
              else if (
                /\b(address|addresses|delivery address|saved address)\b/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: address handling');
                if (/\b(home)\b/i.test(lower)) {
                  executeSingleAction({ action: 'select_address', payload: { address: 'home' } } as any);
                  speakAgentFeedback('Selected your home address.');
                } else if (/\b(work|office)\b/i.test(lower)) {
                  executeSingleAction({ action: 'select_address', payload: { address: 'work' } } as any);
                  speakAgentFeedback('Selected your work address.');
                } else {
                  navigateScreen('/(address)/my-addresses');
                  speakAgentFeedback('Opening your saved addresses.');
                }
              }
              // 6. Orders / History ("show orders", "order history", "past orders")
              else if (
                /\b(show|open|view|my|past)\b.*\b(orders|order history)\b/i.test(lower) ||
                /^(orders|my orders|order history)$/i.test(lower)
              ) {
                lastSpeechIntentTime = now;
                console.log('[VapiStore] Speech detected intent: open orders');
                navigateScreen('/(order)/orders');
                speakAgentFeedback('Opening your orders.');
              }
              // 7. Cart / Checkout ("show cart", "view cart", "open cart", "checkout", "view my card")
              else if (
                /\b(show|open|view|go to|take me to)\b.*\b(cart|basket|checkout|card|car)\b/i.test(lower) ||
                /^(cart|view cart|open cart|checkout|view my cart|view my card|my cart|my card|card)$/i.test(lower)
              ) {
                const cartCount = useCartStore.getState().getItemCount();
                if (cartCount > 0) {
                  lastSpeechIntentTime = now;
                  console.log('[VapiStore] Speech detected intent: open cart');
                  navigateScreen('/(checkout)/checkout');
                } else {
                  console.log('[VapiStore] Cart is empty, suppressed voice navigation to empty cart.');
                }
              }
            }
          }

          set((state) => {
            if (!text.trim()) return state;

            const newMessages = [...state.messages];
            const lastMessage = newMessages[newMessages.length - 1];
            const isAgent = role === 'assistant';
            const lastIsAgent = lastMessage && (lastMessage.role === 'assistant' || lastMessage.role === 'agent');

            // Merge consecutive messages from the same speaker into one bubble
            if (lastMessage && ((isAgent && lastIsAgent) || (!isAgent && lastMessage.role === 'user'))) {
              const prevText = lastMessage.text.trim();
              const incomingText = text.trim();

              if (incomingText.startsWith(prevText)) {
                // Cumulative transcript update from Vapi
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  text: incomingText,
                };
              } else if (!prevText.endsWith(incomingText)) {
                // Incremental chunk: join cleanly with a space
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  text: `${prevText} ${incomingText}`.replace(/\s+/g, ' ').trim(),
                };
              }
            } else {
              newMessages.push({ role, text: text.trim(), isFinal: true });
            }

            return {
              messages: newMessages,
              partialUserTranscript: role === 'user' ? '' : state.partialUserTranscript,
              partialAgentTranscript: isAgent ? '' : state.partialAgentTranscript,
            };
          });
        }
      }
    });

    vapi.on('error', (e: any) => {
      clearConnectionWatchdog();
      const errStr = typeof e === 'string' ? e : JSON.stringify(e || {});
      const isCleanMeetingEnd =
        e?.errorMsg === 'Meeting has ended' ||
        e?.error?.msg === 'Meeting has ended' ||
        e?.error?.type === 'ejected' ||
        errStr.includes('Meeting has ended') ||
        errStr.includes('"type":"ejected"');

      if (isCleanMeetingEnd) {
        console.log('[VapiStore] Vapi call session closed cleanly:', e?.errorMsg || e?.error?.msg || 'Meeting has ended');
        set({ isConnected: false, isConnecting: false });
        return;
      }

      console.error('[VapiStore] Vapi error:', e);
      set({ isConnected: false, isConnecting: false });
    });
  },
}));
