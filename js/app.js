// Wires the UI together: connect to Google -> pick a destination -> load a
// source table -> fix it up -> map columns -> aggregate -> write to sheet.

let currentGrid = [];
let hasHeaderRow = true;

const els = {};

function $(id) {
  return document.getElementById(id);
}

function populateConnections() {
  const select = els.connectionSelect;
  select.innerHTML = "";
  for (const conn of CONFIG.connections) {
    const opt = document.createElement("option");
    opt.value = conn.id;
    opt.textContent = conn.label;
    select.appendChild(opt);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "Custom / new use case…";
  select.appendChild(customOpt);
  updateCustomVisibility();
}

function getSelectedConnection() {
  const id = els.connectionSelect.value;
  if (id === "custom") {
    return {
      id: "custom",
      label: "Custom",
      spreadsheetUrl: els.customSheetUrl.value,
      sheetName: els.customSheetName.value,
      keyColumnHeader: els.customKeyHeader.value || "Key",
    };
  }
  return CONFIG.connections.find((c) => c.id === id);
}

function updateCustomVisibility() {
  els.customFields.style.display = els.connectionSelect.value === "custom" ? "block" : "none";
}

function renderStatus(msg, isError) {
  els.status.textContent = msg;
  els.status.className = isError ? "status error" : "status";
}

function renderGrid() {
  const table = els.previewTable;
  table.innerHTML = "";
  currentGrid.forEach((row, rIdx) => {
    const tr = document.createElement("tr");
    if (rIdx === 0 && hasHeaderRow) tr.classList.add("header-row");

    const tdActions = document.createElement("td");
    tdActions.className = "row-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "row-delete";
    delBtn.textContent = "✕";
    delBtn.title = "Delete this row";
    delBtn.addEventListener("click", () => {
      currentGrid.splice(rIdx, 1);
      renderGrid();
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    row.forEach((cell, cIdx) => {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.textContent = cell;
      td.addEventListener("input", () => {
        currentGrid[rIdx][cIdx] = td.textContent;
        if (rIdx === 0) populateColumnSelects();
      });
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  populateColumnSelects();
}

function columnLabel(idx) {
  const header = hasHeaderRow ? currentGrid[0] : null;
  const name = header && header[idx] ? header[idx] : "";
  return name ? `Col ${idx + 1}: ${name}` : `Col ${idx + 1}`;
}

function populateColumnSelects() {
  const numCols = currentGrid[0] ? currentGrid[0].length : 0;
  for (const select of [els.groupColSelect, els.sumColSelect]) {
    const prev = select.value;
    select.innerHTML = "";
    for (let i = 0; i < numCols; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = columnLabel(i);
      select.appendChild(opt);
    }
    if (prev && Number(prev) < numCols) select.value = prev;
  }
}

function defaultMonthLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderTotals(totals) {
  const tbody = els.totalsTable;
  tbody.innerHTML = "";
  for (const [key, value] of Object.entries(totals)) {
    const tr = document.createElement("tr");
    const tdKey = document.createElement("td");
    tdKey.textContent = key;
    const tdVal = document.createElement("td");
    tdVal.textContent = value.toFixed(2);
    tr.append(tdKey, tdVal);
    tbody.appendChild(tr);
  }
}

function computeTotals() {
  const groupCol = Number(els.groupColSelect.value);
  const sumCol = Number(els.sumColSelect.value);
  const totals = Aggregate.run(currentGrid, groupCol, sumCol, hasHeaderRow);
  renderTotals(totals);
  return totals;
}

function init() {
  els.connectionSelect = $("connectionSelect");
  els.customFields = $("customFields");
  els.customSheetUrl = $("customSheetUrl");
  els.customSheetName = $("customSheetName");
  els.customKeyHeader = $("customKeyHeader");
  els.signInBtn = $("signInBtn");
  els.authState = $("authState");
  els.fileInput = $("fileInput");
  els.sourceSheetUrl = $("sourceSheetUrl");
  els.extractBtn = $("extractBtn");
  els.hasHeaderCheckbox = $("hasHeaderCheckbox");
  els.previewSection = $("previewSection");
  els.previewTable = $("previewTable");
  els.bulkDeleteCount = $("bulkDeleteCount");
  els.bulkDeleteBtn = $("bulkDeleteBtn");
  els.groupColSelect = $("groupColSelect");
  els.sumColSelect = $("sumColSelect");
  els.computeBtn = $("computeBtn");
  els.totalsSection = $("totalsSection");
  els.totalsTable = $("totalsTable");
  els.monthLabel = $("monthLabel");
  els.updateSheetBtn = $("updateSheetBtn");
  els.status = $("status");

  els.monthLabel.value = defaultMonthLabel();
  populateConnections();
  els.connectionSelect.addEventListener("change", updateCustomVisibility);

  SheetsApi.init((err) => {
    if (err) {
      renderStatus(`Google sign-in failed: ${err.message}`, true);
      return;
    }
    els.authState.textContent = "Connected to Google.";
    els.signInBtn.textContent = "Reconnect";
  });

  els.signInBtn.addEventListener("click", () => SheetsApi.signIn());

  els.extractBtn.addEventListener("click", async () => {
    try {
      renderStatus("Extracting table…", false);
      const file = els.fileInput.files[0];
      const grid = await TableExtract.extract(file, els.sourceSheetUrl.value);
      if (grid.length === 0) throw new Error("No data found in that file.");
      currentGrid = grid;
      hasHeaderRow = els.hasHeaderCheckbox.checked;
      els.previewSection.style.display = "block";
      renderGrid();
      renderStatus("Extracted. Review and fix the table below, then map columns.", false);
    } catch (e) {
      renderStatus(e.message, true);
    }
  });

  els.bulkDeleteBtn.addEventListener("click", () => {
    const n = parseInt(els.bulkDeleteCount.value, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    currentGrid.splice(0, Math.min(n, currentGrid.length));
    renderGrid();
  });

  els.hasHeaderCheckbox.addEventListener("change", () => {
    hasHeaderRow = els.hasHeaderCheckbox.checked;
    renderGrid();
  });

  els.computeBtn.addEventListener("click", () => {
    try {
      computeTotals();
      els.totalsSection.style.display = "block";
      renderStatus("Totals computed. Review, then update the sheet.", false);
    } catch (e) {
      renderStatus(e.message, true);
    }
  });

  els.updateSheetBtn.addEventListener("click", async () => {
    try {
      if (!SheetsApi.isSignedIn()) throw new Error("Connect to Google first.");
      const conn = getSelectedConnection();
      if (!conn.spreadsheetUrl) throw new Error("No target Google Sheet configured for this use case.");
      const spreadsheetId = SheetsApi.extractSpreadsheetId(conn.spreadsheetUrl);
      const totals = computeTotals();
      renderStatus("Writing to sheet…", false);
      const result = await SheetsApi.updateRunningTable({
        spreadsheetId,
        sheetName: conn.sheetName,
        keyColumnHeader: conn.keyColumnHeader,
        monthLabel: els.monthLabel.value.trim(),
        totals,
      });
      renderStatus(`Done. Sheet "${conn.sheetName}" updated (${result.rowsWritten} rows, ${result.columnsWritten} columns).`, false);
    } catch (e) {
      renderStatus(e.message, true);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
