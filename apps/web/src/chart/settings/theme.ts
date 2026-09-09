// 차트 테마 타입·프리셋·파생 색·CSS 변수 — ChartSettingsSheet.tsx에서 분리 (: 컴포넌트 파일은 컴포넌트만 export).
import type React from 'react';

export type ChartTheme = {
  id: string;
  upColor: string;
  downColor: string;
  bgColor: string;
};

export const PRESET_THEMES: (ChartTheme & { name: string })[] = [
  { id: 'github_dark', name: 'GitHub 다크', upColor: '#b4dbfc', downColor: '#79c0ff', bgColor: '#000000' },
  { id: 'light',  name: '라이트', upColor: '#0ecb81', downColor: '#f6465d', bgColor: '#ffffff' },
  { id: 'dark',   name: '다크',   upColor: '#0ecb81', downColor: '#f6465d', bgColor: '#000000' },
  { id: 'github', name: 'GitHub', upColor: '#58a6ff', downColor: '#f85149', bgColor: '#0d1117' },
];

export function getDerivedThemeColors(theme: ChartTheme) {
  const r = parseInt(theme.bgColor.slice(1, 3), 16) || 0;
  const g = parseInt(theme.bgColor.slice(3, 5), 16) || 0;
  const b = parseInt(theme.bgColor.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isDark = brightness < 128;
  return {
    isDark,
    textColor: isDark ? '#9aa4b2' : '#9a9a9a',
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    crosshairColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
  };
}

export function getThemeCssVars(theme: ChartTheme): React.CSSProperties {
  const r = parseInt(theme.bgColor.slice(1, 3), 16) || 0;
  const g = parseInt(theme.bgColor.slice(3, 5), 16) || 0;
  const b = parseInt(theme.bgColor.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isDark = brightness < 128;
  return {
    '--chart-bg':           theme.bgColor,
    '--chart-text-main':    isDark ? '#e6edf3' : '#111111',
    '--chart-text-sub':     isDark ? '#8b949e' : '#6b7684',
    '--chart-text-muted':   isDark ? '#8b96a8' : '#8b95a1',
    '--chart-border':       isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8',
    '--chart-badge-border': isDark ? 'rgba(255,255,255,0.14)' : '#e5e8eb',
    '--chart-up':           theme.upColor,
    '--chart-down':         theme.downColor,
  } as React.CSSProperties;
}
