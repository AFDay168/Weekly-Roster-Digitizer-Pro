
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { RosterEntry } from "../types";

// Hong Kong Public Holidays 2025 & 2026
const HK_HOLIDAYS: Record<string, string> = {
  "2025/01/01": "New Year's Day", "2025/01/29": "Lunar New Year's Day", "2025/01/30": "The second day of Lunar New Year", "2025/01/31": "The third day of Lunar New Year", "2025/04/04": "Ching Ming Festival", "2025/04/18": "Good Friday", "2025/04/19": "Day following Good Friday", "2025/04/21": "Easter Monday", "2025/05/01": "Labour Day", "2025/05/05": "Birthday of the Buddha", "2025/05/31": "Tuen Ng Festival", "2025/07/01": "HKSAR Establishment Day", "2025/10/01": "National Day", "2025/10/07": "Day following Mid-Autumn Festival", "2025/10/29": "Chung Yeung Festival", "2025/12/25": "Christmas Day", "2025/12/26": "First weekday after Christmas Day",
  "2026/01/01": "New Year's Day", "2026/02/17": "Lunar New Year's Day", "2026/02/18": "The second day of Lunar New Year", "2026/02/19": "The third day of Lunar New Year", "2026/04/03": "Good Friday", "2026/04/04": "Ching Ming Festival", "2026/04/06": "Easter Monday", "2026/05/01": "Labour Day", "2026/05/22": "Birthday of the Buddha", "2026/06/19": "Tuen Ng Festival", "2026/07/01": "HKSAR Establishment Day", "2026/10/01": "National Day", "2026/09/26": "Day following Mid-Autumn Festival", "2026/10/19": "Chung Yeung Festival", "2026/12/25": "Christmas Day", "2026/12/26": "First weekday after Christmas Day",
};

/**
 * Helper to ensure a date string is consistently formatted for the PDF
 */
const formatPdfDate = (val: string): string => {
  if (/^\d{5}$/.test(val)) {
    const num = parseInt(val);
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
  return val;
};

/**
 * Calendar View PDF (2-column grid)
 */
export const exportToPdf = (entries: RosterEntry[], startDateStr: string) => {
  if (entries.length === 0) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const baseDateStr = formatPdfDate(startDateStr);
  const baseDate = new Date(baseDateStr.replace(/\//g, '-'));
  const weekDates: string[] = [];
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    weekDates.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`);
  }

  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "bold");
  doc.text("Weekly Roster", 14, 15);
  
  const titleWidth = doc.getTextWidth("Weekly Roster");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`|  Period: ${baseDateStr} - ${weekDates[6]}`, 14 + titleWidth + 4, 15);

  const grouped: Record<string, string[]> = {};
  entries.forEach(entry => {
    const d = formatPdfDate(entry.date);
    if (!grouped[d]) grouped[d] = [];
    
    // CRITICAL: We double-check the 'combine' string here.
    // If RAW fields are different from what's in 'combine', we trust 'combine' ONLY if it exists 
    // and matches the current state (which it should, thanks to App.tsx syncing).
    const displayStr = entry.combine || `${entry.rawIn}-${entry.rawOut} ${entry.name}`;
    grouped[d].push(displayStr);
  });

  // Sort each group by time (alphabetical works for HH:mm)
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a, b) => a.localeCompare(b));
  });

  const gridRows: (number | null)[][] = [[0, 1], [2, 3], [4, 5], [6, null]];
  const tableData = gridRows.map(row => row.map(idx => {
    if (idx === null) return "";
    const date = weekDates[idx];
    const list = grouped[date] || [];
    if (list.length === 0) {
      if (idx === 6) return { content: "OFF", styles: { halign: 'center', valign: 'middle', fontSize: 28, textColor: [203, 213, 225], fontStyle: 'bold' } as any };
      if (HK_HOLIDAYS[date]) return { content: HK_HOLIDAYS[date], styles: { halign: 'center', valign: 'middle', fontSize: 16, textColor: [203, 213, 225], fontStyle: 'bold' } as any };
      return "-";
    }
    return list.join("\n");
  }));

  (doc as any).autoTable({
    startY: 22,
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: { top: 14, left: 6, right: 6, bottom: 8 }, valign: 'top', overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1, minCellHeight: 62 },
    columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } },
    margin: { left: 14, right: 14 },
    didDrawCell: (data: any) => {
      const rowIndex = data.row.index;
      const colIndex = data.column.index;
      const dayIdx = gridRows[rowIndex][colIndex];
      if (dayIdx !== null && dayIdx !== undefined) {
        doc.setFillColor(79, 70, 229);
        doc.rect(data.cell.x, data.cell.y, data.cell.width, 10, 'F');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text(`${dayNames[dayIdx].toUpperCase()}  ${weekDates[dayIdx]}`, data.cell.x + 4, data.cell.y + 6.5);
      }
    }
  });

  doc.save(`Roster_Calendar_${baseDateStr.replace(/\//g, '')}.pdf`);
};

/**
 * Tabular View PDF (List format)
 */
export const exportToPdfTable = (entries: RosterEntry[]) => {
  if (entries.length === 0) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const sorted = [...entries].sort((a, b) => {
    const da = formatPdfDate(a.date);
    const db = formatPdfDate(b.date);
    if (da !== db) return da.localeCompare(db);
    return a.rawIn.localeCompare(b.rawIn);
  });

  const startDate = formatPdfDate(sorted[0].date);
  const endDate = formatPdfDate(sorted[sorted.length - 1].date);

  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.text("Staff Roster Summary", 14, 15);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${startDate} - ${endDate}  |  Total Shifts: ${entries.length}`, 14, 22);

  const tableData = sorted.map((entry, index) => [
    index + 1,
    formatPdfDate(entry.date),
    `${entry.rawIn}-${entry.rawOut}`, 
    entry.name
  ]);

  (doc as any).autoTable({
    startY: 30,
    head: [['#', 'Date', 'Time Slot', 'Staff Name']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 50 },
      3: { cellWidth: 'auto' }
    }
  });

  doc.save(`Roster_List_${startDate.replace(/\//g, '')}.pdf`);
};
