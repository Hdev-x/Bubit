// 표시 설정 컨텍스트 — 타입·컨텍스트 객체·훅. Provider 컴포넌트는 CurrencyContext.tsx (: 컴포넌트 파일은 컴포넌트만 export).
import { createContext, useContext } from 'react';

export type CurrencyType = 'USDT' | 'KRW';

/** 표시용 통화 단위 라벨 — 내부 값은 'KRW' 유지하되 화면엔 '원'으로. USDT는 그대로. */
export const currencyLabel = (c: CurrencyType): string => (c === 'KRW' ? '원' : 'USDT');

export interface SettingsContextType {
  displayCurrency: CurrencyType;
  setDisplayCurrency: (val: CurrencyType) => void;
  isHideBalance: boolean;
  toggleHideBalance: () => void;
}

export const SettingsContext = createContext<SettingsContextType>({
  displayCurrency: 'KRW',
  setDisplayCurrency: () => {},
  isHideBalance: false,
  toggleHideBalance: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

// 기존 CurrencyContext 하위호환
export const CurrencyContext = SettingsContext;
export const useCurrency = useSettings;
