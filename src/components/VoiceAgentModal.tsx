import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, Animated, Easing, ScrollView, TextInput, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { DeviceEventEmitter } from 'react-native';

import { useVoiceAgentStore } from '../store/useVoiceAgentStore';
import { useAuthStore } from '../store/useAuthStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useCartStore } from '../store/useCartStore';
import { mobileAgentApi } from '../services/mobileAgentService';
import { executeMobileAgentActions } from '../utils/mobileAgentActionDispatcher';
import { usePathname } from 'expo-router';

const { width, height } = Dimensions.get('window');

const AudioWaveform = () => {
  const bars = Array.from({ length: 24 }).map((_, i) => useRef(new Animated.Value(0.2)).current);

  useEffect(() => {
    const animations = bars.map((anim, index) => {
      const delay = index * 50;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: Math.random() * 0.8 + 0.2,
            duration: 400 + Math.random() * 200,
            delay,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 400 + Math.random() * 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    });

    Animated.stagger(50, animations).start();

    return () => {
      animations.forEach(a => a.stop());
    };
  }, []);

  return (
    <View style={styles.waveformContainer}>
      {bars.map((anim, index) => {
        const heightMultiplier = 1 - Math.abs(index - 12) / 12; // Taller in the middle
        return (
          <Animated.View
            key={index}
            style={[
              styles.waveBar,
              {
                transform: [{ scaleY: Animated.multiply(anim, heightMultiplier * 3) }],
                opacity: 0.6,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

export default function VoiceAgentModal() {
  const insets = useSafeAreaInsets();
  const { isVisible, hideAgent, agentState, setAgentState, messages, addMessage, clearMessages } = useVoiceAgentStore();
  const [inputText, setInputText] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [sound, setSound] = useState<Audio.Sound | undefined>();
  
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { selectedRestaurantId } = useRestaurantStore();
  const { items, orderType } = useCartStore();

  const scrollViewRef = useRef<ScrollView>(null);

  // Stop recording or playing when unmounting or hiding
  useEffect(() => {
    if (!isVisible) {
      if (recording) {
        recording.stopAndUnloadAsync().catch(console.error);
        setRecording(undefined);
      }
      if (sound) {
        sound.stopAsync().catch(console.error);
        setSound(undefined);
      }
    }
  }, [isVisible]);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  useEffect(() => {
    const signupSub = DeviceEventEmitter.addListener('start_signup_voice', () => {
      sendToAgent('Initiate signup greeting');
    });
    return () => {
      signupSub.remove();
    };
  }, []);

  const sendToAgent = async (text: string, audioBase64?: string) => {
    if (text) addMessage({ sender: 'user', text });
    else if (audioBase64) addMessage({ sender: 'user', text: '(Voice message)' });
    
    setAgentState('PROCESSING');
    
    try {
      const routeName = pathname ? pathname.split('/').pop() || 'home' : 'home';
      const payload = {
        message: text,
        audio_base64: audioBase64,
        customer_id: user?.id,
        phone: user?.phone,
        restaurant_id: selectedRestaurantId,
        screen: { route: pathname || '/', name: routeName },
        app_context: { order_type: orderType },
        cart: Object.values(items || {}),
        chat_history: messages.slice(-5).map(m => ({ role: m.sender, text: m.text }))
      };

      const response = await mobileAgentApi.chat(payload);
      
      addMessage({ sender: 'agent', text: response.assistant_text });
      
      if (response.ui_actions && response.ui_actions.length > 0) {
        executeMobileAgentActions(response.ui_actions);
      }
      
      if (response.audio_base64) {
        setAgentState('SPEAKING');
        const uri = `data:audio/mp3;base64,${response.audio_base64}`;
        const { sound: newSound } = await Audio.Sound.createAsync({ uri });
        setSound(newSound);
        await newSound.playAsync();
        
        newSound.setOnPlaybackStatusUpdate((status: any) => {
           if (status.didJustFinish) {
              setAgentState('IDLE');
              // Automatically listen again if hands-free is enabled (optional to implement full continuous loop)
           }
        });
      } else {
        setAgentState('IDLE');
      }

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (e) {
      console.error(e);
      addMessage({ sender: 'agent', text: 'Sorry, I encountered an error communicating with the server.' });
      setAgentState('ERROR');
    }
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    sendToAgent(text);
  };

  const startRecording = async () => {
    try {
      if (sound) await sound.stopAsync();
      
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setAgentState('LISTENING');
    } catch (err) {
      console.error('Failed to start recording', err);
      setAgentState('ERROR');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setAgentState('PROCESSING');
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(undefined);
      
      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        await sendToAgent('', base64);
      } else {
        setAgentState('IDLE');
      }
    } catch (e) {
      console.error(e);
      setAgentState('ERROR');
    }
  };

  const toggleRecording = () => {
    if (agentState === 'LISTENING') {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSuggestion = (prompt: string) => {
    sendToAgent(prompt);
  };

  const renderSuggestions = () => (
    <View style={styles.suggestionsContainer}>
      {['Show me popular items', 'Add 2 Masala Dosa to my cart', "What are today's specials?", 'Track my delivery'].map((prompt, idx) => (
        <TouchableOpacity key={idx} style={styles.suggestionPill} onPress={() => handleSuggestion(prompt)}>
          <View style={styles.suggestionIconWrapper}>
            <Ionicons name="person-circle" size={16} color="#ff3400" />
          </View>
          <Text style={styles.suggestionText}>{prompt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderChat = () => (
    <ScrollView 
      ref={scrollViewRef}
      style={styles.chatScroll} 
      contentContainerStyle={styles.chatScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.agentGreetingRow}>
        <Image source={require('../../assets/images/chef_mascot.png')} style={styles.chatAvatar} resizeMode="contain" />
        <View style={styles.agentBubble}>
          <Text style={styles.agentBubbleText}>Hello, how can I help you today?</Text>
        </View>
      </View>

      {messages.map((msg) => (
        <View key={msg.id} style={msg.sender === 'user' ? styles.userRow : styles.agentRow}>
          {msg.sender === 'agent' && (
            <Image source={require('../../assets/images/chef_mascot.png')} style={styles.chatAvatar} resizeMode="contain" />
          )}
          
          <View style={msg.sender === 'user' ? styles.userBubbleWrapper : styles.agentBubbleWrapper}>
            {msg.sender === 'user' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <View style={styles.userBubble}>
                  <Text style={styles.userBubbleText}>{msg.text}</Text>
                </View>
                <View style={styles.userAvatar}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
              </View>
            ) : (
              <View style={styles.agentBubbleContent}>
                {msg.text && <Text style={styles.agentBubbleText}>{msg.text}</Text>}
              </View>
            )}
          </View>
        </View>
      ))}
      
      {agentState === 'PROCESSING' && (
        <View style={styles.agentRow}>
          <Image source={require('../../assets/images/chef_mascot.png')} style={styles.chatAvatar} resizeMode="contain" />
          <View style={styles.agentBubble}>
             <Text style={styles.agentBubbleText}>...</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={hideAgent}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.container}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Voice Assistant</Text>
            <TouchableOpacity onPress={hideAgent} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Mascot & Visualizer */}
            <View style={[styles.mascotSection, messages.length > 0 && styles.mascotSectionCompact]}>
              <View style={styles.mascotWrapper}>
                {(agentState === 'LISTENING' || agentState === 'SPEAKING') && <AudioWaveform />}
                <Image source={require('../../assets/images/chef_mascot.png')} style={styles.mascotImg} resizeMode="contain" />
              </View>
              
              <View style={[styles.badgeUnderMascot, { backgroundColor: agentState === 'LISTENING' ? '#ff3400' : '#00a01d' }]}>
                <Text style={styles.badgeUnderMascotText}>
                  {agentState === 'LISTENING' ? 'Listening...' : 
                   agentState === 'PROCESSING' ? 'Processing...' : 
                   agentState === 'SPEAKING' ? 'Speaking...' : 'Ready'}
                </Text>
              </View>
            </View>

            {/* Dynamic Content */}
            {messages.length === 0 ? renderSuggestions() : renderChat()}
          </View>

          {/* Footer / Input */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Type your message..."
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSendText}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.micBtn} onPress={toggleRecording}>
                <Ionicons name={agentState === 'LISTENING' ? 'stop-circle' : 'mic'} size={24} color={agentState === 'LISTENING' ? '#ff3400' : '#999'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '92%', paddingHorizontal: 20, display: 'flex', flexDirection: 'column' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  closeBtn: { padding: 4 },
  mascotSection: { alignItems: 'center', marginBottom: 20, position: 'relative', height: 180, justifyContent: 'center' },
  mascotSectionCompact: { height: 140, marginBottom: 10 },
  mascotWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  mascotImg: { width: 140, height: 140, zIndex: 10 },
  waveformContainer: { position: 'absolute', width: '120%', height: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 1 },
  waveBar: { width: 3, height: 20, backgroundColor: '#e0e0e0', borderRadius: 2 },
  badgeUnderMascot: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 16 },
  badgeUnderMascotText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  body: { flex: 1 },
  suggestionsContainer: { width: '100%', gap: 12, paddingTop: 20 },
  suggestionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16, alignSelf: 'flex-start' },
  suggestionIconWrapper: { marginRight: 10 },
  suggestionText: { fontSize: 14, color: '#333', fontWeight: '500' },
  chatScroll: { width: '100%', flex: 1 },
  chatScrollContent: { paddingVertical: 10, gap: 16 },
  agentGreetingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5' },
  agentBubble: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee', maxWidth: '80%' },
  agentBubbleContent: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  agentBubbleText: { fontSize: 14, color: '#333' },
  userRow: { alignItems: 'flex-end', width: '100%' },
  agentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '100%' },
  userBubbleWrapper: { maxWidth: '85%' },
  agentBubbleWrapper: { maxWidth: '85%' },
  userBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 12, marginRight: 8 },
  userBubbleText: { fontSize: 14, color: '#333' },
  userAvatar: { backgroundColor: '#ff3400', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 16 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ff6b4a', borderRadius: 25, paddingHorizontal: 16, height: 50, backgroundColor: '#fafafa' },
  input: { flex: 1, fontSize: 14, color: '#333' },
  micBtn: { padding: 8 },
});
