// Thin wrapper around Google Identity Services (auth) and the Sheets REST API.
// No backend involved: an OAuth access token is requested in the browser and
// used directly against sheets.googleapis.com.

const SheetsApi = (() => {
  let tokenClient = null;
  let accessToken = null;

  function init(onReady) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      callback: (resp) => {
        if (resp.error) {
          onReady(new Error(resp.error));
          return;
        }
        accessToken = resp.access_token;
        onReady(null);
      },
    });
  }

  function signIn() {
    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  function isSignedIn() {
    return !!accessToken;
  }

  function authHeader() {
    if (!accessToken) throw new Error("Not signed in to Google yet.");
    return { Authorization: `Bearer ${accessToken}` };
  }

  function extractSpreadsheetId(urlOrId) {
    const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : urlOrId.trim();
  }

  async function getValues(spreadsheetId, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: authHeader() });
    if (!res.ok) throw new Error(`Failed to read sheet: ${await res.text()}`);
    const data = await res.json();
    return data.values || [];
  }

  async function ensureSheetExists(spreadsheetId, sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const res = await fetch(url, { headers: authHeader() });
    if (!res.ok) throw new Error(`Failed to read spreadsheet: ${await res.text()}`);
    const meta = await res.json();
    const exists = meta.sheets.some((s) => s.properties.title === sheetName);
    if (exists) return;

    const addUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const body = { requests: [{ addSheet: { properties: { title: sheetName } } }] };
    const addRes = await fetch(addUrl, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!addRes.ok) throw new Error(`Failed to create tab "${sheetName}": ${await addRes.text()}`);
  }

  function colToLetter(colIndex) {
    let letter = "";
    let n = colIndex + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  async function updateRunningTable({ spreadsheetId, sheetName, keyColumnHeader, monthLabel, totals }) {
    await ensureSheetExists(spreadsheetId, sheetName);

    const existing = await getValues(spreadsheetId, `'${sheetName}'!A1:ZZ10000`);
    let header = existing[0] ? [...existing[0]] : [keyColumnHeader];
    if (header.length === 0) header = [keyColumnHeader];
    if (header[0] !== keyColumnHeader) header[0] = keyColumnHeader;

    let monthCol = header.indexOf(monthLabel);
    if (monthCol === -1) {
      monthCol = header.length;
      header.push(monthLabel);
    }

    const rows = existing.slice(1).map((r) => [...r]);
    const keyRowIndex = new Map();
    rows.forEach((r, i) => keyRowIndex.set(r[0], i));

    const groupKeys = Object.keys(totals);
    for (const key of groupKeys) {
      let rowIdx = keyRowIndex.get(key);
      if (rowIdx === undefined) {
        rowIdx = rows.length;
        rows.push([key]);
        keyRowIndex.set(key, rowIdx);
      }
      const row = rows[rowIdx];
      while (row.length <= monthCol) row.push("");
      row[monthCol] = totals[key];
    }

    const lastCol = colToLetter(header.length - 1);
    const grid = [header, ...rows];
    const range = `'${sheetName}'!A1:${lastCol}${grid.length}`;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ range, majorDimension: "ROWS", values: grid }),
    });
    if (!res.ok) throw new Error(`Failed to write sheet: ${await res.text()}`);
    return { rowsWritten: grid.length, columnsWritten: header.length };
  }

  // Pure logic for the "grouped monthly total" layout, kept separate from
  // network calls so it can be unit-tested directly: given the two header
  // rows and the existing data rows, decide exactly which cells to write.
  // Never invents new month columns or sheets -- only ever targets a
  // "total" sub-column for a month that's already on the sheet.
  function planGroupedMonthlyTotalUpdate({ existing, keyColumnHeader, totalSubHeaderLabel, monthLabel, totals, sheetName }) {
    const monthHeaderRow = existing[0] || [];
    const subHeaderRow = existing[1] || [];

    const monthLabelText = monthLabel.trim();
    const monthStart = monthHeaderRow.findIndex((c) => (c || "").trim() === monthLabelText);
    if (monthStart === -1) {
      throw new Error(`Couldn't find "${monthLabelText}" in the header row of "${sheetName}". Check it matches the sheet's format exactly (e.g. "Aug 26").`);
    }
    let monthEnd = monthStart + 1;
    while (monthEnd < monthHeaderRow.length && !(monthHeaderRow[monthEnd] || "").trim()) monthEnd++;

    let totalCol = -1;
    for (let c = monthStart; c < monthEnd; c++) {
      if ((subHeaderRow[c] || "").trim() === totalSubHeaderLabel) {
        totalCol = c;
        break;
      }
    }
    if (totalCol === -1) {
      throw new Error(`Couldn't find a "${totalSubHeaderLabel}" column for ${monthLabelText} in "${sheetName}".`);
    }

    let keyCol = subHeaderRow.findIndex((c) => (c || "").trim() === keyColumnHeader);
    if (keyCol === -1) keyCol = 0;

    const dataStartRow = 2; // rows 0 and 1 are the two header rows
    const rows = existing.slice(dataStartRow).map((r) => [...r]);
    const keyRowIndex = new Map();
    rows.forEach((r, i) => {
      if (r[keyCol]) keyRowIndex.set(r[keyCol].trim(), i);
    });

    const cellUpdates = [];
    for (const [key, amount] of Object.entries(totals)) {
      let rowIdx = keyRowIndex.get(key);
      if (rowIdx === undefined) {
        rowIdx = rows.length;
        rows.push([]);
        keyRowIndex.set(key, rowIdx);
        cellUpdates.push({ row: rowIdx, col: keyCol, value: key });
      }
      cellUpdates.push({ row: rowIdx, col: totalCol, value: amount });
    }

    return cellUpdates.map(({ row, col, value }) => ({
      range: `'${sheetName}'!${colToLetter(col)}${dataStartRow + row + 1}`,
      values: [[value]],
    }));
  }

  async function updateGroupedMonthlyTotal({ spreadsheetId, sheetNameTemplate, keyColumnHeader, totalSubHeaderLabel, monthLabel, totals }) {
    const yearMatch = monthLabel.trim().match(/(\d{2})\s*$/);
    if (!yearMatch) {
      throw new Error(`Month label "${monthLabel}" doesn't end in a 2-digit year (e.g. "Aug 26"). Check the sheet's own header row for the exact format to use.`);
    }
    const sheetName = sheetNameTemplate.replace("{yy}", yearMatch[1]);

    const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: authHeader() });
    if (!meta.ok) throw new Error(`Failed to read spreadsheet: ${await meta.text()}`);
    const metaJson = await meta.json();
    if (!metaJson.sheets.some((s) => s.properties.title === sheetName)) {
      throw new Error(`Tab "${sheetName}" doesn't exist yet. Create it first (following the same layout as last year's tab), then try again.`);
    }

    const existing = await getValues(spreadsheetId, `'${sheetName}'!A1:ZZ2000`);
    const data = planGroupedMonthlyTotalUpdate({ existing, keyColumnHeader, totalSubHeaderLabel, monthLabel, totals, sheetName });

    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    if (!res.ok) throw new Error(`Failed to write sheet: ${await res.text()}`);
    return { sheetName, cellsWritten: data.length };
  }

  return { init, signIn, isSignedIn, extractSpreadsheetId, getValues, updateRunningTable, updateGroupedMonthlyTotal, planGroupedMonthlyTotalUpdate };
})();
