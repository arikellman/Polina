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

  return { init, signIn, isSignedIn, extractSpreadsheetId, getValues, updateRunningTable };
})();
