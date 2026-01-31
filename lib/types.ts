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
