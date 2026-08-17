export interface StooqDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Adjusted close (dividends/splits). Available from Yahoo; absent for Stooq. */
  adjClose?: number;
}

export interface TickerData {
  ticker: string;
  data: StooqDataPoint[];
}

export interface ChartDataPoint {
  date: string;
  [ticker: string]: string | number;
}

/** A best/worst calendar period, carrying which one it was so the figure is readable. */
export interface PeriodExtreme {
  /** "2024" for a year, "Nov 2020" for a month. */
  label: string;
  /** Return over that period, in percent. */
  value: number;
}

export interface Statistics {
  // Data section
  ticker: string;
  startDate: string;
  endDate: string;
  totalDays: number;

  // Returns section
  periodReturn: number;
  cagr: number;
  growthOf1: number;
  ytdReturn: number | null;
  oneYearReturn: number | null;
  threeYearReturn: number | null;
  fiveYearReturn: number | null;
  /** Best/worst calendar year and month, on the same basis as the returns table. */
  bestYear: PeriodExtreme | null;
  worstYear: PeriodExtreme | null;
  bestMonth: PeriodExtreme | null;
  worstMonth: PeriodExtreme | null;

  // Drawdowns section
  maxDrawdown: number;
  maxDrawdownDate: string;
  currentDrawdown: number;
  toReturnToATH: number;
  longestDrawdownDays: number;

  // Prices section
  startPrice: number;
  endPrice: number;
  minPrice: number;
  minPriceDate: string;
  maxPrice: number;
  maxPriceDate: string;

  // Stats section
  profitSessions: number;
  lossSessions: number;
  avgProfitSession: number;
  avgLossSession: number;
  annualizedStd: number;
  sharpeRatio: number;
}

export interface ApiResponse {
  success: boolean;
  data?: TickerData[];
  error?: string;
  /** Stooq only: set when a human must solve a CAPTCHA before data can be fetched. */
  captchaRequired?: boolean;
  /** Stooq only: session token to use with the CAPTCHA endpoints and the retry request. */
  sessionToken?: string;
}

// Trend Following Strategy Types
export type TrendSignal = 'BUY' | 'SELL';

export interface MonthlyDataPoint {
  date: string;
  price: number;
  sma10: number | null;
  signal: TrendSignal | null;
}

export interface TrendFollowingChartPoint {
  date: string;
  buyHold: number;
  trendFollowing: number;
  sma10: number | null;
  signal?: TrendSignal;
}

export interface TrendFollowingDrawdownPoint {
  date: string;
  buyHoldDrawdown: number;
  trendFollowingDrawdown: number;
}

export interface StrategyStatistics {
  finalAmount: number;
  cagr: number;
  totalReturn: number;
  annualizedStd: number;
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
}

export interface RollingReturnDataPoint {
  date: string;        // current price date
  rollingCagr: number; // CAGR as percentage (e.g. 7.2)
  startDate: string;   // N years ago date (for tooltip)
  startPrice: number;  // close price N years ago (for tooltip)
  endPrice: number;    // close price on this date (for tooltip)
}

export interface TrendFollowingAnalysis {
  chartData: TrendFollowingChartPoint[];
  drawdownData: TrendFollowingDrawdownPoint[];
  buyHoldStats: StrategyStatistics;
  trendFollowingStats: StrategyStatistics;
  currentSignal: TrendSignal;
  signalDates: { date: string; signal: TrendSignal }[];
}
