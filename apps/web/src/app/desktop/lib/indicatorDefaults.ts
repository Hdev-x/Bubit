import { PRESET_THEMES } from '../../../chart/settings/theme';

// 웹 기본/비로그인 고정 테마 = '다크'(id:dark). 없으면 첫 프리셋 폴백.
export const DARK_THEME = PRESET_THEMES.find((t) => t.id === 'dark') ?? PRESET_THEMES[0];
