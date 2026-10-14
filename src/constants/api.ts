import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }
  return 'http://dev-api.dataudipi.com';
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    if (dishName) {
      return `https://image.pollinations.ai/prompt/Delicious%20${encodeURIComponent(dishName)}%20food%20plating?width=800&height=600&nologo=true`;
    }
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

