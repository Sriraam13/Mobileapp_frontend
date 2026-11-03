import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, Image, Text } from 'react-native';
import { WebView } from 'react-native-webview';

export interface InteractiveGoogleMapRef {
  animateToRegion: (region: { latitude: number; longitude: number }, duration?: number) => void;
  panTo: (latitude: number, longitude: number) => void;
}

interface InteractiveGoogleMapProps {
  latitude: number;
  longitude: number;
  onLocationChange?: (coords: { latitude: number; longitude: number }) => void;
  style?: any;
  apiKey?: string;
  zoom?: number;
}

const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';

const InteractiveGoogleMap = forwardRef<InteractiveGoogleMapRef, InteractiveGoogleMapProps>(({
  latitude,
  longitude,
  onLocationChange,
  style,
  apiKey = DEFAULT_API_KEY,
  zoom = 16,
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastReportedCoords = useRef({ lat: latitude, lng: longitude });

  const panTo = useCallback((lat: number, lng: number) => {
    lastReportedCoords.current = { lat, lng };
    const script = `
      if (typeof window.panToLocation === 'function') {
        window.panToLocation(${lat}, ${lng});
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  useImperativeHandle(ref, () => ({
    animateToRegion: (region) => {
      panTo(region.latitude, region.longitude);
    },
    panTo: (lat, lng) => {
      panTo(lat, lng);
    },
  }), [panTo]);

  // Handle external updates to latitude/longitude
  useEffect(() => {
    if (isLoaded) {
      const dLat = Math.abs(latitude - lastReportedCoords.current.lat);
      const dLng = Math.abs(longitude - lastReportedCoords.current.lng);
      if (dLat > 0.0001 || dLng > 0.0001) {
        panTo(latitude, longitude);
      }
    }
  }, [latitude, longitude, isLoaded, panTo]);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body, #map {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: #f1f3f4;
        }
        .center-marker-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -100%);
          z-index: 1000;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .center-marker {
          filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
          animation: dropIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .center-shadow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 6px;
          background: rgba(0, 0, 0, 0.22);
          border-radius: 50%;
          z-index: 999;
          pointer-events: none;
        }
        @keyframes dropIn {
          0% { transform: translateY(-16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .leaflet-control-attribution { display: none !important; }
        .gm-style-cc { display: none !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div class="center-shadow"></div>
      <div class="center-marker-container">
        <svg class="center-marker" width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 0C8.059 0 0 8.059 0 18C0 30.75 15.75 46.5 16.46 47.208C17.284 48.031 18.716 48.031 19.54 47.208C20.25 46.5 36 30.75 36 18C36 8.059 27.941 0 18 0Z" fill="#FF4500"/>
          <circle cx="18" cy="18" r="8" fill="#FFFFFF"/>
          <circle cx="18" cy="18" r="4.5" fill="#FF4500"/>
        </svg>
      </div>

      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        var mapType = null;
        var gMap = null;
        var lMap = null;
        var isUserInteracting = false;
        var currentLat = ${latitude};
        var currentLng = ${longitude};
        var currentZoom = ${zoom};
        var mapReady = false;

        function notifyLocation(lat, lng) {
          // Never notify on initial load or programmatic moves. Only notify when user interacted.
          if (!mapReady || !isUserInteracting) return;
          isUserInteracting = false;
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'locationChange',
              latitude: lat,
              longitude: lng
            }));
          }
        }

        function notifyLoaded() {
          if (!mapReady) {
            mapReady = true;
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapLoaded' }));
            }
          }
        }

        // 1. Leaflet with Google Maps direct tiles (Guaranteed 100% visible fallback)
        function initLeafletGoogleTiles() {
          if (lMap || gMap) return;
          mapType = 'leaflet';
          try {
            lMap = L.map('map', {
              zoomControl: true,
              attributionControl: false
            }).setView([currentLat, currentLng], currentZoom);

            // Google Maps authentic vector tile server
            L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
              maxZoom: 20,
              subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
            }).addTo(lMap);

            lMap.on('dragstart', function() {
              isUserInteracting = true;
            });

            lMap.on('moveend', function() {
              if (!isUserInteracting) return;
              var c = lMap.getCenter();
              notifyLocation(c.lat, c.lng);
            });

            lMap.on('click', function(e) {
              isUserInteracting = true;
              lMap.panTo(e.latlng);
            });

            notifyLoaded();
          } catch (e) {
            console.error("Leaflet init error:", e);
          }
        }

        // 2. Google Maps JavaScript API (Primary Engine)
        window.initGoogleMap = function() {
          if (lMap) return; // Already initialized
          mapType = 'google';
          try {
            var center = { lat: currentLat, lng: currentLng };
            gMap = new google.maps.Map(document.getElementById('map'), {
              zoom: currentZoom,
              center: center,
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: 'greedy',
              clickableIcons: false
            });

            gMap.addListener('dragstart', function() {
              isUserInteracting = true;
            });

            gMap.addListener('idle', function() {
              if (!isUserInteracting) return;
              var c = gMap.getCenter();
              notifyLocation(c.lat(), c.lng());
            });

            gMap.addListener('click', function(e) {
              isUserInteracting = true;
              gMap.panTo(e.latLng);
            });

            notifyLoaded();
          } catch (e) {
            console.warn("Google Maps JS API init error, falling back:", e);
            initLeafletGoogleTiles();
          }
        };

        // Google Maps Auth Failure hook
        window.gm_authFailure = function() {
          console.warn("Google Maps Auth Failure, switching to Google tile engine");
          if (!lMap) {
            document.getElementById('map').innerHTML = '';
            initLeafletGoogleTiles();
          }
        };

        // Global pan handler
        window.panToLocation = function(lat, lng) {
          currentLat = lat;
          currentLng = lng;
          isUserInteracting = false;
          if (gMap) {
            gMap.panTo({ lat: lat, lng: lng });
          } else if (lMap) {
            lMap.panTo([lat, lng]);
          }
        };

        // Fallback timer: If Google Maps JS API does not load within 2.5s, launch Google tile engine
        setTimeout(function() {
          if (!mapReady && !gMap) {
            initLeafletGoogleTiles();
          }
        }, 2500);
      </script>

      <!-- Load Google Maps JS API with callback -->
      <script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMap" async defer onerror="initLeafletGoogleTiles()"></script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapLoaded') {
        setIsLoaded(true);
      } else if (data.type === 'locationChange') {
        lastReportedCoords.current = { lat: data.latitude, lng: data.longitude };
        if (onLocationChange) {
          onLocationChange({
            latitude: data.latitude,
            longitude: data.longitude,
          });
        }
      }
    } catch (e) {
      console.error("Error parsing map message:", e);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={{
            uri: `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=600x300&markers=color:red%7C${latitude},${longitude}&key=${apiKey}`
          }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent, baseUrl: 'https://dataudipi.com' }}
        style={StyleSheet.absoluteFill}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        mixedContentMode="always"
      />
      {!isLoaded && (
        <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
          <ActivityIndicator size="large" color="#ff4500" />
          <Text style={styles.loadingText}>Loading Google Maps...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#f1f3f4',
    position: 'relative',
  },
  loadingOverlay: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#ff4500',
  },
});

export default InteractiveGoogleMap;
