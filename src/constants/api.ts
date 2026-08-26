import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  if (__DEV__) {
    // If Expo provides the host URI (e.g. 192.168.1.5:8081), use its IP to connect to the backend
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      return `http://${hostIp}:8001`;
    }

    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8001';
    }
  }
  
  return 'http://localhost:8001'; 
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = 'http://dev-api.dataudipi.com';

// Helper to reliably construct image URLs and overwrite local backend URLs with the production IMAGE_BASE_URL
export const getFullImageUrl = (url: string | null | undefined): string => {
  if (!url) return 'https://via.placeholder.com/150';
  
  // If the backend returned an absolute URL (e.g. from local server), extract the path and force IMAGE_BASE_URL
  if (url.startsWith('http')) {
    try {
      const urlObj = new URL(url);
      return `${IMAGE_BASE_URL}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }
  
  // Ensure we don't double up slashes if the url starts with one
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${IMAGE_BASE_URL}${path}`;
};
