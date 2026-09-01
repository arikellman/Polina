# Polina — Expense Updater

A small, no-backend web page that lets Polina drop in a monthly invoice
(PDF or XLSX) or link a Google Sheet, review the extracted numbers, and push
totals into a Google Sheet she owns. Runs entirely in the browser — no
server, no database. For now it's hosted on GitHub Pages for testing; it can
move to her machine later with no code changes.

## Use cases today

1. **Gett taxi invoice (PDF)** — monthly invoice table, grouped by
   Department, summed to a running "Taxi Spend" tab.
2. **Gas invoice (PDF or XLSX, from email)** — monthly fuel spend per car
   license plate, summed to a running "Gas Spend" tab.

The tool isn't hardcoded to these two — the "Custom / new use case…" option
in step 2 lets you point it at any Google Sheet with any row label (just
type a spreadsheet URL, tab name, and row label at run time). To make a use
case permanent (so it shows up in the dropdown by name), add an entry to
`js/config.js`.

Both use cases share the same mechanic: extract a table → group one column
→ sum another column → write the totals into a running table (rows = the
group, columns = month) in the target sheet.

## One-time setup

### 1. Enable GitHub Pages

In the repo: **Settings → Pages → Build and deployment → Deploy from a
branch → `main` / `root`**. Note the resulting URL (something like
`https://arikellman.github.io/Polina/`) — you'll need it below.

### 2. Create a Google Cloud OAuth client

The page needs an OAuth client ID so Polina can sign in with her own Google
account and grant the page permission to edit her Sheets (nothing is shared
with anyone else; the token stays in her browser).

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and
   create a new project (or reuse one).
2. **APIs & Services → Library** → enable the **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** → set up as **External**
   (unless you have a Google Workspace with Internal apps), fill in the
   required fields. While testing, add Polina's Google account under **Test
   users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
   - Under **Authorized JavaScript origins**, add the GitHub Pages origin
     from step 1, e.g. `https://arikellman.github.io` (origin only, no
     path).
5. Copy the generated **Client ID** and paste it into `js/config.js` as
   `googleClientId`.

### 3. Point each use case at a real Google Sheet

For each use case, create (or reuse) the Google Sheet Polina owns, and note:

- Its URL (any tab, the spreadsheet ID is embedded in the URL).
- The tab/sheet name to write to (created automatically if it doesn't
  exist yet).
- The row label (`Department` for taxi spend, `Car License` for gas spend).

Fill these into the matching entry under `connections` in `js/config.js`,
then commit and push — GitHub Pages redeploys automatically.

## Using the page

1. **Connect to Google** — Polina signs in with her own account. The page
   only requests Sheets access, and only for as long as the tab is open.
2. **Choose what you're updating** — pick a use case, or "Custom" to point
   at any sheet ad hoc.
3. **Provide the source data** — upload the invoice PDF/XLSX, or paste a
   Google Sheet link if the data already lives in a sheet.
4. **Review & fix the extracted table** — PDF table extraction is
   best-effort (PDFs don't have real table structure, so text position is
   used to guess rows/columns). Always check the numbers before continuing;
   every cell is editable. Pick which column to group by (e.g. Department)
   and which to sum (e.g. Amount).
5. **Confirm totals & update sheet** — review the computed totals, set the
   month label (defaults to the current month, e.g. `2026-08`), and click
   **Update Google Sheet**. This adds a new column for the month (or
   updates it if it already exists) and adds any new rows for groups not
   seen before, without touching other data in the sheet.

### Handling invoices with per-transaction detail (e.g. the gas invoice)

Some invoices (the fuel-card statement, for example) list every individual
transaction with a subtotal line per group, rather than one row per group.
For those:

1. Extract as usual, then use **"Keep only rows containing text"** with a
   snippet that's unique to the subtotal lines (e.g. the Hebrew word that
   appears in "Total for car #:") to drop all the individual transaction
   rows and keep just the per-car subtotals.
2. The remaining cells may still combine a couple of values (e.g. a car
   number bundled with its label, or two amounts in one cell, since PDF
   text position clustering isn't perfect) — edit those cells directly to
   pull out just the number you need.
3. Then map columns and compute totals as usual.

This was verified against a real monthly fuel-card statement: filtering
down to the 8 per-car subtotal rows and cleaning up the two combined cells
reproduced the invoice's totals exactly, including the grand total.

## Notes on the two current use cases

- **Gett taxi spend by department**: Gett's monthly tax invoice PDF only
  has the total amount, not a department breakdown. The department detail
  has to be exported from Gett's business portal ("Reports" tab → export
  trips to Excel for the relevant month) — that XLSX export is the correct
  source file, not the PDF invoice.
- **Gas spend by car**: the monthly fuel-card statement lists every
  individual fill-up with a subtotal per car — see "Handling invoices with
  per-transaction detail" above for the extra filtering step this needs.

## Notes / limitations

- PDF parsing is heuristic — it reconstructs the table from text positions,
  since the PDF format has no native table structure. Always review the
  extracted preview before computing totals.
- The OAuth Client ID is not a secret, but restricting Authorized
  JavaScript origins (step 2 above) prevents other sites from using it.
- Nothing is sent anywhere except direct HTTPS calls from the browser to
  Google's own APIs — there is no backend collecting or storing data.
