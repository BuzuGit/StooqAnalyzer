import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { TickerData, StooqDataPoint } from '@/lib/types';
import { buildDailyRows, buildPeriodicRows, ExportRow } from '@/lib/exportData';

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

export async function POST(request: NextRequest) {
  let body: { tickers?: TickerData[] };
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

  for (const td of tickers) {
    if (!td?.ticker || !Array.isArray(td.data) || td.data.length === 0) continue;
    const data = td.data as StooqDataPoint[];
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
