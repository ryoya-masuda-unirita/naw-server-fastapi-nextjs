/**
 * チャットの添付テストで使う小さなファイル（`setInputFiles` に渡す形）。
 * 中身の解析はしない（backend も画像以外はテキストを抽出しない）ため、拡張子と MIME タイプが正しければよい。
 */

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** 1x1 の透明な PNG。 */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function pngFile(name = 'sample.png'): TestFile {
  return { name, mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64') };
}

export function pdfFile(name = 'sample.pdf'): TestFile {
  const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(body) };
}

export function wordFile(name = 'sample.docx'): TestFile {
  return { name, mimeType: DOCX_MIME, buffer: Buffer.from('PK\u0003\u0004spec') };
}

export function excelFile(name = 'sample.xlsx'): TestFile {
  return { name, mimeType: XLSX_MIME, buffer: Buffer.from('PK\u0003\u0004spec') };
}

/** チャットに添付できない種類のファイル（実行ファイル）。 */
export function unsupportedFile(name = 'sample.exe'): TestFile {
  return { name, mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') };
}
