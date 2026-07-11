import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Rendered on launch and on every results screen. Not a one-time modal —
 * see docs/PRODUCT_SCOPE.md §1 on why this stays persistent rather than
 * dismiss-once.
 */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Text style={styles.text}>
        Sprout gives general consumer information, not medical advice. It does not diagnose or treat any
        condition. For allergies or specific health concerns, talk to a pediatrician or healthcare provider.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F1EFE6',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DFDBC9',
  },
  containerCompact: { padding: 10, borderRadius: 8 },
  text: { color: '#3A3D33', fontSize: 13, lineHeight: 18 },
});
