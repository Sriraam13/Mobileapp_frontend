import 'react-native-gesture-handler';
import { Slot } from 'expo-router';
import VoiceAgentModal from '../components/VoiceAgentModal';

export default function RootLayout() {
  return (
    <>
      <Slot />
      <VoiceAgentModal />
    </>
  );
}
