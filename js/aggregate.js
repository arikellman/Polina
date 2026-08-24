// Groups the (user-corrected) table by one column and sums another.

const Aggregate = (() => {
  function parseAmount(raw) {
    if (typeof raw === "number") return raw;
    const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function run(rows, groupColIndex, sumColIndex, hasHeaderRow) {
    const dataRows = hasHeaderRow ? rows.slice(1) : rows;
    const totals = {};
    for (const row of dataRows) {
      const key = (row[groupColIndex] || "").toString().trim();
      if (!key) continue;
      const amount = parseAmount(row[sumColIndex]);
      totals[key] = (totals[key] || 0) + amount;
    }
    return totals;
  }

  return { run };
})();
