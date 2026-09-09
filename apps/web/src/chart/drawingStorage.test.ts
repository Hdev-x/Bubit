import { beforeEach, describe, expect, it } from 'vitest';
import { getDrawingStorageKeys, loadStoredDrawings, saveStoredDrawings } from './drawingStorage';

describe('drawingStorage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  beforeEach(() => values.clear());

  it('시장별 key와 기존 key를 함께 제공한다', () => {
    expect(getDrawingStorageKeys('desktop', 'BITGET', 'USDT-FUTURES', 'BTCUSDT')).toEqual({
      key: 'desktop_BITGET_USDT-FUTURES_BTCUSDT', legacyKey: 'web_BITGET_BTCUSDT',
    });
    expect(getDrawingStorageKeys('mobile', 'UPBIT', undefined, 'KRW-BTC')).toEqual({
      key: 'mobile_UPBIT_spot_KRW-BTC', legacyKey: 'KRW-BTC',
    });
  });

  it('scoped 저장분이 없을 때만 legacy를 복제한다', () => {
    storage.setItem('chart_drawings_BTCUSDT', '[{"id":"legacy"}]');
    expect(loadStoredDrawings(storage, 'mobile_BITGET_spot_BTCUSDT', 'BTCUSDT')).toBe('[{"id":"legacy"}]');
    expect(storage.getItem('chart_drawings_mobile_BITGET_spot_BTCUSDT')).toBe('[{"id":"legacy"}]');

    saveStoredDrawings(storage, 'mobile_BITGET_spot_BTCUSDT', '[{"id":"scoped"}]');
    expect(loadStoredDrawings(storage, 'mobile_BITGET_spot_BTCUSDT', 'BTCUSDT')).toBe('[{"id":"scoped"}]');
  });

  it('빈 배열 tombstone 뒤에는 legacy를 다시 가져오지 않는다', () => {
    storage.setItem('chart_drawings_BTCUSDT', '[{"id":"legacy"}]');
    saveStoredDrawings(storage, 'mobile_BITGET_spot_BTCUSDT', '[]');
    expect(loadStoredDrawings(storage, 'mobile_BITGET_spot_BTCUSDT', 'BTCUSDT')).toBe('[]');
  });
});
