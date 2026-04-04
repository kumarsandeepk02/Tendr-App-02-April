import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { DocumentState, DocumentSection } from '../types';

/**
 * Export table-format and scoring-matrix sections to XLSX.
 * Narrative sections are included as text sheets for completeness.
 */
export async function exportToXlsx(docState: DocumentState): Promise<void> {
  const { meta, sections } = docState;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Tendr';
  workbook.created = new Date();

  // Summary sheet
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 25 },
    { header: 'Value', key: 'value', width: 60 },
  ];
  summary.addRow({ field: 'Project', value: meta.projectTitle || 'Untitled' });
  summary.addRow({ field: 'Document Type', value: meta.type || 'RFP' });
  summary.addRow({ field: 'Date', value: new Date().toLocaleDateString() });
  summary.addRow({ field: 'Sections', value: String(sections.length) });
  styleHeaderRow(summary);

  // Process each section
  for (const section of sections) {
    const sheetName = sanitizeSheetName(section.title);
    const format = section.outputFormat || 'narrative';

    if (format === 'table' || format === 'scoring_matrix' || format === 'comparison_table') {
      addTableSheet(workbook, sheetName, section);
    } else if (format === 'checklist') {
      addChecklistSheet(workbook, sheetName, section);
    } else {
      addTextSheet(workbook, sheetName, section);
    }
  }

  // Save
  const buffer = await workbook.xlsx.writeBuffer();
  const fileDate = new Date().toISOString().split('T')[0];
  const safeName = (meta.projectTitle || 'Untitled').replace(/[^a-zA-Z0-9 ]/g, '');
  saveAs(new Blob([buffer]), `${safeName}_${meta.type}_${fileDate}.xlsx`);
}

/**
 * Parse markdown table content into rows/columns.
 */
function parseMarkdownTable(content: string): string[][] {
  const lines = content.split('\n').filter(line => line.trim().startsWith('|'));
  if (lines.length === 0) return [];

  return lines
    .filter(line => !line.match(/^\|[\s-:|]+\|$/)) // Skip separator rows
    .map(line =>
      line
        .split('|')
        .slice(1, -1) // Remove leading/trailing empty cells
        .map(cell => cell.trim())
    );
}

/**
 * Add a sheet with table data parsed from markdown.
 */
function addTableSheet(workbook: ExcelJS.Workbook, name: string, section: DocumentSection) {
  const ws = workbook.addWorksheet(name);
  const rows = parseMarkdownTable(section.content);

  if (rows.length === 0) {
    // No table found — fall back to text
    addTextSheet(workbook, name, section);
    return;
  }

  // First row as headers
  const headers = rows[0];
  ws.columns = headers.map((h, i) => ({
    header: h,
    key: `col${i}`,
    width: Math.max(15, Math.min(40, h.length * 1.5)),
  }));

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const rowData: Record<string, string> = {};
    rows[i].forEach((cell, j) => {
      rowData[`col${j}`] = cell;
    });
    ws.addRow(rowData);
  }

  styleHeaderRow(ws);

  // For scoring matrices, try to make numeric columns right-aligned
  if (section.outputFormat === 'scoring_matrix') {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        const val = String(cell.value || '');
        if (/^\d+(\.\d+)?%?$/.test(val.trim())) {
          cell.alignment = { horizontal: 'right' };
        }
      });
    });
  }
}

/**
 * Add a checklist sheet with checkbox-style formatting.
 */
function addChecklistSheet(workbook: ExcelJS.Workbook, name: string, section: DocumentSection) {
  const ws = workbook.addWorksheet(name);
  ws.columns = [
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Item', key: 'item', width: 60 },
  ];

  // Parse bullet points and checkboxes from markdown
  const lines = section.content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]')) {
      ws.addRow({ status: '✓', item: trimmed.slice(5).trim() });
    } else if (trimmed.startsWith('- [ ]')) {
      ws.addRow({ status: '☐', item: trimmed.slice(5).trim() });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      ws.addRow({ status: '☐', item: trimmed.slice(2).trim() });
    } else if (/^\d+\.\s/.test(trimmed)) {
      ws.addRow({ status: '☐', item: trimmed.replace(/^\d+\.\s/, '').trim() });
    }
  }

  styleHeaderRow(ws);
}

/**
 * Add a text-only sheet for narrative sections.
 */
function addTextSheet(workbook: ExcelJS.Workbook, name: string, section: DocumentSection) {
  const ws = workbook.addWorksheet(name);
  ws.columns = [{ header: section.title, key: 'content', width: 80 }];

  // Split content into paragraphs
  const paragraphs = section.content.split('\n\n').filter(p => p.trim());
  for (const para of paragraphs) {
    ws.addRow({ content: para.replace(/\n/g, ' ').trim() });
  }

  styleHeaderRow(ws);
  ws.getColumn('content').alignment = { wrapText: true };
}

/**
 * Style the first row as a header.
 */
function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' }, // Indigo
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.alignment = { vertical: 'middle' };
}

/**
 * Sanitize worksheet name (Excel limits: 31 chars, no special chars).
 */
function sanitizeSheetName(name: string): string {
  return name
    .replace(/[\\/*?[\]:]/g, '')
    .substring(0, 31)
    .trim() || 'Sheet';
}
