import { describe, it, expect } from 'vitest';
import { EMPTY_LIVE_PRICE, applyDailyOpen, applySeed, applyTick, isReady, livePriceKey, msUntilNextUtcMidnight, readySymbolOf } from './livePriceState';
import type { BitgetTicker } from '../../api/exchange/bitget/bitgetTicker';

const ticker = (last: number, openUtc = 0): BitgetTicker => ({ last, openUtc, high24h: 0, low24h: 0, baseVolume: 0, quoteVolume: 0 });
const BTC = livePriceKey('BITGET', 'BTCUSDT', true);
const ETH = livePriceKey('BITGET', 'ETHUSDT', true);

describe('livePriceState', () => {
  it('seed가 오기 전 WS 틱은 무시한다', () => {
    const s = applyTick(EMPTY_LIVE_PRICE, BTC, 100);
    expect(s).toBe(EMPTY_LIVE_PRICE);
  });

  it('seed → 틱 순서로 현재가가 채워지고 갱신된다', () => {
    const seeded = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(seeded).toEqual({ price: 100, dailyOpen: 90, readyKey: BTC });
    expect(readySymbolOf(seeded)).toBe('BTCUSDT');
    const ticked = applyTick(seeded, BTC, 101);
    expect(ticked.price).toBe(101);
    expect(ticked.dailyOpen).toBe(90);
  });

  it('종목 전환 직후엔 옛 값을 유지하고 새 종목 틱을 막다가 새 seed에 한 번에 바뀐다(스테이지드 스왑)', () => {
    const btc = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    // ETH로 전환 — 아직 seed 전
    const stillBtc = applyTick(btc, ETH, 3000);
    expect(stillBtc).toBe(btc);
    expect(readySymbolOf(stillBtc)).toBe('BTCUSDT'); // 헤더는 아직 BTC를 "준비된 종목"으로 본다
    const eth = applySeed(stillBtc, ETH, ETH, ticker(3000, 2900));
    expect(eth).toEqual({ price: 3000, dailyOpen: 2900, readyKey: ETH });
    expect(applyTick(eth, ETH, 3001).price).toBe(3001);
  });

  it('전환 중 늦게 도착한 옛 종목 seed는 버린다', () => {
    const lateBtcSeed = applySeed(EMPTY_LIVE_PRICE, ETH, BTC, ticker(100, 90));
    expect(lateBtcSeed).toBe(EMPTY_LIVE_PRICE);
  });

  it('seed에 last가 없거나 null이면 변화 없음, openUtc 0은 dailyOpen null', () => {
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, null)).toBe(EMPTY_LIVE_PRICE);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(0, 90))).toBe(EMPTY_LIVE_PRICE);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 0)).dailyOpen).toBeNull();
  });

  it('같은 가격 틱·0 가격은 같은 객체를 돌려 렌더를 아낀다', () => {
    const seeded = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(applyTick(seeded, BTC, 100)).toBe(seeded);
    expect(applyTick(seeded, BTC, 0)).toBe(seeded);
  });

  it('호출자가 준 일봉 시가가 티커 openUtc보다 우선하고, 없으면 티커 값으로 폴백한다', () => {
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), 95).dailyOpen).toBe(95);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), null).dailyOpen).toBe(90);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), 0).dailyOpen).toBe(90);
  });

  it('ready는 거래소·현선물까지 포함한 키로 판정한다 — 같은 심볼 다른 거래소는 준비 아님', () => {
    const bg = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(isReady(bg, BTC)).toBe(true);
    const bn = livePriceKey('BINANCE', 'BTCUSDT', true);
    expect(isReady(bg, bn)).toBe(false);          // Bitget BTC → Binance BTC 전환 직후
    expect(readySymbolOf(bg)).toBe('BTCUSDT');    // 심볼만 보면 통과해 버리던 예전 판정
    expect(applyTick(bg, bn, 999)).toBe(bg);       // 새 거래소 틱도 seed 전엔 무시
  });

  it('applyDailyOpen은 현재 키의 seed가 끝난 상태에서만 시가를 갱신한다(일봉 롤오버)', () => {
    const bg = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(applyDailyOpen(bg, BTC, 95).dailyOpen).toBe(95);
    expect(applyDailyOpen(bg, ETH, 95)).toBe(bg);   // 옛 키 값은 무시
    expect(applyDailyOpen(bg, BTC, 0)).toBe(bg);
    expect(applyDailyOpen(bg, BTC, 90)).toBe(bg);   // 같은 값이면 같은 객체
  });

  it('msUntilNextUtcMidnight', () => {
    const t = Date.UTC(2026, 8, 6, 23, 59, 50);
    expect(msUntilNextUtcMidnight(t)).toBe(10_000);
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 8, 7))).toBe(86_400_000);
  });

  it('현물/선물·거래소가 다르면 다른 키다', () => {
    expect(livePriceKey('BITGET', 'BTCUSDT', true)).not.toBe(livePriceKey('BITGET', 'BTCUSDT', false));
    expect(livePriceKey('BITGET', 'BTCUSDT', true)).not.toBe(livePriceKey('BINANCE', 'BTCUSDT', true));
  });
});
