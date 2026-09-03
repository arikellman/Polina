// Fill these in after creating your Google Cloud OAuth client (see README.md).
const CONFIG = {
  // OAuth 2.0 Client ID from Google Cloud Console (Web application type).
  googleClientId: "172923141127-ro1k8s11205229lbfh9jkafpna51fq9j.apps.googleusercontent.com",

  // Pre-defined destinations so Polina can pick a use case from a dropdown
  // instead of typing sheet details every time. Add more entries any time a
  // new use case shows up -- no other code changes needed.
  connections: [
    {
      id: "gett-taxi",
      label: "Gett taxi spend by department",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1QphD82HlWnAZLU-Y_O5mj51ZT92EPhNw/edit",
      // This sheet's tab has a two-row header where each month spans three
      // sub-columns (trip count / delivery count / total) rather than one
      // column per month, and a new tab is added each year following the
      // pattern "תקציב חודשי גט <2-digit year>". {yy} is filled in from
      // whatever year is in the month label typed at update time.
      layout: "grouped-month-total",
      sheetNameTemplate: "תקציב חודשי גט {yy}",
      keyColumnHeader: "Department",
      totalSubHeaderLabel: "סך הכל",
      monthLabelHint: "Match the sheet's own header exactly, e.g. Aug 26",
    },
    {
      id: "gas-by-car",
      label: "Gas spend by car",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1Mg7SfatGUep1u1WU0yiSNYlwklg9gAhG/edit",
      sheetName: "צריכת דלק ",
      keyColumnHeader: "מס' רכב",
    },
  ],
};
