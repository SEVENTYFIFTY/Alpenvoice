import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { ScanScreen } from '../screens/ScanScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { AlternativesScreen } from '../screens/AlternativesScreen';
import { ComparisonScreen } from '../screens/ComparisonScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Scan" screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan a label' }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Results' }} />
      <Stack.Screen name="Alternatives" component={AlternativesScreen} options={{ title: 'Healthier alternatives' }} />
      <Stack.Screen name="Comparison" component={ComparisonScreen} options={{ title: 'Compare products' }} />
    </Stack.Navigator>
  );
}
