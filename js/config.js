// Fill these in after creating your Google Cloud OAuth client (see README.md).
const CONFIG = {
  // OAuth 2.0 Client ID from Google Cloud Console (Web application type).
  googleClientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",

  // Pre-defined destinations so Polina can pick a use case from a dropdown
  // instead of typing sheet details every time. Add more entries any time a
  // new use case shows up -- no other code changes needed.
  connections: [
    {
      id: "gett-taxi",
      label: "Gett taxi spend by department",
      spreadsheetUrl: "PUT_GOOGLE_SHEET_URL_HERE",
      sheetName: "Taxi Spend",
      keyColumnHeader: "Department",
    },
    {
      id: "gas-by-car",
      label: "Gas spend by car",
      spreadsheetUrl: "PUT_GOOGLE_SHEET_URL_HERE",
      sheetName: "Gas Spend",
      keyColumnHeader: "Car License",
    },
  ],
};
