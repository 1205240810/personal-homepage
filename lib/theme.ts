/** Site-wide visual themes. `default` is the original paper/mech look. */
export const THEMES = ['default', 'tech'] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_STORAGE_KEY = 'tscjj-theme';
export const THEME_EVENT = 'tscjj-theme-change';
export const THEME_LABELS: Record<ThemeId, string> = {
  default: '默认',
  tech: '科技',
};
export const normalizeTheme = (value: unknown): ThemeId =>
  THEMES.includes(value as ThemeId) ? (value as ThemeId) : 'default';
/**
 * Runs in <head> before first paint and before hydration, so a stored theme
 * never flashes the wrong palette. Kept dependency-free and ES5-safe.
 */
export const THEME_BOOT_SCRIPT = `(function(){var t='default';try{t=localStorage.getItem('${THEME_STORAGE_KEY}')==='tech'?'tech':'default'}catch(e){}var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t==='tech'?'dark':''})()`;
