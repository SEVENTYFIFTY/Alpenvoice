import {
  analyzeIngredientText,
  expandIngredientPhrases,
  matchIngredient,
  normalizeIngredientName,
  splitTopLevelIngredients,
} from '../src/services/ingredientAnalysis';
import type { IngredientProfile } from '../src/types';

describe('splitTopLevelIngredients', () => {
  it('splits on top-level commas only', () => {
    expect(splitTopLevelIngredients('Sugar, Vegetable Oil (Palm, Canola), Salt')).toEqual([
      'Sugar',
      'Vegetable Oil (Palm, Canola)',
      'Salt',
    ]);
  });

  it('handles empty input', () => {
    expect(splitTopLevelIngredients('')).toEqual([]);
  });

  it('ignores unbalanced closing parens gracefully', () => {
    expect(splitTopLevelIngredients('Sugar), Salt')).toEqual(['Sugar)', 'Salt']);
  });
});

describe('expandIngredientPhrases', () => {
  it('expands parenthetical sub-ingredients as their own entries', () => {
    expect(expandIngredientPhrases('Natural Flavor (contains Red 40), Salt')).toEqual([
      'Natural Flavor (contains Red 40)',
      'Red 40',
      'Salt',
    ]);
  });

  it('splits multiple sub-ingredients joined by and/or', () => {
    const result = expandIngredientPhrases('Vegetable Oil (Palm and Canola)');
    expect(result).toContain('Vegetable Oil (Palm and Canola)');
    expect(result).toContain('Palm');
    expect(result).toContain('Canola');
  });
});

describe('normalizeIngredientName', () => {
  it('lowercases and strips punctuation/percentages', () => {
    expect(normalizeIngredientName('Red 40*')).toBe('red 40');
    expect(normalizeIngredientName('Salt (less than 2%)')).toBe('salt');
    expect(normalizeIngredientName('  Vitamin C.  ')).toBe('vitamin c');
  });
});

describe('matchIngredient', () => {
  it('matches a curated fallback ingredient by normalized name', () => {
    const result = matchIngredient('Red 40');
    expect(result.profile.source).toBe('curated_fallback');
    expect(result.profile.riskTier).toBe('caution');
    expect(result.profile.childConcern).toBeDefined();
  });

  it('prefers an API match over the curated fallback', () => {
    const apiProfile: IngredientProfile = {
      name: 'red 40',
      riskTier: 'avoid',
      summary: 'API-sourced override',
      source: 'open_food_facts',
    };
    const apiMatches = new Map([['red 40', apiProfile]]);
    const result = matchIngredient('Red 40', apiMatches);
    expect(result.profile.source).toBe('open_food_facts');
    expect(result.profile.riskTier).toBe('avoid');
  });

  it('returns an unmatched profile for unknown ingredients without guessing a risk tier', () => {
    const result = matchIngredient('Unobtainium Extract');
    expect(result.profile.source).toBe('unmatched');
    expect(result.profile.riskTier).toBe('unknown');
  });
});

describe('analyzeIngredientText', () => {
  it('produces an overall avoid rating when any ingredient is avoid-tier', () => {
    const analysis = analyzeIngredientText('Sugar, Partially Hydrogenated Oil, Salt');
    expect(analysis.overallRiskTier).toBe('avoid');
  });

  it('produces caution when the worst ingredient is caution-tier', () => {
    const analysis = analyzeIngredientText('Whole Wheat Flour, Red 40, Olive Oil');
    expect(analysis.overallRiskTier).toBe('caution');
  });

  it('produces safe when all matched ingredients are safe-tier', () => {
    const analysis = analyzeIngredientText('Whole Wheat Flour, Olive Oil, Oats');
    expect(analysis.overallRiskTier).toBe('safe');
  });

  it('produces unknown overall rating when nothing matches', () => {
    const analysis = analyzeIngredientText('Unobtainium Extract, Fictionite');
    expect(analysis.overallRiskTier).toBe('unknown');
  });

  it('counts ingredients flagged for children', () => {
    const analysis = analyzeIngredientText('Red 40, Yellow 5, Whole Wheat Flour');
    expect(analysis.flaggedForChildrenCount).toBe(2);
  });

  it('never lets an unmatched ingredient masquerade as a real risk judgment', () => {
    const analysis = analyzeIngredientText('Unobtainium Extract');
    expect(analysis.ingredients[0].profile.riskTier).toBe('unknown');
    expect(analysis.ingredients[0].profile.source).toBe('unmatched');
  });
});
