import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiUrl = (): string => {
  const envUrl =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri ? hostUri.split(':')[0] : null;

  const localHostIp = '10.146.221.246';

  if (envUrl) {
    let clean = envUrl.replace(/\/+$/, '');

    if (
      Platform.OS !== 'web' &&
      (clean.includes('localhost') || clean.includes('127.0.0.1'))
    ) {
      if (metroHost) {
        return clean.replace(/localhost|127\.0\.0\.1/, metroHost);
      }
      return clean.replace(/localhost|127\.0\.0\.1/, localHostIp);
    }

    return clean;
  }

  if (metroHost) {
    return `http://${metroHost}:8001`;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:8001';
  }

  return `http://${localHostIp}:8001`;
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

export const getFullImageUrl = (
  url: string | null | undefined,
  _dishName?: string
): string => {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (
    !trimmed ||
    trimmed.includes('placeholder') ||
    trimmed.includes('unsplash.com')
  ) {
    return '';
  }

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('file://')
  ) {
    return trimmed;
  }

  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  ) {
    return trimmed;
  }

  const path = trimmed.startsWith('/')
    ? trimmed
    : `/${trimmed}`;

  return `${IMAGE_BASE_URL}${path}`;
};

export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/api/v1/public/customers/login`,
  REGISTER: `${API_BASE_URL}/api/v1/public/customers/register`,
  OTP_VERIFY: `${API_BASE_URL}/api/v1/public/customers/verify-otp`,
  RESEND_OTP: `${API_BASE_URL}/api/v1/public/customers/resend-otp`,

  CUSTOMERS: `${API_BASE_URL}/api/v1/customers`,
  PROFILE: `${API_BASE_URL}/api/v1/customers/profile`,

  RESTAURANTS: `${API_BASE_URL}/api/v1/restaurants`,
  CATEGORIES: `${API_BASE_URL}/api/v1/categories`,
  DISHES: `${API_BASE_URL}/api/v1/dishes`,
  PRODUCTS: `${API_BASE_URL}/api/v1/products`,

  CART: `${API_BASE_URL}/api/v1/cart`,
  ORDERS: `${API_BASE_URL}/api/v1/orders`,
  PAYMENTS: `${API_BASE_URL}/api/v1/payments`,

  OFFERS: `${API_BASE_URL}/api/v1/offers`,
  BANNERS: `${API_BASE_URL}/api/v1/banners`,
};

export default API_BASE_URL;