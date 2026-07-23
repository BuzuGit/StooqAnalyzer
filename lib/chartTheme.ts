import { Theme } from '@/components/ThemeProvider';

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** Color for the primary asset series line/area (was hardcoded black — invisible on dark). */
  seriesPrimary: string;
  /** Background for filled marker bubbles/dots that carry white text. */
  markerBg: string;
}

const LIGHT: ChartTheme = {
  grid: '#e5e7eb',
  axis: '#6b7280',
  tooltipBg: '#ffffff',
  tooltipBorder: '#d1d5db',
  tooltipText: '#111827',
  seriesPrimary: '#111827',
  markerBg: '#111827',
};

const DARK: ChartTheme = {
  grid: '#1f1f1f',
  axis: '#8a8a8a',
  tooltipBg: '#111111',
  tooltipBorder: '#2a2a2a',
  tooltipText: '#e6e6e6',
  seriesPrimary: '#e6e6e6',
  markerBg: '#374151',
};

export function getChartTheme(theme: Theme): ChartTheme {
  return theme === 'dark' ? DARK : LIGHT;
}
