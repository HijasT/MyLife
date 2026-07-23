/**
 * MyLife Design System - spacing & radius scale
 *
 * Usage:
 * import { mylifeSpacing, mylifeBorderRadius } from '@/lib/mylife-design-tokens';
 *
 * <div style={{ padding: mylifeSpacing[6], borderRadius: mylifeBorderRadius.xl }} />
 *
 * Colors are NOT part of this file — the app's actual color system is the set of
 * CSS custom properties defined in src/app/globals.css (--main-bg, --card-bg,
 * --text-primary, etc., overridden under .dark). Style against those, not a
 * separate TS color palette, so light/dark theming stays in one place.
 */

export const mylifeSpacing = {
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
} as const;

export const mylifeBorderRadius = {
  sm: '0.375rem',   // 6px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  full: '9999px',
} as const;
