/**
 * agentRegistry.ts
 *
 * PHASE 2 — Canonical screen/action/tool registries
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - All supported Expo Router routes reachable by voice
 *   - All natural-language aliases → canonical route
 *   - All supported UI action names
 *   - All supported Vapi tool names
 *
 * SECURITY: The dispatcher must reject any route or action NOT in these maps.
 * The LLM/Vapi may not navigate to arbitrary strings.
 */

// ─── Supported Routes ────────────────────────────────────────────────────────

export const SCREEN_REGISTRY: Record<string, string> = {
  // Auth
  '/login': '/login',
  '/signup': '/signup',

  // Restaurant
  '/outlet-selector': '/outlet-selector',

  // Main
  '/home': '/home',
  '/menu': '/menu',
  '/profile': '/profile',
  '/rewards': '/rewards',
  '/favourites': '/favourites',
  '/for-you': '/for-you',

  // Addresses
  '/my-addresses': '/my-addresses',
  '/add-address': '/(address)/add-address',
  '/(address)/add-address': '/(address)/add-address',
  '/(address)/my-addresses': '/(address)/my-addresses',

  // Checkout
  '/checkout': '/(checkout)/checkout',
  '/(checkout)/checkout': '/(checkout)/checkout',
  '/delivery-checkout': '/(checkout)/delivery-checkout',
  '/(checkout)/delivery-checkout': '/(checkout)/delivery-checkout',
  '/payment': '/(checkout)/payment',
  '/(checkout)/payment': '/(checkout)/payment',
  '/payment-methods': '/(checkout)/payment-methods',
  '/razorpay-screen': '/(checkout)/razorpay-screen',
  '/order-success': '/(checkout)/order-success',
  '/delivery-success': '/(checkout)/delivery-success',
  '/order-completed': '/(checkout)/order-completed',
  '/invoice': '/(checkout)/invoice',

  // Orders
  '/orders': '/(order)/orders',
  '/(order)/orders': '/(order)/orders',
  '/order-details': '/(order)/order-details',
  '/(order)/order-details': '/(order)/order-details',
  '/track-order': '/(order)/track-order',
  '/(order)/track-order': '/(order)/track-order',
  '/delivery-tracking': '/(order)/delivery-tracking',
  '/(order)/delivery-tracking': '/(order)/delivery-tracking',
  '/delivery-completed': '/(order)/delivery-completed',

  // Catering
  '/bulk-catering': '/(main)/bulk-catering',
  '/(main)/bulk-catering': '/(main)/bulk-catering',
  '/catering-choose-package': '/(main)/catering-choose-package',
  '/catering-event-details': '/(main)/catering-event-details',
  '/catering-customise-menu': '/(main)/catering-customise-menu',
  '/catering-add-extras': '/(main)/catering-add-extras',
  '/catering-review-quote': '/(main)/catering-review-quote',
  '/catering-advance-payment': '/(main)/catering-advance-payment',
  '/catering-balance-payment': '/(main)/catering-balance-payment',
  '/catering-razorpay-checkout': '/(main)/catering-razorpay-checkout',
  '/catering-order-success': '/(main)/catering-order-success',
  '/catering-order-details': '/(main)/catering-order-details',
};

// ─── Natural language alias → canonical route ─────────────────────────────

export const ROUTE_ALIASES: Record<string, string> = {
  // Home
  'home': '/home',
  'main page': '/home',
  'main': '/home',
  'start': '/home',
  'dashboard': '/home',

  // Menu
  'menu': '/menu',
  'food menu': '/menu',
  'browse menu': '/menu',
  'see menu': '/menu',
  'view menu': '/menu',

  // Profile
  'profile': '/profile',
  'my profile': '/profile',
  'account': '/profile',
  'settings': '/profile',

  // Rewards
  'rewards': '/rewards',
  'reward points': '/rewards',
  'points': '/rewards',
  'loyalty': '/rewards',
  'my points': '/rewards',

  // Favourites
  'favourites': '/favourites',
  'favorites': '/favourites',
  'saved items': '/favourites',
  'my favourites': '/favourites',
  'my favorites': '/favourites',

  // Addresses
  'addresses': '/my-addresses',
  'my addresses': '/my-addresses',
  'saved addresses': '/my-addresses',
  'delivery addresses': '/my-addresses',
  'add address': '/add-address',
  'new address': '/add-address',

  // Orders
  'orders': '/orders',
  'my orders': '/orders',
  'order history': '/orders',
  'past orders': '/orders',
  'previous orders': '/orders',

  // Checkout / Payment
  'checkout': '/checkout',
  'cart': '/checkout',
  'payment': '/payment',
  'pay': '/payment',
  'invoice': '/invoice',

  // Tracking
  'track order': '/track-order',
  'track my order': '/track-order',
  'order tracking': '/track-order',
  'tracking': '/track-order',
  'delivery tracking': '/delivery-tracking',
  'track delivery': '/delivery-tracking',

  // Catering
  'catering': '/bulk-catering',
  'bulk catering': '/bulk-catering',
  'catering packages': '/catering-choose-package',
  'event catering': '/bulk-catering',

  // Outlet
  'outlet': '/outlet-selector',
  'change outlet': '/outlet-selector',
  'select outlet': '/outlet-selector',
  'restaurant': '/outlet-selector',
  'change restaurant': '/outlet-selector',

  // Login / Signup
  'login': '/login',
  'sign in': '/login',
  'signup': '/signup',
  'register': '/signup',
};

