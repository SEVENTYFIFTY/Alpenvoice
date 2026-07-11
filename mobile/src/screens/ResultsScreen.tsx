import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { RiskBadge } from '../components/RiskBadge';
import { Disclaimer } from '../components/Disclaimer';
import { ProductStorageService, SavedProductLimitError } from '../services/storage';
import { logger } from '../services/logger';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

const storageService = new ProductStorageService();

export function ResultsScreen({ route, navigation }: Props) {
  const { analysis } = route.params;
  const [saving, setSaving] = useState(false);

  const concerning = analysis.ingredients.filter((i) => i.profile.riskTier === 'avoid' || i.profile.riskTier === 'caution');
  const safe = analysis.ingredients.filter((i) => i.profile.riskTier === 'safe');
  const unknown = analysis.ingredients.filter((i) => i.profile.riskTier === 'unknown');

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await storageService.save(analysis);
      Alert.alert('Saved', 'Added to your saved products.');
    } catch (err) {
      const message = err instanceof SavedProductLimitError ? err.message : 'Could not save this product. Please try again.';
      Alert.alert('Could not save', message);
      logger.error('Save product failed', { error: String(err) });
    } finally {
      setSaving(false);
    }
  }, [analysis]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{analysis.productName ?? 'Scanned product'}</Text>
        <RiskBadge tier={analysis.overallRiskTier} />
      </View>

      {analysis.flaggedForChildrenCount > 0 && (
        <View style={styles.childCallout}>
          <Text style={styles.childCalloutText}>
            {analysis.flaggedForChildrenCount} ingredient{analysis.flaggedForChildrenCount > 1 ? 's' : ''} flagged
            with a note specifically for children — see below.
          </Text>
        </View>
      )}

      <Disclaimer />

      {concerning.length > 0 && (
        <Section title="Worth a closer look">
          {concerning.map((item, idx) => (
            <IngredientRow key={`${item.rawText}-${idx}`} item={item} />
          ))}
        </Section>
      )}

      {unknown.length > 0 && (
        <Section title="Not yet in our database">
          {unknown.map((item, idx) => (
            <IngredientRow key={`${item.rawText}-${idx}`} item={item} />
          ))}
        </Section>
      )}

      {safe.length > 0 && (
        <Section title="Generally fine">
          {safe.map((item, idx) => (
            <IngredientRow key={`${item.rawText}-${idx}`} item={item} />
          ))}
        </Section>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{saving ? 'Saving…' : 'Save product'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Alternatives', { analysis })}
        >
          <Text style={styles.primaryButtonText}>See healthier alternatives</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function IngredientRow({ item }: { item: import('../types').AnalyzedIngredient }) {
  return (
    <View style={styles.ingredientRow}>
      <View style={styles.ingredientHeader}>
        <Text style={styles.ingredientName}>{item.profile.name}</Text>
        <RiskBadge tier={item.profile.riskTier} size="small" />
      </View>
      <Text style={styles.ingredientSummary}>{item.profile.summary}</Text>
      {item.profile.childConcern && (
        <Text style={styles.childConcern}>For children: {item.profile.childConcern}</Text>
      )}
      <Text style={styles.sourceLabel}>
        Source: {sourceLabel(item.profile.source)}
        {item.profile.lastReviewedAt ? ` · reviewed ${item.profile.lastReviewedAt}` : ''}
      </Text>
    </View>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'open_food_facts':
      return 'Open Food Facts';
    case 'usda_fdc':
      return 'USDA FoodData Central';
    case 'curated_fallback':
      return 'Sprout curated list (not yet cross-checked against a live API)';
    default:
      return 'Unmatched';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F4' },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#22261F', flexShrink: 1, marginRight: 12 },
  childCallout: { backgroundColor: '#FDEFE3', borderRadius: 10, padding: 12 },
  childCalloutText: { color: '#8A4B12', fontSize: 13 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#22261F' },
  ingredientRow: { backgroundColor: 'white', borderRadius: 10, padding: 12, gap: 6, borderWidth: 1, borderColor: '#EEEBDD' },
  ingredientHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ingredientName: { fontSize: 15, fontWeight: '600', color: '#22261F', textTransform: 'capitalize' },
  ingredientSummary: { fontSize: 13, color: '#5B6058', lineHeight: 18 },
  childConcern: { fontSize: 12, color: '#8A4B12', fontStyle: 'italic' },
  sourceLabel: { fontSize: 11, color: '#8A8F86' },
  actions: { gap: 10, marginTop: 8 },
  primaryButton: { backgroundColor: '#2F7D5A', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#EEEBDD', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  secondaryButtonText: { color: '#22261F', fontWeight: '600' },
});
