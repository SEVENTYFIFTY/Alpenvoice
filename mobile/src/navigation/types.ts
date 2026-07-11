import type { ProductAnalysis } from '../types';

export type RootStackParamList = {
  Scan: undefined;
  Results: { analysis: ProductAnalysis };
  Alternatives: { analysis: ProductAnalysis };
  Comparison: undefined;
};