// ─── Supported UI Actions ─────────────────────────────────────────────────

export const SUPPORTED_ACTIONS = new Set([
  // Navigation
  'navigate',
  'go_back',

  // Auth (signup form field fill)
  'set_signup_name',
  'set_signup_phone',

  // Order type
  'set_order_type',
  'select_order_type',

  // Cart
  'add_to_cart',
  'remove_from_cart',
  'increment_cart_item',
  'decrement_cart_item',
  'set_cart_quantity',
  'clear_cart',
  'show_cart',

  // Tracking / Orders
  'open_tracking',
  'open_order_details',
  'open_invoice',
  'open_delivery_tracking',

  // Addresses
  'open_addresses',
  'open_add_address',

  // Outlet
  'select_outlet',

  // Catering
  'open_catering',
]);

// ─── Supported Vapi Tool Names ────────────────────────────────────────────

export const SUPPORTED_VAPI_TOOLS = new Set([
  'app_navigate',
  'app_go_back',
  'app_get_context',
  'set_order_type',
  'menu_search',
  'cart_update',
  'customer_get_profile',
  'customer_get_rewards',
  'customer_get_orders',
  'customer_get_order',
  'order_get_tracking',
  'catering_get_data',
  'app_confirm_action',
]);

// ─── Resolve alias → canonical route ─────────────────────────────────────

export function resolveRoute(input: string): string | null {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();

  // Direct match in SCREEN_REGISTRY
  if (SCREEN_REGISTRY[input]) return SCREEN_REGISTRY[input];
  if (SCREEN_REGISTRY[normalized]) return SCREEN_REGISTRY[normalized];

  // Alias match
  if (ROUTE_ALIASES[normalized]) return ROUTE_ALIASES[normalized];

  // Partial alias match (prefix scan)
  for (const [alias, route] of Object.entries(ROUTE_ALIASES)) {
    if (normalized.includes(alias)) return route;
  }

  return null;
}

// ─── Screen display names for "where am I?" ──────────────────────────────

export const SCREEN_NAMES: Record<string, string> = {
  '/home': 'Home',
  '/(main)/home': 'Home',
  '/menu': 'Menu',
  '/(main)/menu': 'Menu',
  '/profile': 'Profile',
  '/(main)/profile': 'Profile',
  '/rewards': 'Rewards',
  '/(main)/rewards': 'Rewards',
  '/favourites': 'Favourites',
  '/(main)/favourites': 'Favourites',
  '/orders': 'Order History',
  '/(order)/orders': 'Order History',
  '/order-details': 'Order Details',
  '/(order)/order-details': 'Order Details',
  '/track-order': 'Order Tracking',
  '/(order)/track-order': 'Order Tracking',
  '/delivery-tracking': 'Delivery Tracking',
  '/(order)/delivery-tracking': 'Delivery Tracking',
  '/checkout': 'Checkout',
  '/(checkout)/checkout': 'Checkout',
  '/delivery-checkout': 'Delivery Checkout',
  '/payment': 'Payment',
  '/(checkout)/payment': 'Payment',
  '/invoice': 'Invoice',
  '/(checkout)/invoice': 'Invoice',
  '/order-success': 'Order Placed',
  '/delivery-success': 'Delivery Order Placed',
  '/my-addresses': 'My Addresses',
  '/(address)/my-addresses': 'My Addresses',
  '/add-address': 'Add Address',
  '/(address)/add-address': 'Add Address',
  '/outlet-selector': 'Outlet Selection',
  '/(main)/outlet-selector': 'Outlet Selection',
  '/login': 'Login',
  '/(auth)/login': 'Login',
  '/signup': 'Sign Up',
  '/(auth)/signup': 'Sign Up',
  '/bulk-catering': 'Bulk Catering',
  '/(main)/bulk-catering': 'Bulk Catering',
  '/catering-choose-package': 'Catering Package Selection',
  '/catering-event-details': 'Catering Event Details',
  '/catering-customise-menu': 'Catering Menu Customization',
  '/catering-add-extras': 'Catering Add Extras',
  '/catering-review-quote': 'Catering Quote Review',
  '/catering-advance-payment': 'Catering Advance Payment',
  '/catering-balance-payment': 'Catering Balance Payment',
  '/catering-order-success': 'Catering Order Success',
  '/catering-order-details': 'Catering Order Details',
};

export function getScreenDisplayName(route: string): string {
  if (!route) return 'the app';
  return SCREEN_NAMES[route] || SCREEN_NAMES['/' + route.split('/').pop()] || 'this screen';
}
