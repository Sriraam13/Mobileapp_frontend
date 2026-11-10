import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  // Auto-detect host IP when running via Metro dev server (e.g. 10.214.75.246)
  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri ? hostUri.split(':')[0] : null;

  if (envUrl) {
    let clean = envUrl.replace(/\/+$/, '');
    // If running on a native device/emulator and env specifies localhost/127.0.0.1,
    // map to the Metro host IP or known LAN IP so mobile devices can reach the local host backend
    if (Platform.OS !== 'web' && (clean.includes('localhost') || clean.includes('127.0.0.1'))) {
      if (metroHost) {
        return clean.replace(/localhost|127\.0\.0\.1/, metroHost);
      }
      return clean.replace(/localhost|127\.0\.0\.1/, '10.214.75.246');
    }
    return clean;
  }

  if (metroHost) {
    return `http://${metroHost}:8001`;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:8001';
  }

  return 'https://dev-api.dataudipi.com';
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

const DISH_KEYWORD_FALLBACKS: Array<{ keywords: string[]; url: string }> = [
  {
    keywords: ['gobi', 'cauliflower'],
    url: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['chappathi', 'chapati', 'roti', 'kuruma', 'parotta', 'naan'],
    url: 'https://images.unsplash.com/photo-1505253758473-96b3015f27eb?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['dosa', 'dosai', 'roast', 'uthappam', 'oothappam'],
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['idli', 'idly'],
    url: 'https://images.unsplash.com/photo-1589301760014-d929f39ce9b1?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['vada', 'vadai'],
    url: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['poori', 'puri'],
    url: 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['paneer'],
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['mushroom'],
    url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['biryani', 'pulav', 'pulao', 'fried rice', 'rice'],
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['noodles'],
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80',
  },
  {
    keywords: ['coffee', 'tea', 'juice', 'shake', 'beverage', 'drink'],
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80',
  },
];

const getDishFallbackUrl = (dishName?: string): string => {
  if (dishName) {
    const lower = dishName.toLowerCase();
    for (const entry of DISH_KEYWORD_FALLBACKS) {
      if (entry.keywords.some((kw) => lower.includes(kw))) {
        return entry.url;
      }
    }
  }
  return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80';
};

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (!trimmed || trimmed === '' || trimmed.includes('placeholder')) {
    return getDishFallbackUrl(dishName);
  }

  // If already a data URI (e.g. base64), local file URI, or blob URI, return directly
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('file://')) {
    return trimmed;
  }

  // If already a complete cloud/CDN URL (e.g. Unsplash, S3, Cloudinary, HTTPS)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    // If it points to local localhost from backend seeds, map it to IMAGE_BASE_URL
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
