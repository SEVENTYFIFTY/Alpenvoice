import type { AnalyzedIngredient, IngredientProfile, ProductAnalysis, RiskTier } from '../types';
import { lookupCuratedIngredient } from '../data/curatedIngredients';

const RISK_RANK: Record<RiskTier, number> = {
  safe: 0,
  unknown: 0,
  caution: 1,
  avoid: 2,
};

/**
 * Splits a raw ingredient-list string into top-level phrases, keeping
 * parenthetical sub-ingredients (e.g. "Vegetable Oil (Palm, Canola)")
 * attached to their parent rather than breaking on the inner comma.
 */
export function splitTopLevelIngredients(rawText: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of rawText) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current);
  return tokens.map((t) => t.trim()).filter(Boolean);
}

/**
 * Expands a top-level phrase into itself plus any parenthetical
 * sub-ingredients, so "Natural Flavor (contains Red 40)" is analyzed
 * as both "Natural Flavor" and "Red 40".
 */
export function expandIngredientPhrases(rawText: string): string[] {
  const topLevel = splitTopLevelIngredients(rawText);
  const expanded: string[] = [];
  for (const phrase of topLevel) {
    expanded.push(phrase);
    const parenMatch = phrase.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inner = parenMatch[1];
      const subPhrases = inner
        .replace(/\bcontains\b/gi, '')
        .split(/,|;|\band\/or\b|\band\b/i)
        .map((s) => s.trim())
        .filter(Boolean);
      expanded.push(...subPhrases);
    }
  }
  return expanded;
}

export function normalizeIngredientName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+(\.\d+)?\s*%/g, '')
    .replace(/\bless than\b/g, '')
    .replace(/\bcontains\b/g, '')
    .replace(/[*."']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unmatchedProfile(name: string): IngredientProfile {
  return {
    name,
    riskTier: 'unknown',
    summary: 'Not yet in our database. This is not a safety judgment — it just means neither Open Food Facts nor our fallback list has this ingredient yet.',
    source: 'unmatched',
  };
}

export interface AnalyzeOptions {
  /** Keyed by normalized ingredient name; results from a live API lookup (e.g. Open Food Facts additive tags). */
  apiMatches?: Map<string, IngredientProfile>;
  productName?: string;
}

export function matchIngredient(rawText: string, apiMatches?: Map<string, IngredientProfile>): AnalyzedIngredient {
  const normalized = normalizeIngredientName(rawText);
  if (!normalized) {
    return { rawText, profile: unmatchedProfile(rawText) };
  }
  const apiMatch = apiMatches?.get(normalized);
  if (apiMatch) {
    return { rawText, profile: apiMatch };
  }
  const curatedMatch = lookupCuratedIngredient(normalized);
  if (curatedMatch) {
    return { rawText, profile: curatedMatch };
  }
  return { rawText, profile: unmatchedProfile(normalized) };
}

export function aggregateOverallRisk(ingredients: AnalyzedIngredient[]): RiskTier {
  const matched = ingredients.filter((i) => i.profile.source !== 'unmatched');
  if (matched.length === 0) return 'unknown';
  const worst = matched.reduce((acc, i) => Math.max(acc, RISK_RANK[i.profile.riskTier]), 0);
  return (Object.keys(RISK_RANK) as RiskTier[]).find((tier) => RISK_RANK[tier] === worst && tier !== 'unknown') ?? 'safe';
}

export function analyzeIngredientText(rawText: string, options: AnalyzeOptions = {}): ProductAnalysis {
  const phrases = expandIngredientPhrases(rawText);
  const ingredients = phrases.map((phrase) => matchIngredient(phrase, options.apiMatches));
  const flaggedForChildrenCount = ingredients.filter(
    (i) => i.profile.childConcern && i.profile.riskTier !== 'safe',
  ).length;

  return {
    productName: options.productName,
    rawIngredientText: rawText,
    ingredients,
    overallRiskTier: aggregateOverallRisk(ingredients),
    flaggedForChildrenCount,
    analyzedAt: new Date().toISOString(),
  };
}
