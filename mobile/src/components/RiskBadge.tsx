import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RiskTier } from '../types';

const RISK_META: Record<RiskTier, { label: string; color: string; icon: string }> = {
  safe: { label: 'Safe', color: '#2F7D5A', icon: '✓' },
  caution: { label: 'Caution', color: '#B9791F', icon: '!' },
  avoid: { label: 'Avoid', color: '#B5432E', icon: '✕' },
  unknown: { label: 'Not yet listed', color: '#6B7280', icon: '?' },
};

export function RiskBadge({ tier, size = 'medium' }: { tier: RiskTier; size?: 'small' | 'medium' }) {
  const meta = RISK_META[tier];
  const isSmall = size === 'small';
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Risk level: ${meta.label}`}
      style={[styles.badge, { backgroundColor: meta.color }, isSmall && styles.badgeSmall]}
    >
      <Text style={[styles.icon, isSmall && styles.iconSmall]}>{meta.icon}</Text>
      <Text style={[styles.label, isSmall && styles.labelSmall]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    gap: 6,
    alignSelf: 'flex-start',
  },
  badgeSmall: { paddingVertical: 3, paddingHorizontal: 8 },
  icon: { color: 'white', fontWeight: '700', fontSize: 14 },
  iconSmall: { fontSize: 11 },
  label: { color: 'white', fontWeight: '600', fontSize: 14 },
  labelSmall: { fontSize: 11 },
});
