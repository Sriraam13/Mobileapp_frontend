import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, SafeAreaView, StatusBar, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

const RAZORPAY_KEY = 'rzp_live_T4wysiHzIDwFA1';

export default function RazorpayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { amount, phone, orderType } = params;
  const webViewRef = useRef<WebView>(null);

  const amountInPaise = Math.round(Number(amount) * 100);

  const razorpayHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Razorpay Payment</title>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        body {
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .loading {
          text-align: center;
          color: #666;
          font-size: 16px;
        }
        .loading .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3399cc;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p>Opening Razorpay Checkout...</p>
      </div>
      <script>
        var options = {
          key: '${RAZORPAY_KEY}',
          amount: ${amountInPaise},
          currency: 'INR',
          name: 'Udupi Restaurant',
          description: '${orderType || 'Food'} Order Payment',
          prefill: {
            contact: '${phone || '+919876543210'}'
          },
          theme: {
            color: '#ff3400'
          },
          handler: function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              status: 'success',
              payment_id: response.razorpay_payment_id
            }));
          },
          modal: {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                status: 'cancelled',
                reason: 'Payment modal dismissed by user'
              }));
            }
          }
        };

        try {
          var rzp = new Razorpay(options);
          rzp.on('payment.failed', function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              status: 'failed',
              reason: response.error.description || 'Payment failed'
            }));
          });
          rzp.open();
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            status: 'failed',
            reason: 'Could not initialize Razorpay: ' + e.message
          }));
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.status === 'success') {
        // Go back to payment screen with success params
        router.replace({
          pathname: '/(checkout)/payment',
          params: {
            razorpay_status: 'success',
            razorpay_payment_id: data.payment_id,
          }
        });
      } else if (data.status === 'cancelled') {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(checkout)/payment');
        }
      } else {
        // Failed
        router.replace({
          pathname: '/(checkout)/payment',
          params: {
            razorpay_status: 'failed',
            razorpay_reason: data.reason || 'Payment failed',
          }
        });
      }
    } catch (e) {
      console.error('Failed to parse Razorpay message', e);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(checkout)/payment');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(checkout)/payment');
            }
          }} 
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={styles.secureIndicator}>
          <Ionicons name="lock-closed" size={14} color="#00a01d" />
        </View>
      </View>

      <WebView
        ref={webViewRef}
        source={{ html: razorpayHTML }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          // If the URL is a UPI intent (GPay, PhonePe, Paytm, intent:// etc.), open it natively
          if (
            url.startsWith('upi://') ||
            url.startsWith('tez://') ||
            url.startsWith('phonepe://') ||
            url.startsWith('paytmmp://') ||
            url.startsWith('intent://') ||
            url.startsWith('gpay://') ||
            url.startsWith('paytm://') ||
            url.startsWith('bhim://')
          ) {
            Linking.openURL(url).catch((err) => {
              console.error('Failed to open UPI app', err);
            });
            return false; // Prevent WebView from trying to load it
          }
          return true; // Let WebView handle http/https URLs
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff3400" />
            <Text style={styles.loadingText}>Loading Razorpay...</Text>
          </View>
        )}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  secureIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 15,
    color: '#666',
  },
});
