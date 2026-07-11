import type { IngredientProfile, OpenFoodFactsProduct } from '../types';

/**
 * Open Food Facts tags additives by E-number (e.g. "en:e129"), not by
 * common name. This maps the E-numbers most relevant to a family/child
 * health lens onto the same common names used in curatedIngredients.ts,
 * so a product's `additives_tags` from the API and a manually-typed
 * ingredient both resolve to one profile. Entries here are tagged
 * `source: 'open_food_facts'` since the *presence* of the additive came
 * from the API, even though the description text is maintained by us.
 */
const E_NUMBER_TO_PROFILE: Record<string, IngredientProfile> = {
  'en:e102': asProfile('yellow 5', 'caution', 'Synthetic dye (tartrazine). EU-mandated warning label for a possible link to attention/activity changes in some children.', true),
  'en:e104': asProfile('quinoline yellow', 'caution', 'Synthetic dye carrying the same EU child-attention warning label as other azo/synthetic dyes.', true),
  'en:e110': asProfile('yellow 6', 'caution', 'Synthetic dye (sunset yellow). Same EU warning-label category as Red 40 and Yellow 5.', true),
  'en:e122': asProfile('carmoisine', 'caution', 'Synthetic dye carrying the same EU child-attention warning label as other azo dyes.', true),
  'en:e124': asProfile('ponceau 4r', 'caution', 'Synthetic dye carrying the same EU child-attention warning label as other azo dyes.', true),
  'en:e129': asProfile('red 40', 'caution', 'Synthetic dye. EU-mandated warning label for a possible link to attention/activity changes in some children.', true),
  'en:e171': asProfile('titanium dioxide', 'caution', 'Whitening/opacifying agent; banned as a food additive in the EU pending safety review, still permitted in the US.', false),
  'en:e211': asProfile('sodium benzoate', 'caution', 'Preservative that can react with added vitamin C in some beverages to form trace benzene; regulators consider typical exposure low-risk.', false),
  'en:e250': asProfile('sodium nitrite', 'caution', 'Preservative common in cured/processed meats; can form nitrosamine compounds under certain cooking conditions.', true),
  'en:e251': asProfile('sodium nitrate', 'caution', 'Related preservative to sodium nitrite, used in cured meats.', true),
  'en:e320': asProfile('bha', 'caution', 'Synthetic preservative (butylated hydroxyanisole) used to prevent fats from going rancid; under long-term review by some regulators.', false),
  'en:e321': asProfile('bht', 'caution', 'Synthetic antioxidant preservative (butylated hydroxytoluene), chemically related to BHA.', false),
  'en:e407': asProfile('carrageenan', 'caution', 'Seaweed-derived thickener; food-grade use is permitted, though some raise digestive-sensitivity concerns for a subset of people.', false),
  'en:e621': asProfile('msg', 'caution', 'Flavor enhancer (monosodium glutamate); FDA classifies it as generally recognized as safe, with occasional reported sensitivity.', false),
  'en:e924': asProfile('potassium bromate', 'avoid', 'Dough conditioner banned in many countries; classified as a possible carcinogen by some regulators if it remains in the finished product.', false),
  'en:e951': asProfile('aspartame', 'caution', 'Artificial sweetener; considered safe at typical intake by major food-safety bodies, unsafe for people with PKU.', false),
  'en:e955': asProfile('sucralose', 'caution', 'Artificial, no-calorie sweetener; generally recognized as safe by regulators.', false),
};

function asProfile(name: string, riskTier: IngredientProfile['riskTier'], summary: string, hasChildConcern: boolean): IngredientProfile {
  return {
    name,
    riskTier,
    summary,
    childConcern: hasChildConcern ? 'Flagged under the EU warning-label category for artificial dyes and children\'s attention/activity.' : undefined,
    source: 'open_food_facts',
    lastReviewedAt: '2026-06-01',
  };
}

/**
 * Converts a product's `additives_tags` into the same
 * `Map<normalizedName, IngredientProfile>` shape the analysis engine
 * expects, so API-sourced matches take priority over the curated
 * fallback for any additive Open Food Facts actually reports.
 */
export function deriveAdditiveMatches(product: OpenFoodFactsProduct): Map<string, IngredientProfile> {
  const matches = new Map<string, IngredientProfile>();
  for (const tag of product.additives_tags ?? []) {
    const profile = E_NUMBER_TO_PROFILE[tag.toLowerCase()];
    if (profile) {
      matches.set(profile.name, profile);
    }
  }
  return matches;
}
