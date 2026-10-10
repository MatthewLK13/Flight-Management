import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { writeFlightFile, type ImportedWorkbook } from './workbook';

describe('workbook write-back', () => {
  it('writes simulation columns to the selected source handle and keeps original values', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['CallSign', 'AirportDeliveryCode'], ['VN123', 'VVTS']]), 'Flights');
    let stored: unknown;
    let openedTarget = 0;
    const handle = { createWritable: async () => { openedTarget += 1; return { write: async (data: unknown) => { stored = data; }, close: async () => {} }; } } as unknown as FileSystemFileHandle;
    const imported: ImportedWorkbook = {
      file: new File(['source'], 'sample.xls'), handle, workbook, sheetName: 'Flights',
      sourceRows: [{ CallSign: 'VN123', AirportDeliveryCode: 'VVTS' }],
      enrichedRows: [{ CallSign: 'VN123', AirportDeliveryCode: 'VVTS', CTOT: '2023-11-03T08:00:00.000Z' }],
    };
    await writeFlightFile(imported);
    const reopened = XLSX.read(stored as Uint8Array, { type: 'array' });
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(reopened.Sheets.Flights, { defval: '' });
    expect(openedTarget).toBe(1);
    expect(row.CallSign).toBe('VN123');
    expect(row.AirportDeliveryCode).toBe('VVTS');
    expect(row.CTOT).toBe('2023-11-03T08:00:00.000Z');
  });
});
