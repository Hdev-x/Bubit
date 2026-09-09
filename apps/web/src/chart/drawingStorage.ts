export type DrawingStorageScope = 'mobile' | 'desktop';

export function getDrawingStorageKeys(
  scope: DrawingStorageScope,
  exchange: string,
  productType: string | undefined,
  symbol: string,
) {
  return {
    key: `${scope}_${exchange}_${productType ?? 'spot'}_${symbol}`,
    legacyKey: scope === 'desktop' ? `web_${exchange}_${symbol}` : symbol,
  };
}

const storageKey = (key: string) => `chart_drawings_${key}`;

export function loadStoredDrawings(storage: Storage, key: string, legacyKey?: string): string | null {
  const scopedKey = storageKey(key);
  const saved = storage.getItem(scopedKey);
  if (saved !== null || !legacyKey) return saved;

  const legacy = storage.getItem(storageKey(legacyKey));
  if (legacy !== null) storage.setItem(scopedKey, legacy);
  return legacy;
}

export function saveStoredDrawings(storage: Storage, key: string, drawings: string) {
  storage.setItem(storageKey(key), drawings);
}
