/**
 * VoiceAgentModal.tsx
 *
 * PHASES 4, 13 — Complete Voice Agent UI
 *
 * Features:
 *   - Floating "Talk to Chef" pill FAB that opens the modal
 *   - Auto-starts the Vapi call when modal opens
 *   - Real-time partial transcript (zero lag)
 *   - Merged final transcript (no split bubbles)
 *   - Mute/unmute toggle
 *   - Stop agent button
 *   - Animated speaking indicator
 *   - Suggestion pills when empty
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Modal,
  Image,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVapiStore } from '../store/vapiStore';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useVoiceAgentStore } from '../store/useVoiceAgentStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SUGGESTIONS = [
  'Show me today\'s menu',
  'Add 2 Masala Dosa to my cart',
  'Show my reward points',
  'Track my current order',
];

export default function VoiceAgentModal() {
  const router = useRouter();
  const {
    setupListeners,
    startCall,
    stopCall,
    isConnected,
    isConnecting,
    messages,
    clearMessages,
    partialUserTranscript,
    partialAgentTranscript,
    isMuted,
    toggleMute,
  } = useVapiStore();

  const { isVisible, showAgent, hideAgent } = useVoiceAgentStore();
  const scrollViewRef = useRef<ScrollView>(null);

  // Pulse animation for speaking indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // We intentionally removed setupListeners from here 
    // so Vapi is not initialized until the user clicks it
  }, []);

  // Start pulse when connected & speaking (agent transcript active)
  useEffect(() => {
    if (isConnected && partialAgentTranscript) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isConnected, partialAgentTranscript]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isVisible && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, partialUserTranscript, partialAgentTranscript, isVisible]);

  const openModal = () => {
    showAgent();
    // Auto-start the Vapi call when the modal opens
    if (!isConnected && !isConnecting) {
      setupListeners(router);
      startCall();
    }
  };

  const closeModal = () => {
    stopCall();
    clearMessages();
    hideAgent();
  };

  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.extractOffset();
        setIsDragging(true);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setIsDragging(false);
      }
    })
  ).current;

  return (
    <>
      {/* Floating pill FAB */}
      {!isVisible && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fabPill,
            isConnected ? styles.fabActive : null,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
            isDragging ? { borderRadius: 30, paddingHorizontal: 8 } : null
          ]}
        >
          <TouchableOpacity
            onPress={openModal}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center' }}
            disabled={isDragging}
          >
            <View style={[styles.fabAvatarBg, isDragging && { marginRight: 0 }]}>
              <Image
                source={require('../../assets/images/chef_mascot.png')}
                style={styles.fabChefMascot}
                resizeMode="cover"
              />
            </View>
            {!isDragging && (
              <View style={styles.fabTextWrapper}>
                <Text style={styles.fabPillTitle}>Talk to Chef</Text>
                <View style={styles.fabPillSubtitleRow}>
                  <Ionicons name="mic" size={12} color="#666" />
                  <Text style={styles.fabPillSubtitle}>
                    {isConnected ? 'Live' : 'Tap to speak'}
                  </Text>
                </View>
              </View>
            )}
            {isConnected && !isDragging && <View style={styles.fabLiveDot} />}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Rich UI Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Data Udipi Assistant</Text>
                <Text style={styles.headerSubtitle}>
                  {isConnecting
                    ? 'Connecting...'
                    : isConnected
                    ? '● Live'
                    : 'Tap below to speak'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Avatar Section */}
            <View style={styles.avatarContainer}>
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
              <Image
                source={require('../../assets/images/chef_mascot.png')}
                style={styles.chefAvatar}
                resizeMode="contain"
              />
              <View style={[styles.statusBadge, isConnected ? styles.statusBadgeActive : null]}>
                <FontAwesome5
                  name={isConnected ? 'microphone' : 'user-tie'}
                  size={11}
                  color="white"
                />
              </View>
            </View>

            {/* Chat Body */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatBody}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 && !partialAgentTranscript && !partialUserTranscript ? (
                /* Empty State */
                <View style={styles.emptyState}>
                  <Text style={styles.greetingTitle}>
                    {isConnecting ? 'Connecting…' : isConnected ? 'Listening…' : 'Hi! I\'m your Voice Agent.'}
                  </Text>
                  <Text style={styles.greetingSubtitle}>How can I help you today?</Text>
                  <View style={styles.suggestionsContainer}>
                    {SUGGESTIONS.map((sug, idx) => (
                      <View key={idx} style={styles.suggestionPill}>
                        <FontAwesome5 name="lightbulb" size={13} color="#ff4500" style={{ marginRight: 8 }} />
                        <Text style={styles.suggestionText}>{sug}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                /* Message List */
                <View style={styles.messageList}>
                  {messages.map((msg, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.messageWrapper,
                        msg.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAgent,
                      ]}
                    >
                      {msg.role !== 'user' && (
                        <View style={styles.smallAvatar}>
                          <Image
                            source={require('../../assets/images/chef_mascot.png')}
                            style={styles.tinyChef}
                          />
                        </View>
                      )}
                      <View
                        style={[
                          styles.messageBubble,
                          msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleAgent,
                        ]}
                      >
                        <Text
                          style={[
                            styles.messageText,
                            msg.role === 'user' ? styles.messageTextUser : styles.messageTextAgent,
                          ]}
                        >
                          {msg.text}
                        </Text>
                      </View>
                      {msg.role === 'user' && (
                        <View style={styles.smallAvatarUser}>
                          <FontAwesome5 name="user" size={14} color="white" />
                        </View>
                      )}
                    </View>
                  ))}

                  {/* Partial Agent Bubble — shown in real-time, no lag */}
                  {partialAgentTranscript ? (
                    <View style={[styles.messageWrapper, styles.messageWrapperAgent]}>
                      <View style={styles.smallAvatar}>
                        <Image
                          source={require('../../assets/images/chef_mascot.png')}
                          style={styles.tinyChef}
                        />
                      </View>
                      <View style={[styles.messageBubble, styles.messageBubbleAgent]}>
                        <Text style={[styles.messageText, styles.messageTextAgent, { opacity: 0.75 }]}>
                          {partialAgentTranscript}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Partial User Bubble — shown while user is speaking */}
                  {partialUserTranscript ? (
                    <View style={[styles.messageWrapper, styles.messageWrapperUser]}>
                      <View style={[styles.messageBubble, styles.messageBubbleUser]}>
                        <Text style={[styles.messageText, styles.messageTextUser, { opacity: 0.75 }]}>
                          {partialUserTranscript}
                        </Text>
                      </View>
                      <View style={styles.smallAvatarUser}>
                        <FontAwesome5 name="user" size={14} color="white" />
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>

            {/* Footer Controls */}
            <View style={styles.footer}>
              {!isConnected ? (
                <TouchableOpacity
                  style={[styles.startButton, isConnecting && styles.startButtonConnecting]}
                  onPress={startCall}
                  disabled={isConnecting}
                  activeOpacity={0.85}
                >
                  <Ionicons name="mic" size={22} color="white" style={{ marginRight: 10 }} />
                  <Text style={styles.startButtonText}>
                    {isConnecting ? 'Connecting…' : 'Start Speaking'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.activeControlsContainer}>
                  {/* Mute / Unmute */}
                  <TouchableOpacity
                    style={[styles.muteButton, isMuted ? styles.muteButtonActive : null]}
                    onPress={toggleMute}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isMuted ? 'mic-off' : 'mic'}
                      size={22}
                      color={isMuted ? 'white' : '#333'}
                    />
                    <Text style={[styles.muteLabel, isMuted && { color: 'white' }]}>
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Text>
                  </TouchableOpacity>

                  {/* Stop Agent */}
                  <TouchableOpacity style={styles.stopButton} onPress={closeModal} activeOpacity={0.85}>
                    <Ionicons name="stop-circle" size={22} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.stopButtonText}>Stop Agent</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabPill: {
    position: 'absolute',
    bottom: 130,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 4.65,
    zIndex: 9999,
  },
  fabActive: {
    backgroundColor: '#ffe8e8',
    borderColor: '#ff4500',
    borderWidth: 1.5,
  },
  fabAvatarBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  fabChefMascot: {
    width: 36,
    height: 36,
    marginTop: 6,
  },
  fabTextWrapper: {
    justifyContent: 'center',
    paddingRight: 8,
  },
  fabPillTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  fabPillSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  fabPillSubtitle: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  fabLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dc143c',
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: SCREEN_HEIGHT * 0.88,
    paddingTop: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#dc143c',
    fontWeight: '500',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#efefef',
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 14,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 69, 0, 0.08)',
  },
  chefAvatar: {
    width: 130,
    height: 130,
    zIndex: 2,
  },
  statusBadge: {
    backgroundColor: '#aaa',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    zIndex: 3,
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusBadgeActive: {
    backgroundColor: '#dc143c',
  },
  chatBody: {
    flex: 1,
    paddingHorizontal: 18,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 10,
  },
  greetingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
    textAlign: 'center',
  },
  suggestionsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 24,
    marginBottom: 10,
    width: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  suggestionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  messageList: {
    paddingTop: 8,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
    width: '100%',
  },
  messageWrapperUser: {
    justifyContent: 'flex-end',
  },
  messageWrapperAgent: {
    justifyContent: 'flex-start',
  },
  smallAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
    elevation: 1,
  },
  tinyChef: {
    width: 26,
    height: 26,
  },
  smallAvatarUser: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  messageBubble: {
    maxWidth: '76%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleUser: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderBottomRightRadius: 4,
  },
  messageBubbleAgent: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#222',
  },
  messageTextAgent: {
    color: '#111',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4500',
    borderRadius: 28,
    paddingVertical: 15,
  },
  startButtonConnecting: {
    backgroundColor: '#ccc',
  },
  startButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  activeControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 110,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e8e8e8',
    gap: 6,
  },
  muteButtonActive: {
    backgroundColor: '#555',
  },
  muteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  stopButton: {
    flex: 1,
    height: 52,
    backgroundColor: '#dc143c',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
