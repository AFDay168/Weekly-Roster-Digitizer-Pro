
import { RosterEntry } from "../types";

declare const XLSX: any;

export const exportToExcel = (entries: RosterEntry[]) => {
  if (entries.length === 0) return;

  // 1. Sort: Date > IN > OUT > NAME
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.rawIn !== b.rawIn) return a.rawIn.localeCompare(b.rawIn);
    if (a.rawOut !== b.rawOut) return a.rawOut.localeCompare(b.rawOut);
    return a.name.localeCompare(b.name);
  });

  // 2. Prepare data for XLSX
  // Columns: # (A), Combine (B), Date (C), RAW In (D), RAW Out (E), Name (F)
  const data = sorted.map((entry, index) => ({
    "#": index + 1,
    "Combine": entry.combine,
    "Date": entry.date, 
    "RAW In": entry.rawIn,
    "RAW Out": entry.rawOut,
    "Name": entry.name
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // 3. Format "Date" as actual date numbers in Excel
  // We use UTC to avoid local timezone/DST shifts that cause "one day early" errors.
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  const excelEpoch = Date.UTC(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;

  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    const cellRef = XLSX.utils.encode_cell({ r: R, c: 2 }); // Column C (Date)
    const cell = worksheet[cellRef];
    if (cell && typeof cell.v === 'string') {
      const parts = cell.v.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        
        // Use Date.UTC to get a stable timestamp regardless of browser timezone
        const jsDateUtc = Date.UTC(year, month, day);
        const excelDate = (jsDateUtc - excelEpoch) / msPerDay;
        
        // Math.round handles the floating point jitter from DST shifts in history
        cell.v = Math.round(excelDate);
        cell.t = 'n';
        cell.z = 'yyyy/mm/dd';
      }
    }
  }

  // 4. Tab name: yyyymmdd of earliest date
  const earliestDateStr = sorted[0].date.replace(/\//g, '');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, earliestDateStr);

  // 5. Download
  XLSX.writeFile(workbook, `Roster_${earliestDateStr}.xlsx`);
};
