import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("admin-v1 OpenAPI contract", () => {
  const contract = readFileSync(
    join(
      fileURLToPath(new URL("..", import.meta.url)),
      "openapi/admin-v1.yaml",
    ),
    "utf8",
  );

  it("freezes the Gate 3 manifest and common execution endpoints", () => {
    expect(contract).toContain('"openapi": "3.1.0"');
    expect(contract).toContain('"/admin/v1/tools/manifest"');
    expect(contract).toContain('"operationId": "listAdminToolManifest"');
    expect(contract).toContain('"/admin/v1/tools/{toolId}/execute"');
    expect(contract).toContain('"operationId": "executeAdminTool"');
  });
});
