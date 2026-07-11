import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { AlternativeProduct } from '../types';
import { findAlternatives, guessCategoryTag, mapIsoCountryToOffTag } from '../services/alternativesService';
import { RiskBadge } from '../components/RiskBadge';
import { logger } from '../services/logger';

type Props = NativeStackScreenProps<RootStackParamList, 'Alternatives'>;
type LoadState = 'loading' | 'no_location' | 'unsupported_region' | 'ready' | 'error';

export function AlternativesScreen({ route }: Props) {
  const { analysis } = route.params;
  const [state, setState] = useState<LoadState>('loading');
  const [alternatives, setAlternatives] = useState<AlternativeProduct[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setState('no_location');
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const countryTag = mapIsoCountryToOffTag(place?.isoCountryCode);
        if (!countryTag) {
          if (!cancelled) setState('unsupported_region');
          return;
        }
        const categoryTag = guessCategoryTag(analysis.productName);
        const results = await findAlternatives({ scannedAnalysis: analysis, categoryTag, countryTag });
        if (!cancelled) {
          setAlternatives(results);
          setState('ready');
        }
      } catch (err) {
        logger.error('Loading alternatives failed', { error: String(err) });
        if (!cancelled) setState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [analysis]);

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.infoText}>Finding alternatives near you…</Text>
      </View>
    );
  }

  if (state === 'no_location') {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>
          Turn on location access to see alternatives commonly available in your region.
        </Text>
      </View>
    );
  }

  if (state === 'unsupported_region') {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>
          We don't yet have regional alternative data for your area. This feature currently covers a limited
          set of countries.
        </Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Couldn't load alternatives right now. Please try again later.</Text>
      </View>
    );
  }

  if (alternatives.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>No better-scoring alternatives found in this category for your region yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.disclaimer}>
        Commonly available in your region based on catalog data — not a guarantee of in-stock availability at a
        specific store.
      </Text>
      {alternatives.map((alt) => (
        <View key={alt.code} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{alt.productName}</Text>
            <RiskBadge tier={alt.overallRiskTier} size="small" />
          </View>
          {alt.reasons.map((reason, idx) => (
            <Text key={idx} style={styles.reason}>
              • {reason}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F4' },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  infoText: { textAlign: 'center', color: '#5B6058', fontSize: 14 },
  disclaimer: { fontSize: 12, color: '#8A8F86', marginBottom: 4 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: '#EEEBDD' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#22261F', flexShrink: 1, marginRight: 8 },
  reason: { fontSize: 13, color: '#5B6058' },
});
