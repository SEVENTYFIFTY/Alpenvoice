export type RiskTier = 'safe' | 'caution' | 'avoid' | 'unknown';

export type IngredientSource = 'open_food_facts' | 'usda_fdc' | 'curated_fallback' | 'unmatched';

export interface IngredientProfile {
  /** Canonical name as matched, not necessarily the raw OCR token */
  name: string;
  riskTier: RiskTier;
  summary: string;
  childConcern?: string;
  source: IngredientSource;
  sourceUrl?: string;
  lastReviewedAt?: string;
}

export interface AnalyzedIngredient {
  /** The raw token as it appeared in the OCR'd/typed ingredient list */
  rawText: string;
  profile: IngredientProfile;
}

export interface ProductAnalysis {
  productName?: string;
  rawIngredientText: string;
  ingredients: AnalyzedIngredient[];
  overallRiskTier: RiskTier;
  flaggedForChildrenCount: number;
  analyzedAt: string;
}

export interface OpenFoodFactsProduct {
  code: string;
  product_name?: string;
  ingredients_text?: string;
  additives_tags?: string[];
  ingredients_analysis_tags?: string[];
  categories_tags?: string[];
  countries_tags?: string[];
  image_url?: string;
}

export interface AlternativeProduct {
  code: string;
  productName: string;
  imageUrl?: string;
  overallRiskTier: RiskTier;
  reasons: string[];
  region?: string;
  preferredStoreLabel?: string;
}

export interface SavedProduct {
  id: string;
  savedAt: string;
  analysis: ProductAnalysis;
  preferredStoreLabel?: string;
}

export type OcrEngine = 'ml_kit' | 'tesseract_js';

export interface OcrResult {
  text: string;
  engine: OcrEngine;
  /** 0-1 confidence, engine-reported when available, heuristic otherwise */
  confidence: number;
}

export class OcrFailureError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OcrFailureError';
  }
}

export class IngredientApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'IngredientApiError';
  }
}
