import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { SavedProduct } from '../types';
import { ProductStorageService } from '../services/storage';
import { RiskBadge } from '../components/RiskBadge';
import { logger } from '../services/logger';

const storageService = new ProductStorageService();
const MAX_COMPARE = 5;

export function ComparisonScreen() {
  const [saved, setSaved] = useState<SavedProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const products = await storageService.getAll();
      setSaved(products);
      setSelectedIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
    } catch (err) {
      logger.error('Loading saved products failed', { error: String(err) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const handleRemove = async (id: string) => {
    await storageService.remove(id);
    load();
  };

  if (saved.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>No saved products yet. Save a scan from the results screen to compare it here.</Text>
      </View>
    );
  }

  const selected = saved.filter((p) => selectedIds.includes(p.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Select up to {MAX_COMPARE} to compare</Text>
      {saved.map((product) => {
        const isSelected = selectedIds.includes(product.id);
        return (
          <TouchableOpacity
            key={product.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => toggleSelect(product.id)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{product.analysis.productName ?? 'Scanned product'}</Text>
              <RiskBadge tier={product.analysis.overallRiskTier} size="small" />
            </View>
            <Text style={styles.cardMeta}>Saved {new Date(product.savedAt).toLocaleDateString()}</Text>
            <TouchableOpacity onPress={() => handleRemove(product.id)}>
              <Text style={styles.removeLink}>Remove</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}

      {selected.length > 1 && (
        <View style={styles.comparisonTable}>
          <Text style={styles.sectionTitle}>Side-by-side</Text>
          {selected.map((product) => (
            <View key={product.id} style={styles.comparisonRow}>
              <Text style={styles.comparisonName}>{product.analysis.productName ?? 'Scanned product'}</Text>
              <RiskBadge tier={product.analysis.overallRiskTier} size="small" />
              <Text style={styles.comparisonMeta}>
                {product.analysis.flaggedForChildrenCount} flagged for children
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F4' },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  infoText: { textAlign: 'center', color: '#5B6058', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#22261F' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: '#EEEBDD' },
  cardSelected: { borderColor: '#2F7D5A', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#22261F', flexShrink: 1, marginRight: 8 },
  cardMeta: { fontSize: 12, color: '#8A8F86' },
  removeLink: { fontSize: 12, color: '#B5432E' },
  comparisonTable: { gap: 10, marginTop: 8 },
  comparisonRow: { backgroundColor: 'white', borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: '#EEEBDD' },
  comparisonName: { fontSize: 14, fontWeight: '600', color: '#22261F' },
  comparisonMeta: { fontSize: 12, color: '#5B6058' },
});
