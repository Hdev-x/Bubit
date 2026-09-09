// 표시 설정 Provider — 컨텍스트·훅·타입은 settingsContext.ts .
import { useState, ReactNode } from 'react';
import { SettingsContext, type CurrencyType } from './settingsContext';

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 디폴트 = 원(KRW). 사용자가 바꾼 통화는 localStorage에 저장해 유지.
  const [displayCurrency, setDisplayCurrencyState] = useState<CurrencyType>(
    () => (localStorage.getItem('displayCurrency') === 'USDT' ? 'USDT' : 'KRW')
  );
  const setDisplayCurrency = (val: CurrencyType) => {
    localStorage.setItem('displayCurrency', val);
    setDisplayCurrencyState(val);
  };
  const [isHideBalance, setIsHideBalance] = useState<boolean>(() => localStorage.getItem('hideBalance') === 'true');

  const toggleHideBalance = () => {
    setIsHideBalance(prev => {
      const next = !prev;
      localStorage.setItem('hideBalance', String(next));
      return next;
    });
  };
  
  return (
    <SettingsContext.Provider value={{ displayCurrency, setDisplayCurrency, isHideBalance, toggleHideBalance }}>
      {children}
    </SettingsContext.Provider>
  );
}

// 기존 CurrencyProvider 하위호환
export const CurrencyProvider = SettingsProvider;
