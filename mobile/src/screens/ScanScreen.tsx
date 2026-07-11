import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { recognizeText } from '../services/ocrService';
import { analyzeIngredientText } from '../services/ingredientAnalysis';
import { OcrFailureError } from '../types';
import { logger } from '../services/logger';
import { Disclaimer } from '../components/Disclaimer';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export function ScanScreen({ navigation }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const [status, setStatus] = useState<'idle' | 'capturing' | 'reading'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || status !== 'idle') return;
    setErrorMessage(null);
    try {
      setStatus('capturing');
      const photo = await cameraRef.current.takePhoto({ flash: 'auto' });
      setStatus('reading');
      const ocrResult = await recognizeText(`file://${photo.path}`);
      const analysis = analyzeIngredientText(ocrResult.text);
      navigation.navigate('Results', { analysis });
    } catch (err) {
      const message =
        err instanceof OcrFailureError
          ? err.message
          : 'Something went wrong capturing the photo. Please try again.';
      setErrorMessage(message);
      logger.error('Scan capture failed', { error: String(err) });
    } finally {
      setStatus('idle');
    }
  }, [navigation, status]);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>Sprout needs camera access to scan ingredient labels.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>No camera device found on this phone.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={status === 'idle'}
        photo
      />
      <View style={styles.overlay}>
        <View style={styles.frameGuide} />
        <Text style={styles.guideText}>Line up the ingredient list inside the frame</Text>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.bottomBar}>
        <Disclaimer compact />
        <TouchableOpacity
          style={[styles.shutterButton, status !== 'idle' && styles.shutterButtonDisabled]}
          onPress={handleCapture}
          disabled={status !== 'idle'}
          accessibilityLabel="Capture ingredient label"
        >
          {status === 'idle' ? (
            <View style={styles.shutterInner} />
          ) : (
            <ActivityIndicator color="white" />
          )}
        </TouchableOpacity>
        <Text style={styles.statusText}>
          {status === 'capturing' && 'Capturing…'}
          {status === 'reading' && 'Reading label…'}
          {status === 'idle' && 'Tap to scan'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permissionText: { textAlign: 'center', fontSize: 16, color: '#3A3D33' },
  primaryButton: { backgroundColor: '#2F7D5A', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  primaryButtonText: { color: 'white', fontWeight: '600' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameGuide: {
    width: '85%',
    height: 160,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
  },
  guideText: { color: 'white', marginTop: 12, fontSize: 14 },
  errorBanner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(181,67,46,0.95)',
    padding: 12,
    borderRadius: 10,
  },
  errorText: { color: 'white', fontSize: 13 },
  bottomBar: { padding: 16, gap: 12, alignItems: 'center' },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButtonDisabled: { opacity: 0.6 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'white' },
  statusText: { color: 'white', fontSize: 13 },
});
