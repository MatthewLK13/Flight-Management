import type * as XLSX from 'xlsx';
import { enrichFlights, type FlightRow } from './enrichFlights';

export type ImportedWorkbook = {
  file: File; handle?: FileSystemFileHandle; workbook: XLSX.WorkBook;
  sheetName: string; sourceRows: FlightRow[]; enrichedRows: FlightRow[];
};

export async function readFlightFile(file: File, handle?: FileSystemFileHandle): Promise<ImportedWorkbook> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook không có sheet dữ liệu.');
  const sheet = workbook.Sheets[sheetName];
  const sourceRows = XLSX.utils.sheet_to_json<FlightRow>(sheet, { defval: '', raw: false });
  if (!sourceRows.length) throw new Error('Không tìm thấy dòng chuyến bay trong sheet đầu tiên.');
  const enrichedRows = enrichFlights(sourceRows, file.name);
  return { file, handle, workbook, sheetName, sourceRows, enrichedRows };
}

export async function updateWorkbookSheet(imported: ImportedWorkbook): Promise<XLSX.WorkBook> {
  const XLSX = await import('xlsx');
  const sheet = imported.workbook.Sheets[imported.sheetName];
  const sourceHeaders = Object.keys(imported.sourceRows[0] ?? {});
  const simHeaders = Object.keys(imported.enrichedRows[0] ?? {}).filter((key) => !sourceHeaders.includes(key));
  const headers = [...sourceHeaders, ...simHeaders];
  const values = [headers, ...imported.enrichedRows.map((row) => headers.map((header) => row[header] ?? ''))];
  imported.workbook.Sheets[imported.sheetName] = XLSX.utils.aoa_to_sheet(values);
  return imported.workbook;
}

export async function writeFlightFile(imported: ImportedWorkbook): Promise<void> {
  if (!imported.handle) throw new Error('Trình duyệt chưa cấp quyền ghi trực tiếp. Hãy mở file bằng Chrome hoặc Edge trên localhost.');
  await updateWorkbookSheet(imported);
  const XLSX = await import('xlsx');
  const extension = imported.file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(imported.workbook.Sheets[imported.sheetName]);
    const writable = await imported.handle.createWritable();
    await writable.write(`\ufeff${csv}`);
    await writable.close();
  } else {
    const output = XLSX.write(imported.workbook, { bookType: 'biff8', type: 'array' });
    const writable = await imported.handle.createWritable();
    await writable.write(output);
    await writable.close();
  }
}

declare global {
  interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: Blob | BufferSource | string): Promise<void>; close(): Promise<void> }>;
  }
}

