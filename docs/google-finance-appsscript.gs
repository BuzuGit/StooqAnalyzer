/**
 * Google Finance proxy for StooqAnalyzer.
 *
 * Turns a Google Sheet into a tiny JSON API over GOOGLEFINANCE(), so the app can
 * request arbitrary tickers on demand.
 *
 * SETUP
 *   1. Create a blank Google Sheet (sheets.new).
 *   2. Extensions -> Apps Script. Delete the sample code, paste THIS file, Save.
 *   3. Deploy -> New deployment -> gear icon -> "Web app".
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Deploy, then authorize (allow the permissions it asks for).
 *   4. Copy the Web app URL (ends in /exec).
 *   5. In Vercel -> StooqAnalyzer -> Settings -> Environment Variables, add:
 *        GOOGLE_FINANCE_URL = <that /exec URL>
 *      Then Redeploy.
 *
 * CALL FORMAT (the app builds this for you)
 *   <url>?ticker=NASDAQ:AAPL      also: WSE:KGH, LON:VOD, ETR:SAP, CURRENCY:USDPLN
 */
function doGet(e) {
  var ticker = ((e && e.parameter && e.parameter.ticker) || '').replace(/"/g, '').trim();
  if (!ticker) return out({ error: 'missing ticker' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return out({ error: 'busy, try again' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('_fetch') || ss.insertSheet('_fetch');
    sheet.clearContents();
    sheet.getRange('A1').setFormula(
      '=GOOGLEFINANCE("' + ticker + '","all",DATE(1990,1,1),TODAY(),"DAILY")'
    );
    SpreadsheetApp.flush();

    // GOOGLEFINANCE may need a moment to populate the range.
    var values = sheet.getDataRange().getValues();
    for (var t = 0; t < 15 && values.length < 2; t++) {
      Utilities.sleep(400);
      values = sheet.getDataRange().getValues();
    }
    // Row 0 is the header (Date/Open/High/Low/Close/Volume); row 1 must be a Date.
    if (values.length < 2 || !(values[1][0] instanceof Date)) {
      return out({ error: 'no data for ' + ticker });
    }

    var tz = ss.getSpreadsheetTimeZone();
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var d = values[i][0];
      if (!(d instanceof Date)) continue;
      rows.push({
        date: Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
        open: values[i][1],
        high: values[i][2],
        low: values[i][3],
        close: values[i][4],
        volume: values[i][5]
      });
    }
    return out({ ticker: ticker, rows: rows });
  } catch (err) {
    return out({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
