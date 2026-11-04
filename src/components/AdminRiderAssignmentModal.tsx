import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { deliveryApi } from '../services/apiService';

interface AdminRiderAssignmentModalProps {
  visible: boolean;
  orderId: number | string;
  currentStatus?: string;
  initialDetails?: {
    partner?: string;
    rider_name?: string;
    rider_phone?: string;
    vehicle_type?: string;
    vehicle_number?: string;
    eta?: string;
    tracking_url?: string;
    otp?: string;
  } | null;
  onClose: () => void;
  onSuccess: (updatedData: any) => void;
}

const PARTNERS = ['Rapido', 'Dunzo', 'Other'];

export default function AdminRiderAssignmentModal({
  visible,
  orderId,
  currentStatus = 'READY',
  initialDetails,
  onClose,
  onSuccess,
}: AdminRiderAssignmentModalProps) {
  const [partner, setPartner] = useState<string>('Rapido');
  const [customPartner, setCustomPartner] = useState<string>('');
  const [riderName, setRiderName] = useState<string>('');
  const [riderPhone, setRiderPhone] = useState<string>('');
  const [vehicleType, setVehicleType] = useState<string>('Bike');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [eta, setEta] = useState<string>('25 mins');
  const [trackingUrl, setTrackingUrl] = useState<string>('');
  const [otp, setOtp] = useState<string>('4821');
  
  const [saving, setSaving] = useState(false);
  const [advancingStatus, setAdvancingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorMsg(null);
      if (initialDetails) {
        const p = initialDetails.partner || 'Rapido';
        if (PARTNERS.includes(p)) {
          setPartner(p);
          setCustomPartner('');
        } else {
          setPartner('Other');
          setCustomPartner(p);
        }
        setRiderName(initialDetails.rider_name || '');
        setRiderPhone(initialDetails.rider_phone || '');
        setVehicleType(initialDetails.vehicle_type || 'Bike');
        setVehicleNumber(initialDetails.vehicle_number || '');
        setEta(initialDetails.eta || '25 mins');
        setTrackingUrl(initialDetails.tracking_url || '');
        if (initialDetails.otp) setOtp(initialDetails.otp);
      } else {
        // Fetch existing assignment if available
        const cleanId = String(orderId).replace(/\D/g, '') || String(orderId);
        deliveryApi.getDeliveryAssignment(cleanId)
          .then((res: any) => {
            if (res) {
              const p = res.delivery_partner || 'Rapido';
              if (PARTNERS.includes(p)) {
                setPartner(p);
                setCustomPartner('');
              } else {
                setPartner('Other');
                setCustomPartner(p);
              }
              if (res.rider) {
                setRiderName(res.rider.name || '');
                setRiderPhone(res.rider.phone || '');
                setVehicleType(res.rider.vehicle_type || 'Bike');
                setVehicleNumber(res.rider.vehicle_number || '');
              }
              if (res.estimated_delivery_time) setEta(res.estimated_delivery_time);
              if (res.tracking_url) setTrackingUrl(res.tracking_url);
              if (res.otp) setOtp(res.otp);
            }
          })
          .catch(() => {
            // No assignment yet, defaults are fine
          });
      }
    }
  }, [visible, orderId, initialDetails]);

  const validateInputs = () => {
    const selectedPartner = partner === 'Other' ? customPartner.trim() : partner;
    if (!selectedPartner) {
      setErrorMsg('Please select or specify a delivery partner.');
      return false;
    }
    if (!riderName.trim()) {
      setErrorMsg('Rider name is required.');
      return false;
    }
    const cleanDigits = riderPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit rider phone number.');
      return false;
    }
    if (trackingUrl.trim() && !trackingUrl.trim().startsWith('http')) {
      setErrorMsg('External tracking URL must start with http:// or https://');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleSaveAssignment = async () => {
    if (!validateInputs()) return;

    const cleanId = String(orderId).replace(/\D/g, '') || String(orderId);
    const selectedPartner = partner === 'Other' ? customPartner.trim() : partner;
    const cleanDigits = riderPhone.replace(/\D/g, '');

    try {
      setSaving(true);
      setErrorMsg(null);

      const payload = {
        partner: selectedPartner,
        rider_name: riderName.trim(),
        rider_phone: cleanDigits.slice(-10),
        vehicle_type: vehicleType.trim() || 'Bike',
        vehicle_number: vehicleNumber.trim() || undefined,
        eta: eta.trim() || undefined,
        tracking_url: trackingUrl.trim() || undefined,
        otp: otp.trim() || '4821',
      };

      const result = await deliveryApi.assignThirdPartyPartner(cleanId, payload);
      Alert.alert(
        'Rider Assigned',
        `Assigned ${selectedPartner} rider "${riderName}" to order. Status moved to Out for Delivery.`,
        [{ text: 'OK', onPress: () => {
          onSuccess(result);
          onClose();
        }}]
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save rider assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceStatus = async (targetStatus: string) => {
    const cleanId = String(orderId).replace(/\D/g, '') || String(orderId);
    try {
      setAdvancingStatus(true);
      setErrorMsg(null);
      const res = await deliveryApi.updateOrderStatus(cleanId, targetStatus);
      Alert.alert('Status Updated', `Order status updated to ${targetStatus}`);
      onSuccess(res);
    } catch (err: any) {
      setErrorMsg(err.message || `Failed to update status to ${targetStatus}`);
    } finally {
      setAdvancingStatus(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN / DISPATCH</Text>
              </View>
              <Text style={styles.modalTitle}>Third-Party Rider Assignment</Text>
              <Text style={styles.modalSubtitle}>Order #{orderId}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#555" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            {/* Quick Status Workflow Controller for Testing */}
            <View style={styles.workflowSection}>
              <Text style={styles.sectionLabel}>Kitchen & Delivery Preparation Stage</Text>
              <View style={styles.statusButtonsRow}>
                <TouchableOpacity
                  style={[styles.statusPill, currentStatus === 'PREPARING' && styles.statusPillActive]}
                  onPress={() => handleAdvanceStatus('PREPARING')}
                  disabled={advancingStatus}
                >
                  <Text style={[styles.statusPillText, currentStatus === 'PREPARING' && styles.statusPillTextActive]}>
                    Preparing
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.statusPill, currentStatus === 'READY' && styles.statusPillActive]}
                  onPress={() => handleAdvanceStatus('READY')}
                  disabled={advancingStatus}
                >
                  <Text style={[styles.statusPillText, currentStatus === 'READY' && styles.statusPillTextActive]}>
                    Ready
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.statusPill, (currentStatus === 'OUT_FOR_DELIVERY' || currentStatus === 'PICKED_UP') && styles.statusPillActiveGreen]}
                  onPress={() => handleAdvanceStatus('OUT_FOR_DELIVERY')}
                  disabled={advancingStatus}
                >
                  <Text style={[styles.statusPillText, (currentStatus === 'OUT_FOR_DELIVERY' || currentStatus === 'PICKED_UP') && styles.statusPillTextActive]}>
                    Out for Delivery
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.statusPill, currentStatus === 'DELIVERED' && styles.statusPillActiveGreen]}
                  onPress={() => handleAdvanceStatus('DELIVERED')}
                  disabled={advancingStatus}
                >
                  <Text style={[styles.statusPillText, currentStatus === 'DELIVERED' && styles.statusPillTextActive]}>
                    Delivered
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* 1. Partner Selection */}
            <Text style={styles.inputLabel}>
              Delivery Partner <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.partnerRow}>
              {PARTNERS.map((p) => {
                const isSelected = partner === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.partnerCard, isSelected && styles.partnerCardSelected]}
                    onPress={() => setPartner(p)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={p === 'Rapido' ? 'bicycle' : p === 'Dunzo' ? 'flash' : 'cube-outline'}
                      size={20}
                      color={isSelected ? '#FF3400' : '#666'}
                    />
                    <Text style={[styles.partnerText, isSelected && styles.partnerTextSelected]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {partner === 'Other' && (
              <View style={styles.inputWrap}>
                <Text style={styles.inputSubLabel}>Specify Partner Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Porter, Shadowfax, In-house"
                  value={customPartner}
                  onChangeText={setCustomPartner}
                />
              </View>
            )}

            {/* 2. Rider Name */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>
                Rider Name <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Suresh Kumar"
                value={riderName}
                onChangeText={setRiderName}
              />
            </View>

            {/* 3. Rider Phone */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>
                Rider Phone Number <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile number"
                value={riderPhone}
                onChangeText={setRiderPhone}
                keyboardType="phone-pad"
                maxLength={14}
              />
            </View>

            {/* 4. Vehicle Type & Vehicle Number Row */}
            <View style={styles.twoColRow}>
              <View style={[styles.inputWrap, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Vehicle Type</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Bike, Scooter"
                  value={vehicleType}
                  onChangeText={setVehicleType}
                />
              </View>

              <View style={[styles.inputWrap, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Vehicle Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. TN 09 AB 1234"
                  value={vehicleNumber}
                  onChangeText={setVehicleNumber}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* 5. Estimated Arrival Time (ETA) */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Estimated Time of Arrival (ETA)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 25 mins or 15:45"
                value={eta}
                onChangeText={setEta}
              />
            </View>

            {/* 5B. Delivery OTP (Sent to Customer App) */}
            <View style={styles.inputWrap}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.inputLabel}>
                  Delivery OTP (Sent to Customer App) <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TouchableOpacity onPress={() => setOtp(Math.floor(1000 + Math.random() * 9000).toString())}>
                  <Text style={{ fontSize: 12, color: '#ff3400', fontWeight: '700' }}>⚡ Generate Random</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.textInput, { letterSpacing: 4, fontWeight: '700', fontSize: 16 }]}
                placeholder="4-digit OTP (e.g. 4821)"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                Supervisor provides this OTP to send to the customer via the app. The rider will ask for this code at delivery.
              </Text>
            </View>

            {/* 6. External Tracking URL */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>External Live Tracking URL (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://track.rapido.bike/..."
                value={trackingUrl}
                onChangeText={setTrackingUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            {/* Submit Action */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSaveAssignment}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Save & Set Out for Delivery</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flex: 1,
  },
  adminBadge: {
    backgroundColor: '#fff2ed',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ffd5cc',
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ff3400',
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  formScroll: {
    padding: 20,
  },
  workflowSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  statusPillActiveGreen: {
    backgroundColor: '#00a01d',
    borderColor: '#00a01d',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusPillTextActive: {
    color: '#fff',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputSubLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  requiredStar: {
    color: '#DC2626',
  },
  partnerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  partnerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  partnerCardSelected: {
    backgroundColor: '#FFF5F2',
    borderColor: '#FF3400',
  },
  partnerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  partnerTextSelected: {
    color: '#FF3400',
    fontWeight: '700',
  },
  inputWrap: {
    marginBottom: 14,
  },
  twoColRow: {
    flexDirection: 'row',
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: '#00a01d',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#00a01d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled: {
    backgroundColor: '#86efac',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
