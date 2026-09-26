import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, SafeAreaView, Platform, StatusBar, Modal, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

export default function CateringEventDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [occasion, setOccasion] = useState('');
  const [guestCount, setGuestCount] = useState('50');
  const [serviceType, setServiceType] = useState('Delivery Only');
  const [address, setAddress] = useState('');
  
  // Google Places Autocomplete state
  const [addressPredictions, setAddressPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);

  // Modals state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('PM');
  
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: ''
  });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ visible: true, title, message });
  };

  const fetchAddressPredictions = async (text: string) => {
    setAddress(text);
    if (text.length > 2) {
      try {
        const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) return;
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${apiKey}`);
        const data = await response.json();
        if (data.status === 'OK') {
          setAddressPredictions(data.predictions);
          setShowPredictions(true);
        } else {
          setAddressPredictions([]);
        }
      } catch (error) {
        console.error("Error fetching address predictions:", error);
      }
    } else {
      setAddressPredictions([]);
      setShowPredictions(false);
    }
  };

  const handleNext = async () => {
    const missingFields = [];
    if (!eventName.trim()) missingFields.push('Event Name');
    if (!date.trim()) missingFields.push('Date');
    if (!time.trim()) missingFields.push('Serving Time');
    if (!occasion.trim()) missingFields.push('Occasion');
    if (!address.trim()) missingFields.push('Delivery Address');

    if (missingFields.length > 0) {
      showAlert('Missing Information', `Please fill in the following missing fields:\n${missingFields.join(', ')}`);
      return;
    }
    
    const guests = parseInt(guestCount, 10);
    if (isNaN(guests) || guests < 50) {
      showAlert('Invalid Guest Count', 'The guest count should be minimum 50.');
      return;
    }

    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        // If API key is missing, we bypass strict validation to prevent blocking the user
        console.warn("No Google Maps API key found, bypassing geocoding validation.");
      } else {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`);
        const data = await response.json();
        
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
          showAlert('Invalid Address', 'The delivery address is incorrect. Please select a valid address from the dropdown or check your spelling.');
          return;
        }
      }
    } catch (e) {
      console.error("Geocoding error:", e);
      showAlert('Invalid Address', 'There was an issue validating the address. Please try again.');
      return;
    }

    // Navigate to next step
    router.push({
      pathname: '/(main)/catering-choose-package',
      params: {
        eventName,
        date: date,
        time: time,
        occasion,
        guestCount: guests.toString(),
        serviceType,
        address
      }
    });
  };

  // Interactive calendar generator
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Month name might need a fallback if toLocaleString doesn't work perfectly in some older JS engines, but standard is fine
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[month];

    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    return (
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.calendarBox}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-back" size={24} color="#111" />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{monthName} {year}</Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-forward" size={24} color="#111" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDays}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <Text key={day} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {blanks.map(b => (
                <View key={`blank-${b}`} style={styles.calendarDay} />
              ))}
              {days.map(d => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const cellDate = new Date(year, month, d);
                const isPast = cellDate < today;

                return (
                  <TouchableOpacity 
                    key={d} 
                    style={[styles.calendarDay, isPast && { opacity: 0.3 }]} 
                    disabled={isPast}
                    onPress={() => {
                      setDate(`${d} ${monthName} ${year}`);
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={styles.calendarDayText}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.alertBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.alertBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderTimePicker = () => {
    return (
      <Modal visible={showTimePicker} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.calendarBox}>
            <Text style={styles.calendarTitle}>Select Time</Text>
            
            <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20}}>
              {/* Hour Selection */}
              <View style={{alignItems: 'center'}}>
                <Text style={{fontSize: 12, color: '#666', marginBottom: 4}}>Hour</Text>
                <TextInput 
                  style={styles.timeInput} 
                  value={selectedHour} 
                  onChangeText={(val) => {
                    let num = parseInt(val);
                    if (num > 12) val = '12';
                    if (num < 1) val = '1';
                    setSelectedHour(val);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <Text style={{fontSize: 24, fontWeight: 'bold', marginHorizontal: 10, marginTop: 15}}>:</Text>
              {/* Minute Selection */}
              <View style={{alignItems: 'center'}}>
                <Text style={{fontSize: 12, color: '#666', marginBottom: 4}}>Minute</Text>
                <TextInput 
                  style={styles.timeInput} 
                  value={selectedMinute} 
                  onChangeText={(val) => {
                    let num = parseInt(val);
                    if (num > 59) val = '59';
                    if (num < 0) val = '00';
                    setSelectedMinute(val);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              
              {/* AM/PM Toggle */}
              <View style={{marginLeft: 20, marginTop: 15}}>
                <TouchableOpacity 
                  style={[styles.ampmBtn, selectedAmPm === 'AM' && styles.ampmBtnActive]}
                  onPress={() => setSelectedAmPm('AM')}
                >
                  <Text style={[styles.ampmText, selectedAmPm === 'AM' && styles.ampmTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.ampmBtn, selectedAmPm === 'PM' && styles.ampmBtnActive, {marginTop: 4}]}
                  onPress={() => setSelectedAmPm('PM')}
                >
                  <Text style={[styles.ampmText, selectedAmPm === 'PM' && styles.ampmTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
              <TouchableOpacity style={[styles.alertBtn, {flex: 1, backgroundColor: '#f0f0f0'}]} onPress={() => setShowTimePicker(false)}>
                <Text style={[styles.alertBtnText, {color: '#333'}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.alertBtn, {flex: 1, backgroundColor: '#ff4500'}]} onPress={() => {
                let h = selectedHour || '12';
                let m = selectedMinute.padStart(2, '0');
                if (m === '0' || m === '00' || !selectedMinute) m = '00';
                setTime(`${h}:${m} ${selectedAmPm}`);
                setShowTimePicker(false);
              }}>
                <Text style={styles.alertBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAlert = () => (
    <Modal visible={alertConfig.visible} transparent animationType="fade">
      <View style={styles.alertOverlay}>
        <View style={styles.alertBox}>
          <View style={[styles.alertIconBg, { backgroundColor: alertConfig.title === 'Success' ? '#e6ffe6' : '#ffe5e0' }]}>
            <Ionicons 
              name={alertConfig.title === 'Success' ? 'checkmark-circle' : 'warning'} 
              size={40} 
              color={alertConfig.title === 'Success' ? '#4CAF50' : '#ff4500'} 
            />
          </View>
          <Text style={styles.alertTitle}>{alertConfig.title}</Text>
          <Text style={styles.alertMessage}>{alertConfig.message}</Text>
          <TouchableOpacity 
            style={[styles.alertBtn, { backgroundColor: alertConfig.title === 'Success' ? '#4CAF50' : '#ff4500' }]} 
            onPress={() => setAlertConfig({ ...alertConfig, visible: false })}
          >
            <Text style={styles.alertBtnText}>Okay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.stepText}>STEP 1 OF 6</Text>
          <Text style={styles.headerTitle}>Event Details</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" style={styles.leafIcon} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        
        {/* Event Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Name <Text style={styles.asterisk}>*</Text></Text>
          <TextInput 
            style={styles.input} 
            value={eventName}
            onChangeText={setEventName}
            placeholder="e.g. Birthday Party"
            placeholderTextColor="#999"
          />
        </View>

        {/* Date and Time Row */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Date <Text style={styles.asterisk}>*</Text></Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowDatePicker(true)}>
              <View style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: date ? '#333' : '#999', fontSize: 14 }}>
                  {date || 'DD MMMM YYYY'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>Serving Time <Text style={styles.asterisk}>*</Text></Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowTimePicker(true)}>
              <View style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: time ? '#333' : '#999', fontSize: 14 }}>
                  {time || 'e.g. 12:30 PM'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Occasion and Guest Count Row */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Occasion <Text style={styles.asterisk}>*</Text></Text>
            <TextInput 
              style={styles.input} 
              value={occasion}
              onChangeText={setOccasion}
              placeholder="e.g. Wedding"
              placeholderTextColor="#999"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>Guest Count (Min 50) <Text style={styles.asterisk}>*</Text></Text>
            <View style={styles.guestCounter}>
              <TextInput
                style={styles.guestInput}
                value={guestCount}
                onChangeText={setGuestCount}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
          </View>
        </View>

        {/* Service Type */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Service Type <Text style={styles.asterisk}>*</Text></Text>
          <View style={styles.segmentControl}>
            <TouchableOpacity 
              style={[styles.segmentBtn, serviceType === 'Delivery Only' && styles.segmentBtnActive]}
              onPress={() => setServiceType('Delivery Only')}
            >
              <Text style={[styles.segmentText, serviceType === 'Delivery Only' && styles.segmentTextActive]}>Delivery Only</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, serviceType === 'Full Service' && styles.segmentBtnActive]}
              onPress={() => setServiceType('Full Service')}
            >
              <Text style={[styles.segmentText, serviceType === 'Full Service' && styles.segmentTextActive]}>Full Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Delivery Address <Text style={styles.asterisk}>*</Text></Text>
          <TextInput 
            style={[styles.input, styles.textArea, showPredictions && addressPredictions.length > 0 && {borderBottomLeftRadius: 0, borderBottomRightRadius: 0}]} 
            value={address}
            onChangeText={fetchAddressPredictions}
            placeholder="Enter full address"
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          {showPredictions && addressPredictions.length > 0 && (
            <View style={styles.predictionsContainer}>
              {addressPredictions.map((prediction, index) => (
                <TouchableOpacity 
                  key={prediction.place_id} 
                  style={[styles.predictionItem, index === addressPredictions.length - 1 && {borderBottomWidth: 0}]}
                  onPress={() => {
                    setAddress(prediction.description);
                    setShowPredictions(false);
                  }}
                >
                  <MaterialCommunityIcons name="map-marker" size={16} color="#666" style={{marginRight: 8}} />
                  <Text style={styles.predictionText}>{prediction.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity style={styles.chooseMenuBtn} onPress={handleNext}>
          <Text style={styles.chooseMenuBtnText}>Choose a Menu</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>

      {renderCalendar()}
      {renderTimePicker()}
      {renderAlert()}
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
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  stepText: {
    fontSize: 10,
    color: '#ff4500',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  leafIcon: {
    marginRight: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
  },
  progressActive: {
    backgroundColor: '#ff4500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 350,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  asterisk: {
    color: '#ff4500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
    minHeight: 46,
  },
  textArea: {
    minHeight: 80,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  guestCounter: {
    borderWidth: 1,
    borderColor: '#ff4500',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    minHeight: 46,
    justifyContent: 'center',
  },
  guestInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff4500',
    padding: 0,
    margin: 0,
  },
  segmentControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#ff4500',
  },
  segmentText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
  },
  predictionsContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#eee',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    maxHeight: 200,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  predictionText: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
  },
  chooseMenuBtn: {
    backgroundColor: '#00a023', // Green color
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  chooseMenuBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Alert Modal Styles matching Data Udipi
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '90%',
    maxWidth: 320,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  alertIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 10,
  },
  alertMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  alertBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  alertBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Calendar Modal Styles
  calendarBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '95%',
    maxWidth: 350,
    padding: 24,
    alignItems: 'center',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  calNavBtn: {
    padding: 8,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  weekDays: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 10,
  },
  weekDayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    fontWeight: 'bold',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    marginBottom: 20,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  calendarDayText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  timeInput: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#f9f9f9',
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  ampmBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  ampmText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  ampmTextActive: {
    color: '#fff',
  }
});
