import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import VoiceAgentModal from '../components/VoiceAgentModal';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Slot />
        <VoiceAgentModal />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
