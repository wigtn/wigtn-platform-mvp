import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseCompanyImport } from "../src/import/companies.js";

describe("company import parser", () => {
  it("parses quoted CSV with Korean headers and computes a stable hash", async () => {
    const source = Buffer.from(
      '회사명,슬러그,업종,홈페이지\n"테스트, 주식회사",test-company,SaaS,https://example.com\n',
    );
    const result = await parseCompanyImport(source, "companies.csv");
    expect(result.sha256).toHaveLength(64);
    expect(result.rows).toEqual([
      {
        name: "테스트, 주식회사",
        slug: "test-company",
        industry: "SaaS",
        website: "https://example.com",
      },
    ]);
  });

  it("parses the first worksheet of a real xlsx file", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("companies");
    sheet.addRow(["name", "slug", "sales type"]);
    sheet.addRow(["WIGTN", "wigtn", "B2B"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseCompanyImport(buffer, "companies.xlsx");
    expect(result.rows).toEqual([
      { name: "WIGTN", slug: "wigtn", salesType: "B2B" },
    ]);
  });

  it("rejects unsupported legacy xls and missing required columns", async () => {
    await expect(
      parseCompanyImport(Buffer.from("x"), "companies.xls"),
    ).rejects.toThrow(/csv and \.xlsx/);
    await expect(
      parseCompanyImport(Buffer.from("업종\nSaaS\n"), "companies.csv"),
    ).rejects.toThrow(/requires name/);
  });
});
