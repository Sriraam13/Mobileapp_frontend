import { API_BASE_URL } from '../constants/api';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Fetch wrapper with timeout (default 15s) using AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  const token = useAuthStore.getState().token;
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      let message = 'API Request Failed';
      try {
        const errorData = await res.json();
        message = errorData.detail || errorData.message || message;
      } catch (e) {
        message = res.statusText || message;
      }
      throw new Error(`${message} (HTTP ${res.status})`);
    }
    return await res.json();
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
}

/**
 * Auth & Customer Profile Endpoints
 */
export const customerApi = {
  /** POST /api/v1/public/customers/check-phone */
  checkPhone: (payload: { phone: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/check-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/signup */
  signup: (payload: { name: string; phone: string; otp?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/login — phone-based OTP-less login */
  login: (payload: { phone: string; otp?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** GET /api/v1/public/customers/{customerId}/loyalty */
  getLoyalty: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/loyalty`),

  /** GET /api/v1/public/customers/{customerId}/favorites */
  getFavorites: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites`),

  /** GET /api/v1/public/customers/{customerId}/recommendations */
  getRecommendations: (customerId: number, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/recommendations?restaurant_id=${restaurantId}`);
  },

  /** POST /api/v1/public/customers/{customerId}/favorites/{menuItemId} */
  addFavorite: (customerId: number, menuItemId: number) => {
    if (!menuItemId) throw new Error("menuItemId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites/${menuItemId}`, {
      method: 'POST',
    });
  },

  /** DELETE /api/v1/public/customers/{customerId}/favorites/{menuItemId} */
  removeFavorite: (customerId: number, menuItemId: number) => {
    if (!menuItemId) throw new Error("menuItemId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites/${menuItemId}`, {
      method: 'DELETE',
    });
  },

  /** GET /api/v1/public/customers/{customerId}/profile — by integer ID */
  getProfileById: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`),

  /** GET /api/v1/public/customers/{phone}/profile — by phone (legacy) */
  getProfile: (phone: string) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${encodeURIComponent(phone)}/profile`),

  /** PATCH /api/v1/public/customers/{customerId}/profile — update name/email */
  updateProfile: (customerId: number, payload: { name?: string; email?: string; address?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/{customerId}/upload-picture — multipart */
  uploadProfilePicture: (customerId: number, formData: FormData) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/upload-picture`, {
      method: 'POST',
      body: formData,
    }, 30000), // Upload may take longer

  /** GET /api/v1/public/customers/{customerId}/addresses */
  getAddresses: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`),

  /** POST /api/v1/public/customers/{customerId}/addresses */
  addAddress: (customerId: number, payload: object) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** PATCH /api/v1/public/customers/{customerId}/addresses/{addressId} */
  updateAddress: (customerId: number, addressId: number, payload: object) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** DELETE /api/v1/public/customers/{customerId}/addresses/{addressId} */
  deleteAddress: (customerId: number, addressId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'DELETE',
    }),
};


/**
 * Menu Endpoints
 */
export const menuApi = {
  /** GET /api/v1/public/menu/categories */
  getCategories: (restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/menu/categories?restaurant_id=${restaurantId}`,
    );
  },

  /** GET /api/v1/public/menu/items */
  getItems: (restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/menu/items?restaurant_id=${restaurantId}`);
  },
};

/**
 * Order Endpoints
 */
export const orderApi = {
  /**
   * POST /api/orders — create a customer order (dine-in / takeaway / delivery).
   * The backend route lives in customer.py under the `Customer` tag.
   */
  createOrder: async (payload: any) => {
    if (!payload.restaurant_id) throw new Error("restaurant_id is required");
    // Format cart items to ensure every item has valid numeric id (matching backend MenuItem.id), quantity, price
    const formattedCart = Array.isArray(payload.cart)
      ? payload.cart.map((item: any) => {
          const rawId = Number(item.id || item.menu_item_id || item.menuItemId);
          if (isNaN(rawId) || rawId <= 0) {
            throw new Error(`Invalid menu item ID in cart`);
          }
          const validId = Math.floor(rawId);
          const rawQty = Number(item.quantity);
          const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.floor(rawQty) : 1;
          const price = Number(item.price) || 0;
          return { id: validId, quantity: qty, price };
        })
      : [];

    const rawAddrId = Number(payload.delivery_address_id);
    const validAddrId = (!isNaN(rawAddrId) && rawAddrId > 0 && rawAddrId < 2147483647) ? Math.floor(rawAddrId) : null;

    const fullPayload = {
      ...payload,
      delivery_address_id: validAddrId,
      cart: formattedCart,
    };

    // WORKAROUND: The backend has a bug where it fails to commit order items 
    // for new orders (unless it's a delivery order with an assigned rider).
    // However, the `appendOrderItems` endpoint DOES commit items correctly.
    // To fix this without touching the backend, we first create the order with an empty cart
    // (which sets up the order, fees, etc.), and then immediately append the items 
    // to correctly save them to the database and update the total_amount.
    
    const emptyCartPayload = {
      ...fullPayload,
      cart: []
    };

    const res = await fetchWithTimeout(`${API_BASE_URL}/api/orders?restaurant_id=${payload.restaurant_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emptyCartPayload),
    });

    if (res && res.dbOrderId && formattedCart.length > 0) {
      try {
        await orderApi.appendOrderItems(res.dbOrderId, fullPayload);
      } catch (err) {
        console.error("Failed to append items to workaround backend issue:", err);
      }
    }

    return res;
  },

  /** GET /api/v1/public/orders/{dbOrderId} — fetch full order details (no auth needed) */
  getOrderDetails: (dbOrderId: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}?restaurant_id=${restaurantId}`,
    );
  },

  /** GET /api/orders/{dbOrderId} — fetch order status (same data, backward-compat alias) */
  getOrderStatus: (dbOrderId: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/orders/${encodeURIComponent(dbOrderId)}?restaurant_id=${restaurantId}`,
    );
  },

  /** GET /api/v1/public/customers/orders?phone=...&restaurant_id=... — order history */
  getCustomerOrders: (phone: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/customers/orders?phone=${encodeURIComponent(phone)}&restaurant_id=${restaurantId}`,
    );
  },

  /** GET /api/v1/public/orders/{dbOrderId}/tracking — delivery tracking data */
  getTracking: (dbOrderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}/tracking`,
    ),

  /** POST /api/v1/public/orders/{orderId}/feedback */
  submitFeedback: (
    orderId: string,
    payload: { rating: number; feedback_message?: string; feedback_tags?: string[] },
  ) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /**
   * POST /api/orders with order_id — append food items to an existing dine-in order
   */
  appendOrderItems: (orderId: number | string, payload: any) => {
    if (!payload.restaurant_id) throw new Error("restaurant_id is required");
    const formattedCart = Array.isArray(payload.cart)
      ? payload.cart.map((item: any) => {
          const rawId = Number(item.id || item.menu_item_id || item.menuItemId);
          if (isNaN(rawId) || rawId <= 0) {
            throw new Error(`Invalid menu item ID in cart`);
          }
          const validId = Math.floor(rawId);
          const rawQty = Number(item.quantity);
          const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.floor(rawQty) : 1;
          const price = Number(item.price) || 0;
          return { id: validId, quantity: qty, price };
        })
      : [];

    return fetchWithTimeout(`${API_BASE_URL}/api/orders?restaurant_id=${payload.restaurant_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, cart: formattedCart, order_id: Number(orderId) }),
    });
  },

  /**
   * POST /api/orders/{order_id}/settle-payment — settle payment for a dine-in order and release table
   */
  settleDineInPayment: (
    orderId: number | string,
    payload: { payment_method: string; payment_id?: string; amount_paid?: number }
  ) =>
    fetchWithTimeout(`${API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}/settle-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};

/**
 * Table Endpoints
 */
export const tableApi = {
  /** GET /api/customer/table/verify?table_number=...&restaurant_id=... */
  verifyTable: (tableNumber: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/customer/table/verify?table_number=${encodeURIComponent(tableNumber)}&restaurant_id=${restaurantId}`,
    );
  },
};

/**
 * Payment Endpoints
 */
export const paymentApi = {
  /** GET /api/razorpay-key */
  getRazorpayKey: () => fetchWithTimeout(`${API_BASE_URL}/api/razorpay-key`),

  /** POST /api/create-razorpay-order */
  createRazorpayOrder: (payload: { amount: number; currency?: string; receipt?: string; order_id: number }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/verify-payment */
  verifyPayment: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    order_id?: number;
  }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};

/**
 * Delivery Tracking Endpoints (new — rider tracking)
 */
export const deliveryApi = {
  /** GET /api/v1/public/orders/{orderId}/rider-location */
  getRiderLocation: (orderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/rider-location`,
    ),

  /** GET /api/v1/public/orders/{orderId}/tracking */
  getOrderTracking: (orderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/tracking`,
    ),
};
