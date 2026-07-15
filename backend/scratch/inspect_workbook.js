// inspect_workbook.js
const ExcelJS = require('exceljs');
const path = require('path');
const workbookPath = path.resolve(__dirname, '../gst_workbook.xlsx');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(workbookPath);
  console.log('Sheet names:', wb.worksheets.map(ws => ws.name).join(', '));
  wb.worksheets.forEach(ws => {
    console.log(`Sheet: ${ws.name}, rows: ${ws.rowCount}`);
    // Print first data row (skip header)
    const firstRow = ws.getRow(2);
    if (firstRow && firstRow.cellCount > 0) {
      const values = [];
      firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values.push(`${cell.address}:${cell.value}`);
      });
      console.log(`Sample row (2) of ${ws.name}:`, values.join(' | '));
    }
  });
  // Extract totals from Tax Dashboard sheet
  const dash = wb.getWorksheet('Tax Dashboard');
  if (dash) {
    const rows = dash.getRows(2, 4);
    rows.forEach(r => console.log(`Dashboard ${r.getCell('A').value}: ${r.getCell('B').value}`));
  }
})();
