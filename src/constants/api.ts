import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  // If in production and no explicit URL is provided, fail fast.
  if (!__DEV__) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured for production build.');
  }

  // Fallbacks for development ONLY
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8001`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8001';
  }
  return 'http://localhost:8001';
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

// Curated high quality food fallbacks based on dish names
const FOOD_FALLBACKS: Record<string, string> = {
  dosa: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
  idli: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
  vada: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
  rice: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
  pulav: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80',
  noodle: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
  paneer: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80',
  curry: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
  masala: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
  coffee: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  tea: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
  shake: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
  juice: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
  paratha: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
  parota: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
  snack: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
  default: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'
};

export const getSmartFoodFallback = (name?: string): string => {
  if (!name) return FOOD_FALLBACKS.default;
  const lower = name.toLowerCase();
  for (const [key, url] of Object.entries(FOOD_FALLBACKS)) {
    if (lower.includes(key)) return url;
  }
  return FOOD_FALLBACKS.default;
};

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return getSmartFoodFallback(dishName);
  }
  
  const trimmed = url.trim();

  // If already a complete cloud/CDN URL (e.g. Unsplash, S3, Cloudinary, HTTPS)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    // If it points to local localhost from backend seeds, map it to dev-api
    if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1') || trimmed.includes('10.0.2.2')) {
      try {
        const urlObj = new URL(trimmed);
        return `${IMAGE_BASE_URL}${urlObj.pathname}${urlObj.search}`;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  
  // If stored as a relative path in the database
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${IMAGE_BASE_URL}${path}`;
};

