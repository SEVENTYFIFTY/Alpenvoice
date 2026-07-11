import type { IngredientProfile } from '../types';

/**
 * Bundled fallback dataset used only when Open Food Facts / USDA FoodData
 * Central have no match for a parsed ingredient, or those APIs are
 * unreachable. Every entry is `source: 'curated_fallback'` so the UI can
 * label it distinctly from a live API match (see docs/INGREDIENT_DATABASE.md).
 *
 * Risk tiers reflect general consumer-education consensus (FDA/EFSA
 * reviews, public advocacy analyses) and are deliberately general —
 * this is not a substitute for a toxicologist-reviewed database, which
 * is why every entry is labeled as a fallback, not an authoritative match.
 */
const LAST_REVIEWED = '2026-06-01';

const entries: IngredientProfile[] = [
  {
    name: 'red 40',
    riskTier: 'caution',
    summary: 'A synthetic dye used for color. Some studies link artificial dyes to attention/activity changes in sensitive children; the EU requires a warning label on products containing it.',
    childConcern: 'Considered one of the artificial dyes worth watching for children sensitive to food colorings.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'yellow 5',
    riskTier: 'caution',
    summary: 'Synthetic dye (tartrazine). Same EU warning-label category as other azo dyes tied to attention/activity concerns in some children.',
    childConcern: 'Flagged alongside Red 40 and Yellow 6 in most artificial-dye discussions concerning children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'yellow 6',
    riskTier: 'caution',
    summary: 'Synthetic dye. Same category of concern as Red 40 and Yellow 5.',
    childConcern: 'Flagged for children sensitive to artificial colorings.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'high fructose corn syrup',
    riskTier: 'caution',
    summary: 'An added sweetener. Frequent, high-volume consumption is associated with excess added-sugar intake more broadly, not a unique risk of this sweetener specifically.',
    childConcern: "Contributes to added-sugar totals that pediatric guidance recommends limiting for children.",
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'sodium nitrite',
    riskTier: 'caution',
    summary: 'A preservative common in cured/processed meats that also gives them their pink color; can form nitrosamine compounds under certain cooking conditions.',
    childConcern: 'Processed/cured meats are generally recommended in moderation for young children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'sodium nitrate',
    riskTier: 'caution',
    summary: 'Related preservative to sodium nitrite, used in cured meats.',
    childConcern: 'Same moderation guidance as sodium nitrite for children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'bha',
    riskTier: 'caution',
    summary: 'Butylated hydroxyanisole, a synthetic preservative used to prevent fats from going rancid. Some regulatory bodies list it under review for long-term exposure.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'bht',
    riskTier: 'caution',
    summary: 'Butylated hydroxytoluene, a synthetic antioxidant preservative, chemically related to BHA.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'partially hydrogenated oil',
    riskTier: 'avoid',
    summary: 'The primary dietary source of artificial trans fat. The FDA has revoked its "generally recognized as safe" status for this reason.',
    childConcern: 'No safe level of artificial trans fat is recommended for anyone, including children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'potassium bromate',
    riskTier: 'avoid',
    summary: 'A dough conditioner banned in many countries; classified as a possible carcinogen by some regulatory bodies when it remains in the finished product.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'brominated vegetable oil',
    riskTier: 'avoid',
    summary: 'An emulsifier historically used in citrus-flavored drinks; the FDA revoked authorization for its use in food as of 2024.',
    childConcern: 'Was most common in brightly colored sodas often marketed toward children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'titanium dioxide',
    riskTier: 'caution',
    summary: 'A whitening/opacifying agent. Banned as a food additive in the EU pending safety review; still permitted in the US.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'aspartame',
    riskTier: 'caution',
    summary: 'An artificial sweetener. Considered safe at typical intake levels by major food safety bodies, though it remains a commonly avoided ingredient by choice, and is unsafe for people with the rare condition PKU.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'sucralose',
    riskTier: 'caution',
    summary: 'An artificial, no-calorie sweetener. Generally recognized as safe by regulators; some consumers prefer to limit artificial sweeteners for children by choice.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'sodium benzoate',
    riskTier: 'caution',
    summary: 'A common preservative. Can react with added vitamin C in some beverages to form trace amounts of benzene; regulators consider typical exposure low-risk.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'msg',
    riskTier: 'caution',
    summary: 'Monosodium glutamate, a flavor enhancer. The FDA classifies it as generally recognized as safe; a small subset of people report sensitivity symptoms.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'monosodium glutamate',
    riskTier: 'caution',
    summary: 'Same ingredient as MSG — a flavor enhancer generally recognized as safe by the FDA, with occasional reported sensitivity in some individuals.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'carrageenan',
    riskTier: 'caution',
    summary: 'A thickener derived from seaweed. Food-grade carrageenan is permitted by regulators; some consumer groups raise concern about digestive sensitivity in a subset of people.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'caffeine',
    riskTier: 'caution',
    summary: 'A stimulant naturally present in some ingredients and added to others (e.g., some sodas and energy drinks).',
    childConcern: 'Pediatric guidance generally recommends children avoid or strictly limit caffeine intake.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'added sugar',
    riskTier: 'caution',
    summary: 'Sugar added during processing rather than naturally occurring in the food.',
    childConcern: 'Pediatric dietary guidance recommends limiting added sugar for young children specifically.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'propylparaben',
    riskTier: 'caution',
    summary: 'A preservative used to inhibit mold/yeast growth in some baked goods and personal care products.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'palm oil',
    riskTier: 'caution',
    summary: 'A saturated-fat-heavy vegetable oil; also a common ingredient with well-documented environmental/sourcing concerns unrelated to direct health impact.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'artificial flavor',
    riskTier: 'caution',
    summary: 'A broad label for lab-formulated flavor compounds; the specific compounds are not disclosed on packaging, which limits transparency even though each is individually reviewed as safe.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'peanuts',
    riskTier: 'caution',
    summary: 'A common allergen. Not a general health risk, but a major cause of serious allergic reactions.',
    childConcern: 'Introduce and manage per pediatric allergy guidance; avoid entirely for a child with a known peanut allergy.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'tree nuts',
    riskTier: 'caution',
    summary: 'A common allergen category.',
    childConcern: 'Avoid for a child with a known tree nut allergy; otherwise not a general risk.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'milk',
    riskTier: 'safe',
    summary: 'A source of protein, calcium, and vitamin D. A common allergen/intolerance for some individuals.',
    childConcern: 'Avoid for a child with a diagnosed milk allergy or lactose intolerance; otherwise a normal part of many children\'s diets.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'whole wheat flour',
    riskTier: 'safe',
    summary: 'A whole-grain flour that retains fiber and nutrients milled out of refined white flour.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'oats',
    riskTier: 'safe',
    summary: 'A whole grain providing fiber and steady energy.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'vitamin c',
    riskTier: 'safe',
    summary: 'An essential vitamin and antioxidant, often added to fortify products.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'vitamin d',
    riskTier: 'safe',
    summary: 'An essential vitamin supporting bone health, commonly fortified into dairy and cereals.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'calcium carbonate',
    riskTier: 'safe',
    summary: 'A calcium source often used to fortify foods for bone health.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'iron',
    riskTier: 'safe',
    summary: 'An essential mineral, often added to fortify cereals and infant formula.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'folic acid',
    riskTier: 'safe',
    summary: 'A B-vitamin commonly added to fortify grain products.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'probiotic cultures',
    riskTier: 'safe',
    summary: 'Live beneficial bacteria cultures, common in yogurt and fermented foods.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'olive oil',
    riskTier: 'safe',
    summary: 'An unsaturated fat associated with favorable health outcomes when used in place of saturated fats.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'flaxseed',
    riskTier: 'safe',
    summary: 'A source of fiber and omega-3 fatty acids.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'pea protein',
    riskTier: 'safe',
    summary: 'A plant-based protein source used in many alternative-protein products.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'citric acid',
    riskTier: 'safe',
    summary: 'A naturally occurring acid used widely as a flavoring and preservative; considered safe at food-use levels.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'ascorbic acid',
    riskTier: 'safe',
    summary: 'The chemical name for vitamin C; often added as an antioxidant/preservative as well as a nutrient.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'natural flavor',
    riskTier: 'safe',
    summary: 'A broad labeling term for flavor compounds derived from natural sources; like "artificial flavor," the specific compounds aren\'t disclosed, which limits transparency even though the category is reviewed as safe.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'sea salt',
    riskTier: 'caution',
    summary: 'Sodium chloride from evaporated seawater — nutritionally similar to table salt.',
    childConcern: 'Sodium intake guidance for young children recommends moderation regardless of salt source.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
  {
    name: 'salt',
    riskTier: 'caution',
    summary: 'An essential mineral in small amounts; commonly overconsumed via processed foods.',
    childConcern: 'Pediatric sodium guidance recommends moderation for young children.',
    source: 'curated_fallback',
    lastReviewedAt: LAST_REVIEWED,
  },
];

export const CURATED_INGREDIENTS: ReadonlyMap<string, IngredientProfile> = new Map(
  entries.map((entry) => [entry.name, entry]),
);

export function lookupCuratedIngredient(normalizedName: string): IngredientProfile | undefined {
  return CURATED_INGREDIENTS.get(normalizedName);
}
