import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlertStore, CustomAlertType, CustomAlertButton } from '../../store/useAlertStore';

// Monkey-patch Alert.alert at module load time so any Alert.alert throughout the app
// immediately renders with Data Udipi branding and styling
if (typeof Alert !== 'undefined' && Alert.alert && !(Alert as any).__isCustomDataUdipiAlert) {
  (Alert as any)._originalAlert = Alert.alert;
  (Alert as any).__isCustomDataUdipiAlert = true;
  Alert.alert = (alertTitle: string, alertMessage?: string, alertButtons?: any) => {
    useAlertStore.getState().showAlert(alertTitle, alertMessage, alertButtons);
  };
}

export default function CustomAlertModal() {
  const { visible, title, message, type, buttons, hideAlert, showAlert } = useAlertStore();

  useEffect(() => {
    if (typeof Alert !== 'undefined' && Alert.alert && !(Alert as any).__isCustomDataUdipiAlert) {
      (Alert as any)._originalAlert = Alert.alert;
      (Alert as any).__isCustomDataUdipiAlert = true;
      Alert.alert = (alertTitle: string, alertMessage?: string, alertButtons?: any) => {
        showAlert(alertTitle, alertMessage, alertButtons);
      };
    }
  }, [showAlert]);

  const [scaleAnim] = React.useState(() => new Animated.Value(0.9));
  const [opacityAnim] = React.useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible) return null;

  const handleButtonPress = (btn: CustomAlertButton) => {
    hideAlert();
    if (btn.onPress) {
      btn.onPress();
    }
  };

  // Theming by alert type (Data Udipi Application Color Scheme)
  const getTheme = (alertType: CustomAlertType, alertTitle: string) => {
    const isReorder = alertTitle.toLowerCase().includes('reorder');
    if (isReorder) {
      return {
        iconName: 'bag-check',
        iconColor: '#ff5a1f',
        iconBg: '#fff7ed',
        iconBorder: '#fed7aa',
        primaryBtnBg: '#ff5a1f',
      };
    }

    switch (alertType) {
      case 'success':
        return {
          iconName: 'checkmark-circle',
          iconColor: '#16a34a',
          iconBg: '#f0fdf4',
          iconBorder: '#bbf7d0',
          primaryBtnBg: '#16a34a',
        };
      case 'error':
        return {
          iconName: 'alert-circle',
          iconColor: '#dc2626',
          iconBg: '#fef2f2',
          iconBorder: '#fecaca',
          primaryBtnBg: '#dc2626',
        };
      case 'warning':
        return {
          iconName: 'warning',
          iconColor: '#d97706',
          iconBg: '#fffbeb',
          iconBorder: '#fde68a',
          primaryBtnBg: '#ff5a1f',
        };
      case 'info':
      default:
        return {
          iconName: 'restaurant',
          iconColor: '#ff5a1f',
          iconBg: '#fff7ed',
          iconBorder: '#fed7aa',
          primaryBtnBg: '#ff5a1f',
        };
    }
  };

  const theme = getTheme(type, title);
  const isMultiButton = buttons.length > 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={hideAlert}
    >
      <Pressable style={styles.backdrop} onPress={hideAlert}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
            {/* Top Icon Badge */}
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.iconBg, borderColor: theme.iconBorder },
              ]}
            >
              <Ionicons name={theme.iconName as any} size={34} color={theme.iconColor} />
            </View>

            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Message */}
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {/* Buttons */}
            <View style={[styles.buttonRow, isMultiButton && styles.buttonRowMulti]}>
              {buttons.map((btn, index) => {
                const isCancel = btn.style === 'cancel' || btn.text?.toLowerCase() === 'cancel' || btn.text?.toLowerCase() === 'no';
                const isDestructive = btn.style === 'destructive';

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.btn,
                      isCancel
                        ? styles.btnCancel
                        : [
                            styles.btnPrimary,
                            {
                              backgroundColor: isDestructive ? '#dc2626' : theme.primaryBtnBg,
                            },
                          ],
                      isMultiButton && { flex: 1 },
                    ]}
                    onPress={() => handleButtonPress(btn)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        isCancel ? styles.btnTextCancel : styles.btnTextPrimary,
                      ]}
                      numberOfLines={1}
                    >
                      {btn.text || 'OK'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  buttonRowMulti: {
    justifyContent: 'space-between',
  },
  btn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    minWidth: 120,
  },
  btnPrimary: {
    shadowColor: '#ff5a1f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnCancel: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  btnTextPrimary: {
    color: '#ffffff',
  },
  btnTextCancel: {
    color: '#4b5563',
  },
});
