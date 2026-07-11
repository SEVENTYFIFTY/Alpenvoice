import type { AlternativeProduct, OpenFoodFactsProduct, ProductAnalysis, RiskTier } from '../types';
import { searchProductsByCategoryAndRegion, type IngredientApiConfig } from './ingredientApi';
import { analyzeIngredientText } from './ingredientAnalysis';
import { deriveAdditiveMatches } from './additiveTags';

const RISK_RANK: Record<RiskTier, number> = { safe: 0, unknown: 1, caution: 2, avoid: 3 };

export interface FindAlternativesParams {
  scannedAnalysis: ProductAnalysis;
  categoryTag: string;
  countryTag: string;
  preferredStoreLabel?: string;
  apiConfig?: IngredientApiConfig;
  maxResults?: number;
}

/**
 * Ranks same-category, same-region products from Open Food Facts that
 * score better than the scanned product. There is no live inventory or
 * pricing signal in MVP, so results are framed as "commonly available
 * in your region," never as a guaranteed-in-stock claim.
 */
export async function findAlternatives(params: FindAlternativesParams): Promise<AlternativeProduct[]> {
  const { scannedAnalysis, categoryTag, countryTag, preferredStoreLabel, apiConfig, maxResults = 5 } = params;

  let candidates: OpenFoodFactsProduct[] = [];
  try {
    candidates = await searchProductsByCategoryAndRegion(categoryTag, countryTag, apiConfig);
  } catch {
    return [];
  }

  const scannedRank = RISK_RANK[scannedAnalysis.overallRiskTier];

  const scored = candidates
    .filter((p) => p.ingredients_text)
    .map((product) => {
      const apiMatches = deriveAdditiveMatches(product);
      const analysis = analyzeIngredientText(product.ingredients_text ?? '', {
        apiMatches,
        productName: product.product_name,
      });
      return { product, analysis };
    })
    .filter(({ analysis }) => RISK_RANK[analysis.overallRiskTier] < scannedRank)
    .sort((a, b) => RISK_RANK[a.analysis.overallRiskTier] - RISK_RANK[b.analysis.overallRiskTier]);

  return scored.slice(0, maxResults).map(({ product, analysis }) => ({
    code: product.code,
    productName: product.product_name ?? 'Unnamed product',
    imageUrl: product.image_url,
    overallRiskTier: analysis.overallRiskTier,
    reasons: buildReasons(scannedAnalysis, analysis),
    region: countryTag,
    preferredStoreLabel,
  }));
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/juice/i, 'en:fruit-juices'],
  [/cereal/i, 'en:breakfast-cereals'],
  [/(chip|crisp|pretzel)/i, 'en:salty-snacks'],
  [/(cookie|biscuit)/i, 'en:biscuits'],
  [/yogurt|yoghurt/i, 'en:yogurts'],
  [/cracker/i, 'en:crackers'],
  [/(candy|gummy|gummies)/i, 'en:candies'],
  [/granola|cereal bar/i, 'en:cereal-bars'],
];

/**
 * MVP heuristic only — guesses an Open Food Facts category tag from the
 * scanned product's name so the alternatives search has something to
 * filter on. Falls back to a broad "snacks" category rather than
 * guessing wrong and silently returning irrelevant products.
 */
export function guessCategoryTag(productName?: string): string {
  if (!productName) return 'en:snacks';
  const match = CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(productName));
  return match?.[1] ?? 'en:snacks';
}

const ISO_COUNTRY_TO_OFF_TAG: Record<string, string> = {
  US: 'en:united-states',
  GB: 'en:united-kingdom',
  CA: 'en:canada',
  FR: 'en:france',
  DE: 'en:germany',
  CH: 'en:switzerland',
  AT: 'en:austria',
  AU: 'en:australia',
};

/** Returns undefined when the country isn't in the MVP map — callers should skip region filtering rather than guess. */
export function mapIsoCountryToOffTag(isoCountryCode: string | null | undefined): string | undefined {
  if (!isoCountryCode) return undefined;
  return ISO_COUNTRY_TO_OFF_TAG[isoCountryCode.toUpperCase()];
}

function buildReasons(scanned: ProductAnalysis, alternative: ProductAnalysis): string[] {
  const reasons: string[] = [];
  const scannedFlagged = scanned.ingredients.filter((i) => i.profile.riskTier !== 'safe').length;
  const altFlagged = alternative.ingredients.filter((i) => i.profile.riskTier !== 'safe').length;
  if (altFlagged < scannedFlagged) {
    reasons.push(`${scannedFlagged - altFlagged} fewer flagged ingredient(s)`);
  }
  if (alternative.flaggedForChildrenCount < scanned.flaggedForChildrenCount) {
    reasons.push('Fewer ingredients flagged for children');
  }
  if (reasons.length === 0) {
    reasons.push('Better overall risk rating');
  }
  return reasons;
}
