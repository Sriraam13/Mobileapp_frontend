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

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (!trimmed || trimmed === '' || trimmed.includes('placeholder') || trimmed.includes('unsplash.com')) {
    return '';
  }

  // If already a data URI (e.g. base64), local file URI, or blob URI, return directly
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('file://')) {
    return trimmed;
  }

  // If already a complete cloud/CDN URL (e.g. S3, Cloudinary, HTTPS)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    if (trimmed.includes('unsplash.com')) {
      return '';
    }
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
