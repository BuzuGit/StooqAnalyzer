import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { TickerData, StooqDataPoint, Statistics } from '@/lib/types';
import {
  buildDailyRows,
  buildPeriodicRows,
  buildStatsRows,
  ExportRow,
  StatExportRow,
} from '@/lib/exportData';

export const runtime = 'nodejs';

const PRICE_FMT = '#,##0.0000';
const VOLUME_FMT = '#,##0';
const PCT_FMT = '0.00%';

function sanitizeSheetName(name: string): string {
  // Excel forbids : \ / ? * [ ] and caps names at 31 chars.
  return name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: ExportRow[]): void {
  const sheet = workbook.addWorksheet(sanitizeSheetName(name));
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Open', key: 'open', width: 12, style: { numFmt: PRICE_FMT } },
    { header: 'High', key: 'high', width: 12, style: { numFmt: PRICE_FMT } },
    { header: 'Low', key: 'low', width: 12, style: { numFmt: PRICE_FMT } },
    { header: 'Close', key: 'close', width: 12, style: { numFmt: PRICE_FMT } },
    { header: 'Adj Close', key: 'adjClose', width: 12, style: { numFmt: PRICE_FMT } },
    { header: 'Volume', key: 'volume', width: 14, style: { numFmt: VOLUME_FMT } },
    { header: '% Change', key: 'pctChange', width: 11, style: { numFmt: PCT_FMT } },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    sheet.addRow({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      adjClose: r.adjClose ?? null,
      volume: r.volume,
      pctChange: r.pctChange ?? null,
    });
  }
}

/** Statistics tab: Metric | Value | Detail, with a bold heading before each section. */
function addStatsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: StatExportRow[]
): void {
  const sheet = workbook.addWorksheet(sanitizeSheetName(name));
  sheet.columns = [
    { header: 'Metric', key: 'label', width: 20 },
    { header: 'Value', key: 'value', width: 16 },
    { header: 'Detail', key: 'detail', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  let currentSection = '';
  for (const row of rows) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      const heading = sheet.addRow({ label: currentSection });
      heading.font = { bold: true };
    }
    const added = sheet.addRow({
      label: row.label,
      value: row.value,
      detail: row.detail ?? null,
    });
    // Formats go on the cell, not the column — the Value column mixes percentages,
    // prices, plain numbers and text.
    const valueCell = added.getCell('value');
    if (row.kind === 'percent') valueCell.numFmt = PCT_FMT;
    else if (row.kind === 'price') valueCell.numFmt = PRICE_FMT;
    else if (row.kind === 'integer') valueCell.numFmt = VOLUME_FMT;
    else if (row.kind === 'number') valueCell.numFmt = '#,##0.00';
  }
}

export async function POST(request: NextRequest) {
  let body: {
    tickers?: TickerData[];
    statistics?: Statistics[];
    priceBasis?: 'close' | 'adjClose';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const tickers = body.tickers;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return NextResponse.json({ error: 'No ticker data provided' }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const priceBasis = body.priceBasis === 'adjClose' ? 'adjClose' : 'close';
  // Keyed by ticker so a stats entry lands on its own ticker's sheet regardless of
  // the order the two arrays arrive in.
  const statsByTicker = new Map<string, Statistics>();
  for (const s of body.statistics ?? []) {
    if (s?.ticker) statsByTicker.set(s.ticker, s);
  }

  for (const td of tickers) {
    if (!td?.ticker || !Array.isArray(td.data) || td.data.length === 0) continue;
    const data = td.data as StooqDataPoint[];
    // Summary first, then the underlying series.
    const stats = statsByTicker.get(td.ticker);
    if (stats) {
      addStatsSheet(workbook, `${td.ticker}_stats`, buildStatsRows(stats, { priceBasis }));
    }
    addSheet(workbook, `${td.ticker}_data`, buildDailyRows(data));
    addSheet(workbook, `${td.ticker}_monthly`, buildPeriodicRows(data, 'month'));
    addSheet(workbook, `${td.ticker}_yearly`, buildPeriodicRows(data, 'year'));
  }

  if (workbook.worksheets.length === 0) {
    return NextResponse.json({ error: 'No usable ticker data' }, { status: 400 });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${tickers.map((t) => t.ticker).join('_')}_export.xlsx`;

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
