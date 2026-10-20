import type * as XLSX from 'xlsx';
import { enrichFlights, type FlightRow } from './enrichFlights';

export type ImportedWorkbook = {
  file: File; handle?: FileSystemFileHandle; workbook: XLSX.WorkBook;
  sheetName: string; sourceRows: FlightRow[]; enrichedRows: FlightRow[];
};

export async function readFlightFile(file: File, handle?: FileSystemFileHandle): Promise<ImportedWorkbook> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook không có sheet dữ liệu.');
  const movementSheets = workbook.SheetNames.filter((name) => /^(DEP|ARR)$/i.test(name));
  const selectedSheets = movementSheets.length ? movementSheets : [sheetName];
  const sourceRows = selectedSheets.flatMap((name) => {
    const direction = /^(DEP|ARR)$/i.test(name) ? name.toUpperCase() : undefined;
    return XLSX.utils.sheet_to_json<FlightRow>(workbook.Sheets[name], { defval: '', raw: false })
      .map((row) => ({ ...row, SourceSheet: name, ...(direction ? { FlightDirection: direction } : {}) }));
  });
  if (!sourceRows.length) throw new Error('Không tìm thấy dòng chuyến bay trong workbook.');
  const enrichedRows = enrichFlights(sourceRows, file.name);
  return { file, handle, workbook, sheetName, sourceRows, enrichedRows };
}

export async function updateWorkbookSheet(imported: ImportedWorkbook): Promise<XLSX.WorkBook> {
  const XLSX = await import('xlsx');
  const names = new Set(imported.sourceRows.map((row) => String(row.SourceSheet || imported.sheetName)));
  for (const name of names) {
    const original = imported.sourceRows.filter((row) => String(row.SourceSheet || imported.sheetName) === name);
    const enriched = imported.enrichedRows.filter((row) => String(row.SourceSheet || imported.sheetName) === name);
    const sourceHeaders = Object.keys(original[0] ?? {}).filter((key) => key !== 'SourceSheet' && key !== 'FlightDirection');
    const simHeaders = Object.keys(enriched[0] ?? {}).filter((key) => key !== 'SourceSheet' && !sourceHeaders.includes(key));
    const headers = [...sourceHeaders, ...simHeaders];
    const values = [headers, ...enriched.map((row) => headers.map((header) => row[header] ?? ''))];
    imported.workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(values);
  }
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
    const output = XLSX.write(imported.workbook, { bookType: extension === 'xlsx' ? 'xlsx' : 'biff8', type: 'array' });
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

