import {
  StooqDataPoint,
  Statistics,
  ChartDataPoint,
  TickerData,
  TrendSignal,
  MonthlyDataPoint,
  TrendFollowingChartPoint,
  TrendFollowingDrawdownPoint,
  StrategyStatistics,
  TrendFollowingAnalysis,
  RollingReturnDataPoint,
} from './types';

const RISK_FREE_RATE = 0.02; // 2% annual risk-free rate assumption
const TRADING_DAYS_PER_YEAR = 252;

export function calculateStatistics(ticker: string, data: StooqDataPoint[]): Statistics {
  if (data.length < 2) {
    throw new Error('Insufficient data to calculate statistics');
  }

  const startPrice = data[0].close;
  const endPrice = data[data.length - 1].close;
  const startDate = data[0].date;
  const endDate = data[data.length - 1].date;
  const totalDays = data.length;

  // Calculate years for CAGR
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const years = (endDateObj.getTime() - startDateObj.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  // Returns
  const periodReturn = ((endPrice - startPrice) / startPrice) * 100;
  const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;
  const growthOf1 = endPrice / startPrice;

  // Find min and max prices
  let minPrice = data[0].close;
  let minPriceDate = data[0].date;
  let maxPrice = data[0].close;
  let maxPriceDate = data[0].date;

  for (const point of data) {
    if (point.close < minPrice) {
      minPrice = point.close;
      minPriceDate = point.date;
    }
    if (point.close > maxPrice) {
      maxPrice = point.close;
      maxPriceDate = point.date;
    }
  }

  // Drawdown calculations
  const { maxDrawdown, maxDrawdownDate, currentDrawdown, longestDrawdownDays } =
    calculateDrawdowns(data);

  // To return to ATH
  const toReturnToATH = maxPrice > endPrice ? ((maxPrice / endPrice) - 1) * 100 : 0;

  // Session statistics
  const { profitSessions, lossSessions, avgProfitSession, avgLossSession, dailyReturns } =
    calculateSessionStats(data);

  // Annualized standard deviation
  const annualizedStd = calculateAnnualizedStd(dailyReturns);

  // Sharpe ratio
  const annualizedReturn = cagr / 100;
  const sharpeRatio = annualizedStd > 0
    ? (annualizedReturn - RISK_FREE_RATE) / annualizedStd
    : 0;

  // Calculate YTD, 1Y, 3Y returns
  const { ytdReturn, oneYearReturn, threeYearReturn } = calculatePeriodReturns(data);

  return {
    ticker,
    startDate,
    endDate,
    totalDays,
    periodReturn,
    cagr,
    growthOf1,
    ytdReturn,
    oneYearReturn,
    threeYearReturn,
    maxDrawdown,
    maxDrawdownDate,
    currentDrawdown,
    toReturnToATH,
    longestDrawdownDays,
    startPrice,
    endPrice,
    minPrice,
    minPriceDate,
    maxPrice,
    maxPriceDate,
    profitSessions,
    lossSessions,
    avgProfitSession,
    avgLossSession,
    annualizedStd: annualizedStd * 100, // Convert to percentage
    sharpeRatio,
  };
}

function calculateDrawdowns(data: StooqDataPoint[]): {
  maxDrawdown: number;
  maxDrawdownDate: string;
  currentDrawdown: number;
  longestDrawdownDays: number;
} {
  let peak = data[0].close;
  let peakDate = data[0].date;
  let maxDrawdown = 0;
  let maxDrawdownDate = data[0].date;
  let longestDrawdownDays = 0;
  let currentDrawdownStartDate = data[0].date;

  for (let i = 0; i < data.length; i++) {
    const point = data[i];

    if (point.close > peak) {
      // New peak - calculate calendar days of the completed drawdown period
      const drawdownDays = Math.ceil(
        (new Date(point.date).getTime() - new Date(currentDrawdownStartDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (drawdownDays > longestDrawdownDays) {
        longestDrawdownDays = drawdownDays;
      }
      peak = point.close;
      peakDate = point.date;
      currentDrawdownStartDate = point.date;
    } else {
      // In drawdown
      const drawdown = ((peak - point.close) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownDate = point.date;
      }
    }
  }

  // Check if current ongoing period is the longest drawdown (using calendar days)
  const lastDate = data[data.length - 1].date;
  const finalDrawdownDays = Math.ceil(
    (new Date(lastDate).getTime() - new Date(currentDrawdownStartDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (finalDrawdownDays > longestDrawdownDays) {
    longestDrawdownDays = finalDrawdownDays;
  }

  // Current drawdown
  const currentDrawdown = ((peak - data[data.length - 1].close) / peak) * 100;

  return {
    maxDrawdown,
    maxDrawdownDate,
    currentDrawdown,
    longestDrawdownDays,
  };
}

function calculateSessionStats(data: StooqDataPoint[]): {
  profitSessions: number;
  lossSessions: number;
  avgProfitSession: number;
  avgLossSession: number;
  dailyReturns: number[];
} {
  const dailyReturns: number[] = [];
  let profitSessions = 0;
  let lossSessions = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    const currClose = data[i].close;
    const dailyReturn = (currClose - prevClose) / prevClose;
    dailyReturns.push(dailyReturn);

    if (dailyReturn > 0) {
      profitSessions++;
      totalProfit += dailyReturn;
    } else if (dailyReturn < 0) {
      lossSessions++;
      totalLoss += dailyReturn;
    }
  }

  const avgProfitSession = profitSessions > 0
    ? (totalProfit / profitSessions) * 100
    : 0;
  const avgLossSession = lossSessions > 0
    ? (totalLoss / lossSessions) * 100
    : 0;

  return {
    profitSessions,
    lossSessions,
    avgProfitSession,
    avgLossSession,
    dailyReturns,
  };
}

function calculateAnnualizedStd(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const squaredDiffs = dailyReturns.map(r => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (dailyReturns.length - 1);
  const dailyStd = Math.sqrt(variance);

  return dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function calculatePeriodReturns(data: StooqDataPoint[]): {
  ytdReturn: number | null;
  oneYearReturn: number | null;
  threeYearReturn: number | null;
} {
  if (data.length < 2) {
    return { ytdReturn: null, oneYearReturn: null, threeYearReturn: null };
  }

  // Sort data to ensure chronological order
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const endPrice = sortedData[sortedData.length - 1].close;
  const endDateStr = sortedData[sortedData.length - 1].date;
  const endYear = parseInt(endDateStr.substring(0, 4));

  // Group data by year-month to find last price of each month
  const lastPriceByYearMonth = new Map<string, number>();
  for (const point of sortedData) {
    const year = parseInt(point.date.substring(0, 4));
    const month = parseInt(point.date.substring(5, 7)) - 1; // 0-indexed
    const key = `${year}-${month}`;
    lastPriceByYearMonth.set(key, point.close);
  }

  // YTD: last price in current data vs last price of Dec prior year
  // This matches the annual return calculation in the returns table
  const decPriorYearKey = `${endYear - 1}-11`; // December (month 11) of prior year
  const ytdStartPrice = lastPriceByYearMonth.get(decPriorYearKey);
  const ytdReturn = ytdStartPrice !== undefined
    ? ((endPrice - ytdStartPrice) / ytdStartPrice) * 100
    : null;

  // Helper to find price closest to a target date string (but not after it)
  const findPriceAtDate = (targetDateStr: string): number | null => {
    for (let i = sortedData.length - 1; i >= 0; i--) {
      if (sortedData[i].date <= targetDateStr) {
        return sortedData[i].close;
      }
    }
    return null;
  };

  // 1Y: from 1 year ago to current date
  const oneYearAgoStr = `${endYear - 1}-${endDateStr.substring(5)}`;
  const oneYearStartPrice = findPriceAtDate(oneYearAgoStr);
  const oneYearReturn = oneYearStartPrice !== null
    ? ((endPrice - oneYearStartPrice) / oneYearStartPrice) * 100
    : null;

  // 3Y: from 3 years ago to current date
  const threeYearsAgoStr = `${endYear - 3}-${endDateStr.substring(5)}`;
  const threeYearStartPrice = findPriceAtDate(threeYearsAgoStr);
  const threeYearReturn = threeYearStartPrice !== null
    ? ((endPrice - threeYearStartPrice) / threeYearStartPrice) * 100
    : null;

  return { ytdReturn, oneYearReturn, threeYearReturn };
}

export function normalizeDataForChart(tickersData: TickerData[]): ChartDataPoint[] {
  if (tickersData.length === 0) return [];

  // Find the earliest common date across all tickers
  const allDates = new Set<string>();
  const tickerDateMap = new Map<string, Map<string, number>>();

  for (const tickerData of tickersData) {
    const dateMap = new Map<string, number>();
    for (const point of tickerData.data) {
      allDates.add(point.date);
      dateMap.set(point.date, point.close);
    }
    tickerDateMap.set(tickerData.ticker, dateMap);
  }

  // Sort dates
  const sortedDates = Array.from(allDates).sort();

  // Find first date where all tickers have data
  let commonStartDate: string | null = null;
  for (const date of sortedDates) {
    const allHaveData = tickersData.every(td =>
      tickerDateMap.get(td.ticker)?.has(date)
    );
    if (allHaveData) {
      commonStartDate = date;
      break;
    }
  }

  if (!commonStartDate) {
    // Fall back to first date of first ticker
    commonStartDate = tickersData[0].data[0].date;
  }

  // Get base prices for normalization
  const basePrices = new Map<string, number>();
  for (const tickerData of tickersData) {
    const dateMap = tickerDateMap.get(tickerData.ticker)!;
    const basePrice = dateMap.get(commonStartDate) || tickerData.data[0].close;
    basePrices.set(tickerData.ticker, basePrice);
  }

  // Build chart data
  const chartData: ChartDataPoint[] = [];
  const startIndex = sortedDates.indexOf(commonStartDate);

  for (let i = startIndex; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const point: ChartDataPoint = { date };

    for (const tickerData of tickersData) {
      const dateMap = tickerDateMap.get(tickerData.ticker)!;
      const price = dateMap.get(date);
      const basePrice = basePrices.get(tickerData.ticker)!;

      if (price !== undefined) {
        // For single ticker, use actual prices; for multiple, normalize to 100
        if (tickersData.length === 1) {
          point[tickerData.ticker] = price;
        } else {
          point[tickerData.ticker] = (price / basePrice) * 100;
        }
      }
    }

    // Only include dates where at least one ticker has data
    if (Object.keys(point).length > 1) {
      chartData.push(point);
    }
  }

  return chartData;
}

export function findExtremes(data: StooqDataPoint[]): {
  highPoint: { date: string; price: number };
  lowPoint: { date: string; price: number };
} {
  let highPoint = { date: data[0].date, price: data[0].close };
  let lowPoint = { date: data[0].date, price: data[0].close };

  for (const point of data) {
    if (point.close > highPoint.price) {
      highPoint = { date: point.date, price: point.close };
    }
    if (point.close < lowPoint.price) {
      lowPoint = { date: point.date, price: point.close };
    }
  }

  return { highPoint, lowPoint };
}

export function filterDataByDateRange(
  data: StooqDataPoint[],
  startDate: string,
  endDate: string
): StooqDataPoint[] {
  return data.filter((point) => point.date >= startDate && point.date <= endDate);
}

export function getDateRange(tickersData: TickerData[]): { minDate: string; maxDate: string } {
  if (tickersData.length === 0) {
    return { minDate: '', maxDate: '' };
  }

  let minDate = tickersData[0].data[0]?.date || '';
  let maxDate = tickersData[0].data[tickersData[0].data.length - 1]?.date || '';

  for (const tickerData of tickersData) {
    if (tickerData.data.length > 0) {
      const firstDate = tickerData.data[0].date;
      const lastDate = tickerData.data[tickerData.data.length - 1].date;

      if (firstDate > minDate) minDate = firstDate;
      if (lastDate < maxDate) maxDate = lastDate;
    }
  }

  return { minDate, maxDate };
}

export interface DrawdownDataPoint {
  date: string;
  drawdown: number;
}

export interface DrawdownSeries {
  data: DrawdownDataPoint[];
  maxDrawdown: number;
  maxDrawdownDate: string;
  currentDrawdown: number;
}

export function calculateDrawdownSeries(data: StooqDataPoint[]): DrawdownSeries {
  if (data.length === 0) {
    return { data: [], maxDrawdown: 0, maxDrawdownDate: '', currentDrawdown: 0 };
  }

  const drawdownData: DrawdownDataPoint[] = [];
  let peak = data[0].close;
  let maxDrawdown = 0;
  let maxDrawdownDate = data[0].date;

  for (const point of data) {
    if (point.close > peak) {
      peak = point.close;
    }

    // Drawdown as negative percentage (0% = at peak, -X% = X% below peak)
    const drawdown = -((peak - point.close) / peak) * 100;

    drawdownData.push({
      date: point.date,
      drawdown,
    });

    // Track max drawdown (most negative value)
    if (drawdown < -maxDrawdown) {
      maxDrawdown = -drawdown;
      maxDrawdownDate = point.date;
    }
  }

  const currentDrawdown = drawdownData.length > 0
    ? -drawdownData[drawdownData.length - 1].drawdown
    : 0;

  return {
    data: drawdownData,
    maxDrawdown,
    maxDrawdownDate,
    currentDrawdown,
  };
}

// Monthly/Annual returns table types and calculations
export interface ReturnCalcDetail {
  returnValue: number | null;
  startPrice: number | null;
  endPrice: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface YearlyData {
  year: number;
  monthlyReturns: (number | null)[]; // 12 months, index 0 = Jan
  monthlyDetails: ReturnCalcDetail[]; // 12 months with price details
  annualReturn: number | null;
  annualDetail: ReturnCalcDetail; // Price details for annual return
  annualStd: number | null;
  maxDrawdown: number | null;
  athCount: number; // Number of new all-time highs reached in this year
}

export interface ReturnsTableData {
  years: YearlyData[];
}

export function calculateReturnsTable(data: StooqDataPoint[]): ReturnsTableData {
  if (data.length < 2) {
    return { years: [] };
  }

  // Group data by year and month, storing last price and date of each month
  const lastPriceByYearMonth = new Map<string, number>();
  const lastDateByYearMonth = new Map<string, string>();
  const dataByYearMonth = new Map<string, StooqDataPoint[]>();

  for (const point of data) {
    const date = new Date(point.date);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const key = `${year}-${month}`;

    if (!dataByYearMonth.has(key)) {
      dataByYearMonth.set(key, []);
    }
    dataByYearMonth.get(key)!.push(point);
  }

  // Sort each month's data and get last price and date
  Array.from(dataByYearMonth.entries()).forEach(([key, monthData]) => {
    monthData.sort((a, b) => a.date.localeCompare(b.date));
    const lastPoint = monthData[monthData.length - 1];
    lastPriceByYearMonth.set(key, lastPoint.close);
    lastDateByYearMonth.set(key, lastPoint.date);
  });

  // Get unique years sorted
  const years = [...new Set(data.map(d => new Date(d.date).getFullYear()))].sort();

  // Calculate ATH counts per year (new all-time highs reached)
  // Sort all data chronologically first
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const athCountByYear = new Map<number, number>();
  let globalATH = sortedData[0].close;

  for (const point of sortedData) {
    const year = new Date(point.date).getFullYear();
    if (point.close > globalATH) {
      globalATH = point.close;
      athCountByYear.set(year, (athCountByYear.get(year) || 0) + 1);
    }
  }

  const result: YearlyData[] = [];

  for (const year of years) {
    const monthlyReturns: (number | null)[] = new Array(12).fill(null);
    const monthlyDetails: ReturnCalcDetail[] = new Array(12).fill(null).map(() => ({
      returnValue: null,
      startPrice: null,
      endPrice: null,
      startDate: null,
      endDate: null,
    }));
    const yearDataPoints: StooqDataPoint[] = [];

    // Calculate monthly returns (last price current month vs last price prior month)
    for (let month = 0; month < 12; month++) {
      const key = `${year}-${month}`;
      const monthData = dataByYearMonth.get(key);

      if (monthData && monthData.length >= 1) {
        yearDataPoints.push(...monthData);

        // Get prior month's last price
        let priorKey: string;
        if (month === 0) {
          // January: compare to December of prior year
          priorKey = `${year - 1}-11`;
        } else {
          priorKey = `${year}-${month - 1}`;
        }

        const priorPrice = lastPriceByYearMonth.get(priorKey);
        const priorDate = lastDateByYearMonth.get(priorKey);
        const currentPrice = lastPriceByYearMonth.get(key);
        const currentDate = lastDateByYearMonth.get(key);

        if (priorPrice !== undefined && currentPrice !== undefined) {
          const returnValue = ((currentPrice - priorPrice) / priorPrice) * 100;
          monthlyReturns[month] = returnValue;
          monthlyDetails[month] = {
            returnValue,
            startPrice: priorPrice,
            endPrice: currentPrice,
            startDate: priorDate || null,
            endDate: currentDate || null,
          };
        }
      }
    }

    // Calculate annual return (last price Dec current year vs last price Dec prior year)
    // For partial years: last available price vs last price Dec prior year
    let annualReturn: number | null = null;
    let annualDetail: ReturnCalcDetail = {
      returnValue: null,
      startPrice: null,
      endPrice: null,
      startDate: null,
      endDate: null,
    };
    const decPriorKey = `${year - 1}-11`; // December of prior year
    const decPriorPrice = lastPriceByYearMonth.get(decPriorKey);
    const decPriorDate = lastDateByYearMonth.get(decPriorKey);

    // Get last available price and date in current year
    let lastPriceCurrentYear: number | undefined;
    let lastDateCurrentYear: string | undefined;
    for (let m = 11; m >= 0; m--) {
      const price = lastPriceByYearMonth.get(`${year}-${m}`);
      const date = lastDateByYearMonth.get(`${year}-${m}`);
      if (price !== undefined) {
        lastPriceCurrentYear = price;
        lastDateCurrentYear = date;
        break;
      }
    }

    if (lastPriceCurrentYear !== undefined && decPriorPrice !== undefined) {
      // Compare last available price in year to Dec of prior year
      annualReturn = ((lastPriceCurrentYear - decPriorPrice) / decPriorPrice) * 100;
      annualDetail = {
        returnValue: annualReturn,
        startPrice: decPriorPrice,
        endPrice: lastPriceCurrentYear,
        startDate: decPriorDate || null,
        endDate: lastDateCurrentYear || null,
      };
    } else if (yearDataPoints.length >= 2) {
      // Fallback for first year: use first to last price within year
      yearDataPoints.sort((a, b) => a.date.localeCompare(b.date));
      const firstPrice = yearDataPoints[0].close;
      const lastPrice = yearDataPoints[yearDataPoints.length - 1].close;
      annualReturn = ((lastPrice - firstPrice) / firstPrice) * 100;
      annualDetail = {
        returnValue: annualReturn,
        startPrice: firstPrice,
        endPrice: lastPrice,
        startDate: yearDataPoints[0].date,
        endDate: yearDataPoints[yearDataPoints.length - 1].date,
      };
    }

    // Calculate annual standard deviation (volatility) of daily returns
    let annualStd: number | null = null;
    if (yearDataPoints.length >= 2) {
      yearDataPoints.sort((a, b) => a.date.localeCompare(b.date));
      const dailyReturns: number[] = [];
      for (let i = 1; i < yearDataPoints.length; i++) {
        const prevClose = yearDataPoints[i - 1].close;
        const currClose = yearDataPoints[i].close;
        dailyReturns.push((currClose - prevClose) / prevClose);
      }

      if (dailyReturns.length >= 2) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const squaredDiffs = dailyReturns.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (dailyReturns.length - 1);
        const dailyStd = Math.sqrt(variance);
        // Annualize: multiply by sqrt(252 trading days)
        annualStd = dailyStd * Math.sqrt(252) * 100;
      }
    }

    // Calculate max drawdown within the year
    let maxDrawdown: number | null = null;
    if (yearDataPoints.length >= 2) {
      yearDataPoints.sort((a, b) => a.date.localeCompare(b.date));
      let peak = yearDataPoints[0].close;
      let maxDD = 0;

      for (const point of yearDataPoints) {
        if (point.close > peak) {
          peak = point.close;
        }
        const dd = ((peak - point.close) / peak) * 100;
        if (dd > maxDD) {
          maxDD = dd;
        }
      }
      maxDrawdown = maxDD;
    }

    result.push({
      year,
      monthlyReturns,
      monthlyDetails,
      annualReturn,
      annualDetail,
      annualStd,
      maxDrawdown,
      athCount: athCountByYear.get(year) || 0,
    });
  }

  return { years: result };
}

// ============================================
// ROLLING RETURNS CALCULATION
// ============================================

export function calculateRollingReturns(
  data: StooqDataPoint[],
  rollingYears: number
): RollingReturnDataPoint[] {
  if (data.length === 0 || rollingYears < 1) return [];

  const result: RollingReturnDataPoint[] = [];
  let startIdx = 0;

  for (let i = 0; i < data.length; i++) {
    const endDate = new Date(data[i].date);
    const targetDate = new Date(endDate);
    targetDate.setFullYear(targetDate.getFullYear() - rollingYears);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    // Advance startIdx to find closest trading day on or before targetDate
    while (startIdx < i - 1 && data[startIdx + 1].date <= targetDateStr) {
      startIdx++;
    }

    // Skip if we don't have data going back far enough
    if (data[startIdx].date > targetDateStr) continue;

    const startPrice = data[startIdx].close;
    const endPrice = data[i].close;
    if (startPrice <= 0) continue;

    // Calculate CAGR using actual year fraction
    const startDateObj = new Date(data[startIdx].date);
    const years = (endDate.getTime() - startDateObj.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0) continue;

    const cagr = rollingYears === 1
      ? (endPrice / startPrice - 1) * 100
      : (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100;

    result.push({
      date: data[i].date,
      rollingCagr: cagr,
      startDate: data[startIdx].date,
      startPrice,
      endPrice,
    });
  }

  return result;
}

// ============================================
// TREND FOLLOWING STRATEGY CALCULATIONS
// ============================================

/**
 * Extract the last trading day price for each month
 */
function extractMonthlyEndPrices(data: StooqDataPoint[]): MonthlyDataPoint[] {
  if (data.length === 0) return [];

  // Sort data chronologically
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));

  // Group by year-month and get last price
  const monthlyMap = new Map<string, { date: string; price: number }>();

  for (const point of sortedData) {
    const yearMonth = point.date.substring(0, 7); // "YYYY-MM"
    monthlyMap.set(yearMonth, { date: point.date, price: point.close });
  }

  // Convert to array sorted by date
  const monthlyPrices = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  return monthlyPrices.map((mp) => ({
    date: mp.date,
    price: mp.price,
    sma10: null,
    signal: null,
  }));
}

/**
 * Calculate 10-month SMA and generate BUY/SELL signals
 */
function calculateMonthlySignals(monthlyPrices: MonthlyDataPoint[]): MonthlyDataPoint[] {
  const result: MonthlyDataPoint[] = [];

  for (let i = 0; i < monthlyPrices.length; i++) {
    const current = monthlyPrices[i];

    // Calculate 10-month SMA (need at least 10 months of data)
    let sma10: number | null = null;
    if (i >= 9) {
      let sum = 0;
      for (let j = i - 9; j <= i; j++) {
        sum += monthlyPrices[j].price;
      }
      sma10 = sum / 10;
    }

    // Generate signal: BUY if price > SMA, SELL if price < SMA
    let signal: TrendSignal | null = null;
    if (sma10 !== null) {
      signal = current.price > sma10 ? 'BUY' : 'SELL';
    }

    result.push({
      date: current.date,
      price: current.price,
      sma10,
      signal,
    });
  }

  return result;
}

/**
 * Build daily equity curves for both Buy & Hold and Trend Following strategies
 */
function calculateTrendFollowingEquity(
  dailyData: StooqDataPoint[],
  monthlySignals: MonthlyDataPoint[],
  riskFreeRate: number,
  commission: number
): {
  chartData: TrendFollowingChartPoint[];
  signalDates: { date: string; signal: TrendSignal }[];
} {
  // Calculate daily cash return from annual risk-free rate
  const dailyCashReturn = Math.pow(1 + riskFreeRate, 1 / TRADING_DAYS_PER_YEAR) - 1;
  if (dailyData.length === 0 || monthlySignals.length < 10) {
    return { chartData: [], signalDates: [] };
  }

  // Sort daily data chronologically
  const sortedDaily = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));

  // Create a map of month-end signals
  const signalMap = new Map<string, { signal: TrendSignal; sma10: number }>();
  for (const mp of monthlySignals) {
    if (mp.signal !== null && mp.sma10 !== null) {
      const yearMonth = mp.date.substring(0, 7);
      signalMap.set(yearMonth, { signal: mp.signal, sma10: mp.sma10 });
    }
  }

  // Find the first date where we have a signal (need 10 months of history)
  const firstSignalDate = monthlySignals.find((mp) => mp.signal !== null)?.date;
  if (!firstSignalDate) {
    return { chartData: [], signalDates: [] };
  }

  // Filter daily data to start from first signal date
  const startIndex = sortedDaily.findIndex((d) => d.date >= firstSignalDate);
  if (startIndex === -1) {
    return { chartData: [], signalDates: [] };
  }

  const relevantDaily = sortedDaily.slice(startIndex);
  if (relevantDaily.length === 0) {
    return { chartData: [], signalDates: [] };
  }

  const chartData: TrendFollowingChartPoint[] = [];
  const signalDates: { date: string; signal: TrendSignal }[] = [];

  // Initialize both strategies at $1
  let buyHoldValue = 1;
  let trendFollowingValue = 1;
  const basePrice = relevantDaily[0].close;
  let prevPrice = basePrice;

  // Get initial signal from the month before or same month
  let currentSignal: TrendSignal = 'SELL'; // Default to out of market
  const firstDayMonth = relevantDaily[0].date.substring(0, 7);

  // Look for the most recent signal at or before the start date
  for (const mp of monthlySignals) {
    if (mp.signal !== null && mp.date <= relevantDaily[0].date) {
      currentSignal = mp.signal;
    }
  }

  let lastSignal = currentSignal;

  for (let i = 0; i < relevantDaily.length; i++) {
    const day = relevantDaily[i];
    const currentMonth = day.date.substring(0, 7);

    // Check if we need to update signal (at month end / start of new month)
    // We look at the previous month's signal
    const prevMonth = i > 0 ? relevantDaily[i - 1].date.substring(0, 7) : null;

    if (prevMonth && prevMonth !== currentMonth) {
      // New month started - check previous month's signal
      const prevMonthSignal = signalMap.get(prevMonth);
      if (prevMonthSignal) {
        currentSignal = prevMonthSignal.signal;

        // Record signal change and apply commission
        if (currentSignal !== lastSignal) {
          // Apply commission on signal change
          trendFollowingValue *= (1 - commission);
          signalDates.push({ date: day.date, signal: currentSignal });
          lastSignal = currentSignal;
        }
      }
    }

    // Calculate daily returns
    const dailyReturn = (day.close - prevPrice) / prevPrice;

    // Buy & Hold: always tracks the asset
    buyHoldValue = (day.close / basePrice);

    // Trend Following: tracks asset if BUY signal, earns cash rate if SELL
    if (i > 0) {
      if (currentSignal === 'BUY') {
        // Invested: track asset return
        trendFollowingValue = trendFollowingValue * (1 + dailyReturn);
      } else {
        // Out of market: earn daily cash rate
        trendFollowingValue = trendFollowingValue * (1 + dailyCashReturn);
      }
    }

    // Get SMA for this date (from the most recent month-end)
    let sma10ForDate: number | null = null;
    for (const mp of monthlySignals) {
      if (mp.date <= day.date && mp.sma10 !== null) {
        sma10ForDate = mp.sma10;
      }
    }

    // Normalize SMA to same scale as price chart (growth of $1)
    const normalizedSma10 = sma10ForDate !== null ? sma10ForDate / basePrice : null;

    chartData.push({
      date: day.date,
      buyHold: buyHoldValue,
      trendFollowing: trendFollowingValue,
      sma10: normalizedSma10,
      signal: currentSignal,
    });

    prevPrice = day.close;
  }

  return { chartData, signalDates };
}

/**
 * Calculate drawdowns for both strategies
 */
function calculateTrendFollowingDrawdowns(
  chartData: TrendFollowingChartPoint[]
): TrendFollowingDrawdownPoint[] {
  if (chartData.length === 0) return [];

  const drawdownData: TrendFollowingDrawdownPoint[] = [];

  let buyHoldPeak = chartData[0].buyHold;
  let trendFollowingPeak = chartData[0].trendFollowing;

  for (const point of chartData) {
    // Update peaks
    if (point.buyHold > buyHoldPeak) {
      buyHoldPeak = point.buyHold;
    }
    if (point.trendFollowing > trendFollowingPeak) {
      trendFollowingPeak = point.trendFollowing;
    }

    // Calculate drawdowns (as negative percentages)
    const buyHoldDrawdown = -((buyHoldPeak - point.buyHold) / buyHoldPeak) * 100;
    const trendFollowingDrawdown =
      -((trendFollowingPeak - point.trendFollowing) / trendFollowingPeak) * 100;

    drawdownData.push({
      date: point.date,
      buyHoldDrawdown,
      trendFollowingDrawdown,
    });
  }

  return drawdownData;
}

/**
 * Calculate strategy statistics (CAGR, Sharpe, etc.)
 */
function calculateStrategyStatistics(
  equityCurve: number[],
  dates: string[],
  riskFreeRate: number
): StrategyStatistics {
  if (equityCurve.length < 2) {
    return {
      finalAmount: 1,
      cagr: 0,
      totalReturn: 0,
      annualizedStd: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      sharpeRatio: 0,
    };
  }

  const finalAmount = equityCurve[equityCurve.length - 1];
  const totalReturn = (finalAmount - 1) * 100;

  // Calculate years for CAGR
  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[dates.length - 1]);
  const years = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const cagr = years > 0 ? (Math.pow(finalAmount, 1 / years) - 1) * 100 : 0;

  // Calculate daily returns for std dev
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  // Annualized standard deviation
  let annualizedStd = 0;
  if (dailyReturns.length >= 2) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const squaredDiffs = dailyReturns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (dailyReturns.length - 1);
    const dailyStd = Math.sqrt(variance);
    annualizedStd = dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  }

  // Max drawdown and current drawdown
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const value of equityCurve) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const currentPeak = Math.max(...equityCurve);
  const currentDrawdown = ((currentPeak - finalAmount) / currentPeak) * 100;

  // Sharpe ratio
  const annualizedReturn = cagr / 100;
  const sharpeRatio =
    annualizedStd > 0 ? (annualizedReturn - riskFreeRate) / (annualizedStd / 100) : 0;

  return {
    finalAmount,
    cagr,
    totalReturn,
    annualizedStd,
    maxDrawdown,
    currentDrawdown,
    sharpeRatio,
  };
}

/**
 * Main function to calculate complete trend following analysis
 */
export function calculateTrendFollowingAnalysis(
  data: StooqDataPoint[],
  riskFreeRate: number = 0.02,  // Default 2%
  commission: number = 0        // Default 0%
): TrendFollowingAnalysis | null {
  if (data.length < 252) {
    // Need at least ~1 year of data
    return null;
  }

  // Step 1: Extract monthly end prices
  const monthlyPrices = extractMonthlyEndPrices(data);

  // Need at least 12 months for meaningful analysis
  if (monthlyPrices.length < 12) {
    return null;
  }

  // Step 2: Calculate monthly signals with 10-month SMA
  const monthlySignals = calculateMonthlySignals(monthlyPrices);

  // Step 3: Build daily equity curves
  const { chartData, signalDates } = calculateTrendFollowingEquity(data, monthlySignals, riskFreeRate, commission);

  if (chartData.length === 0) {
    return null;
  }

  // Step 4: Calculate drawdowns
  const drawdownData = calculateTrendFollowingDrawdowns(chartData);

  // Step 5: Calculate statistics for both strategies
  const buyHoldEquity = chartData.map((p) => p.buyHold);
  const trendFollowingEquity = chartData.map((p) => p.trendFollowing);
  const dates = chartData.map((p) => p.date);

  const buyHoldStats = calculateStrategyStatistics(buyHoldEquity, dates, riskFreeRate);
  const trendFollowingStats = calculateStrategyStatistics(trendFollowingEquity, dates, riskFreeRate);

  // Current signal
  const currentSignal = chartData[chartData.length - 1].signal || 'SELL';

  return {
    chartData,
    drawdownData,
    buyHoldStats,
    trendFollowingStats,
    currentSignal,
    signalDates,
  };
}
