import { API_BASE_URL } from '../constants/api';

/**
 * Throws an error with the message from the API response if the response is not OK.
 */
async function handleResponse(res: Response) {
  if (!res.ok) {
    let message = 'API Request Failed';
    try {
      const errorData = await res.json();
      message = errorData.detail || errorData.message || message;
    } catch (e) {
      // JSON parsing failed, fallback to status text
      message = res.statusText || message;
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * Auth & Customer Profile Endpoints
 */
export const customerApi = {
  /** POST /api/v1/public/customers/login — phone-based OTP-less login */
  login: (payload: { name?: string; phone: string; otp?: string }) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** GET /api/v1/public/customers/{customerId}/profile — by integer ID */
  getProfileById: (customerId: number) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`).then(handleResponse),

  /** GET /api/v1/public/customers/{phone}/profile — by phone (legacy) */
  getProfile: (phone: string) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${encodeURIComponent(phone)}/profile`).then(
      handleResponse,
    ),

  /** PATCH /api/v1/public/customers/{customerId}/profile — update name/email */
  updateProfile: (customerId: number, payload: { name?: string; email?: string; address?: string }) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** POST /api/v1/public/customers/{customerId}/upload-picture — multipart */
  uploadProfilePicture: (customerId: number, formData: FormData) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/upload-picture`, {
      method: 'POST',
      body: formData,
    }).then(handleResponse),

  /** GET /api/v1/public/customers/{customerId}/addresses */
  getAddresses: (customerId: number) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`).then(handleResponse),

  /** POST /api/v1/public/customers/{customerId}/addresses */
  addAddress: (customerId: number, payload: object) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** PATCH /api/v1/public/customers/{customerId}/addresses/{addressId} */
  updateAddress: (customerId: number, addressId: number, payload: object) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** DELETE /api/v1/public/customers/{customerId}/addresses/{addressId} */
  deleteAddress: (customerId: number, addressId: number) =>
    fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'DELETE',
    }).then(handleResponse),
};


/**
 * Menu Endpoints
 */
export const menuApi = {
  /** GET /api/v1/public/menu/categories */
  getCategories: (restaurantId: number = 1) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/menu/categories?restaurant_id=${restaurantId}`,
    ).then(handleResponse),

  /** GET /api/v1/public/menu/items */
  getItems: (restaurantId: number = 1) =>
    fetch(`${API_BASE_URL}/api/v1/public/menu/items?restaurant_id=${restaurantId}`).then(
      handleResponse,
    ),
};

/**
 * Order Endpoints
 */
export const orderApi = {
  /**
   * POST /api/orders — create a customer order (dine-in / takeaway / delivery).
   * The backend route lives in customer.py under the `Customer` tag.
   */
  createOrder: (payload: any) =>
    fetch(`${API_BASE_URL}/api/orders?restaurant_id=${payload.restaurant_id || 1}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** GET /api/v1/public/orders/{dbOrderId} — fetch full order details (no auth needed) */
  getOrderDetails: (dbOrderId: string, restaurantId: number = 1) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}?restaurant_id=${restaurantId}`,
    ).then(handleResponse),

  /** GET /api/orders/{dbOrderId} — fetch order status (same data, backward-compat alias) */
  getOrderStatus: (dbOrderId: string, restaurantId: number = 1) =>
    fetch(
      `${API_BASE_URL}/api/orders/${encodeURIComponent(dbOrderId)}?restaurant_id=${restaurantId}`,
    ).then(handleResponse),

  /** GET /api/v1/public/customers/orders?phone=...&restaurant_id=... — order history */
  getCustomerOrders: (phone: string, restaurantId: number = 1) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/customers/orders?phone=${encodeURIComponent(phone)}&restaurant_id=${restaurantId}`,
    ).then(handleResponse),

  /** GET /api/v1/public/orders/{dbOrderId}/tracking — delivery tracking data */
  getTracking: (dbOrderId: string) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}/tracking`,
    ).then(handleResponse),

  /** POST /api/v1/public/orders/{orderId}/feedback */
  submitFeedback: (
    orderId: string,
    payload: { rating: number; feedback_message?: string; feedback_tags?: string[] },
  ) =>
    fetch(`${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),
};

/**
 * Table Endpoints
 */
export const tableApi = {
  /** GET /api/customer/table/verify?table_number=...&restaurant_id=... */
  verifyTable: (tableNumber: string, restaurantId: number = 1) =>
    fetch(
      `${API_BASE_URL}/api/customer/table/verify?table_number=${encodeURIComponent(tableNumber)}&restaurant_id=${restaurantId}`,
    ).then(handleResponse),
};

/**
 * Payment Endpoints
 */
export const paymentApi = {
  /** GET /api/razorpay-key */
  getRazorpayKey: () => fetch(`${API_BASE_URL}/api/razorpay-key`).then(handleResponse),

  /** POST /api/create-razorpay-order */
  createRazorpayOrder: (payload: { amount: number; currency?: string; receipt?: string }) =>
    fetch(`${API_BASE_URL}/api/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),

  /** POST /api/verify-payment */
  verifyPayment: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    fetch(`${API_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse),
};

/**
 * Delivery Tracking Endpoints (new — rider tracking)
 */
export const deliveryApi = {
  /** GET /api/v1/public/orders/{orderId}/rider-location */
  getRiderLocation: (orderId: string) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/rider-location`,
    ).then(handleResponse),

  /** GET /api/v1/public/orders/{orderId}/tracking */
  getOrderTracking: (orderId: string) =>
    fetch(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/tracking`,
    ).then(handleResponse),
};
