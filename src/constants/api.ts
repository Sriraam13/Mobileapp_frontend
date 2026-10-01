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

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return 'https://via.placeholder.com/150?text=No+Image';
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

