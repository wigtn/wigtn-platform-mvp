import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

export type CompanyImportRow = {
  name: string;
  slug: string;
  industry?: string;
  salesType?: string;
  website?: string;
};

const HEADER_ALIASES: Record<string, keyof CompanyImportRow> = {
  name: "name",
  회사명: "name",
  기업명: "name",
  slug: "slug",
  슬러그: "slug",
  식별자: "slug",
  industry: "industry",
  업종: "industry",
  산업: "industry",
  salestype: "salesType",
  영업유형: "salesType",
  영업형태: "salesType",
  website: "website",
  웹사이트: "website",
  홈페이지: "website",
};

function headerKey(value: unknown): keyof CompanyImportRow | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return HEADER_ALIASES[normalized];
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value)
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    return "";
  }
  return String(value).trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function mapRows(matrix: string[][]): CompanyImportRow[] {
  const header = matrix[0] ?? [];
  const columns = header.map(headerKey);
  if (!columns.includes("name") || !columns.includes("slug")) {
    throw new Error(
      "company import requires name/회사명 and slug/슬러그 columns",
    );
  }
  const rows: CompanyImportRow[] = [];
  for (const values of matrix.slice(1)) {
    const output: Partial<CompanyImportRow> = {};
    columns.forEach((key, index) => {
      if (key) output[key] = String(values[index] ?? "").trim();
    });
    if (!output.name && !output.slug) continue;
    rows.push(output as CompanyImportRow);
    if (rows.length > 5000) throw new Error("company import exceeds 5000 rows");
  }
  return rows;
}

export async function parseCompanyImport(buffer: Buffer, filename: string) {
  if (buffer.byteLength === 0 || buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("company import file must be between 1 byte and 10 MiB");
  }
  const extension = filename.toLowerCase().split(".").pop();
  let matrix: string[][];
  if (extension === "csv") {
    matrix = parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  } else if (extension === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("company import workbook has no worksheet");
    matrix = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let index = 1; index <= row.cellCount; index += 1)
        values.push(cellText(row.getCell(index).value));
      matrix.push(values);
    });
  } else {
    throw new Error("company import supports .csv and .xlsx files only");
  }
  return {
    filename: filename.slice(0, 255),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    rows: mapRows(matrix),
  };
}
