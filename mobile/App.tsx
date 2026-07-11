import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Disclaimer } from './src/components/Disclaimer';
import { logger } from './src/services/logger';

const LAUNCH_DISCLAIMER_KEY = '@sprout/seen_launch_disclaimer_v1';

export default function App() {
  const [showLaunchDisclaimer, setShowLaunchDisclaimer] = useState(false);

  useEffect(() => {
    logger.configureBackend(process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000');
    AsyncStorage.getItem(LAUNCH_DISCLAIMER_KEY)
      .then((seen) => setShowLaunchDisclaimer(!seen))
      .catch(() => setShowLaunchDisclaimer(true));
  }, []);

  const acknowledge = async () => {
    setShowLaunchDisclaimer(false);
    try {
      await AsyncStorage.setItem(LAUNCH_DISCLAIMER_KEY, 'true');
    } catch (err) {
      logger.warn('Could not persist launch disclaimer acknowledgement', { error: String(err) });
    }
  };

  return (
    <NavigationContainer>
      <RootNavigator />
      <Modal visible={showLaunchDisclaimer} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Before you start</Text>
            <Disclaimer />
            <TouchableOpacity style={styles.modalButton} onPress={acknowledge}>
              <Text style={styles.modalButtonText}>I understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FAF9F4', borderRadius: 14, padding: 20, gap: 14, width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#22261F' },
  modalButton: { backgroundColor: '#2F7D5A', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalButtonText: { color: 'white', fontWeight: '700' },
});
