import type { ProductAnalysis, SavedProduct } from '../types';

const STORAGE_KEY = '@sprout/saved_products_v1';
export const MAX_SAVED_PRODUCTS = 5;

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Lazily requires AsyncStorage so this module can be unit tested in
 * plain Node (via an injected in-memory KeyValueStorage) without
 * needing the React Native runtime present.
 */
function getDefaultStorage(): KeyValueStorage {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@react-native-async-storage/async-storage').default;
}

export class SavedProductLimitError extends Error {
  constructor() {
    super(`You can save up to ${MAX_SAVED_PRODUCTS} products at a time. Remove one to add another.`);
    this.name = 'SavedProductLimitError';
  }
}

export class ProductStorageService {
  constructor(private readonly storage: KeyValueStorage = getDefaultStorage()) {}

  async getAll(): Promise<SavedProduct[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SavedProduct[];
    } catch {
      return [];
    }
  }

  async save(analysis: ProductAnalysis, preferredStoreLabel?: string): Promise<SavedProduct> {
    const existing = await this.getAll();
    if (existing.length >= MAX_SAVED_PRODUCTS) {
      throw new SavedProductLimitError();
    }
    const record: SavedProduct = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      analysis,
      preferredStoreLabel,
    };
    await this.storage.setItem(STORAGE_KEY, JSON.stringify([...existing, record]));
    return record;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.getAll();
    const next = existing.filter((p) => p.id !== id);
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async getComparisonSet(ids: string[]): Promise<SavedProduct[]> {
    const all = await this.getAll();
    const idSet = new Set(ids);
    return all.filter((p) => idSet.has(p.id));
  }
}
