/**
 * MyLife Design System - TypeScript Tokens
 * 
 * Usage:
 * import { mylifeColors, mylifeSpacing, mylifeTypography } from '@/lib/mylife-design-tokens';
 * 
 * <div style={{ background: mylifeColors.primary, padding: mylifeSpacing[6] }}>
 */

export const mylifeColors = {
  // Primary (Orange - Brand)
  primary: '#f97316',
  primaryHover: '#ea580c',
  primaryLight: '#fed7aa',
  primaryDark: '#c2410c',
  onPrimary: '#ffffff',
  
  // Background & Surface (Light Mode)
  light: {
    background: '#f9fafb',
    surface: '#ffffff',
    surfaceHover: '#f3f4f6',
    border: '#e5e7eb',
    borderHover: '#d1d5db',
    text: '#111827',
    textMuted: '#6b7280',
    textFaint: '#9ca3af',
  },
  
  // Background & Surface (Dark Mode)
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    surfaceHover: '#334155',
    border: '#334155',
    borderHover: '#475569',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textFaint: '#64748b',
  },
  
  // Semantic
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Modules
  modules: {
    portfolio: '#f97316',
    biomarkers: '#10b981',
    inventory: '#f59e0b',
    duetracker: '#ef4444',
    calendar: '#3b82f6',
    entertainment: '#8b5cf6',
  },
} as const;

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

export const mylifeTypography = {
  fontFamily: {
    heading: "'Inter', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

export const mylifeBorderRadius = {
  sm: '0.375rem',   // 6px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  full: '9999px',
} as const;

export const mylifeShadows = {
  light: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
  dark: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.4)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.6)',
  },
} as const;

export const mylifeTransitions = {
  fast: '150ms ease-in-out',
  normal: '250ms ease-in-out',
  slow: '350ms ease-in-out',
} as const;

/**
 * Helper function to get theme-aware colors
 */
export function getMyLifeColors(isDark: boolean) {
  return {
    primary: mylifeColors.primary,
    primaryHover: mylifeColors.primaryHover,
    onPrimary: mylifeColors.onPrimary,
    ...(isDark ? mylifeColors.dark : mylifeColors.light),
    success: mylifeColors.success,
    danger: mylifeColors.danger,
    warning: mylifeColors.warning,
    info: mylifeColors.info,
  };
}

export default {
  colors: mylifeColors,
  spacing: mylifeSpacing,
  typography: mylifeTypography,
  borderRadius: mylifeBorderRadius,
  shadows: mylifeShadows,
  transitions: mylifeTransitions,
  getColors: getMyLifeColors,
};
