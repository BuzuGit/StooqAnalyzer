export interface StooqDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerData {
  ticker: string;
  data: StooqDataPoint[];
}

export interface ChartDataPoint {
  date: string;
  [ticker: string]: string | number;
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
