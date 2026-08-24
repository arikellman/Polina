// Turns an uploaded PDF/XLSX file (or a source Google Sheet) into a plain
// grid of rows/cells (array of arrays of strings) for the app to preview,
// let the user fix up, and then aggregate.

const TableExtract = (() => {
  async function fromPdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    const allItems = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        allItems.push({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          page: pageNum,
        });
      }
    }
    if (allItems.length === 0) return [];

    // Cluster x-positions into column bins shared across the whole document
    // so every row ends up with the same number of columns.
    const xs = [...new Set(allItems.map((it) => Math.round(it.x)))].sort((a, b) => a - b);
    const COL_GAP = 12;
    const bins = [];
    for (const x of xs) {
      if (bins.length === 0 || x - bins[bins.length - 1].end > COL_GAP) {
        bins.push({ start: x, end: x });
      } else {
        bins[bins.length - 1].end = x;
      }
    }
    const binIndexForX = (x) => {
      const rx = Math.round(x);
      let idx = bins.findIndex((b) => rx >= b.start - COL_GAP / 2 && rx <= b.end + COL_GAP / 2);
      if (idx === -1) {
        // fall back to nearest bin
        idx = bins.reduce((best, b, i) => (Math.abs(b.start - rx) < Math.abs(bins[best].start - rx) ? i : best), 0);
      }
      return idx;
    };

    // Cluster rows by page + rounded y (PDF y grows upward, so sort descending).
    const ROW_GAP = 3;
    const byPage = new Map();
    for (const it of allItems) {
      if (!byPage.has(it.page)) byPage.set(it.page, []);
      byPage.get(it.page).push(it);
    }

    const grid = [];
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
      const items = byPage.get(page).sort((a, b) => b.y - a.y || a.x - b.x);
      let currentRow = [];
      let currentY = null;
      for (const it of items) {
        if (currentY === null || Math.abs(it.y - currentY) <= ROW_GAP) {
          currentRow.push(it);
          currentY = currentY === null ? it.y : currentY;
        } else {
          grid.push(currentRow);
          currentRow = [it];
          currentY = it.y;
        }
      }
      if (currentRow.length) grid.push(currentRow);
    }

    const numCols = bins.length;
    return grid.map((rowItems) => {
      const cells = new Array(numCols).fill("");
      for (const it of rowItems) {
        const col = binIndexForX(it.x);
        cells[col] = cells[col] ? `${cells[col]} ${it.text}` : it.text;
      }
      return cells;
    });
  }

  async function fromXlsx(file) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    return rows.map((r) => r.map((c) => String(c)));
  }

  async function fromGoogleSheet(url) {
    const spreadsheetId = SheetsApi.extractSpreadsheetId(url);
    const values = await SheetsApi.getValues(spreadsheetId, "A1:ZZ10000");
    return values;
  }

  async function extract(file, sourceSheetUrl) {
    if (sourceSheetUrl && sourceSheetUrl.trim()) {
      return fromGoogleSheet(sourceSheetUrl.trim());
    }
    if (!file) throw new Error("Upload a file or paste a Google Sheet link.");
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) return fromPdf(file);
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) return fromXlsx(file);
    throw new Error("Unsupported file type. Use a PDF, XLSX, or a Google Sheet link.");
  }

  return { extract };
})();
