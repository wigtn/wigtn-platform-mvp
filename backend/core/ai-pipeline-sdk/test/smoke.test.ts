import { describe, expect, it } from "vitest";

import { moduleName } from "../src/index";

describe("ai-pipeline-sdk package", () => {
  it("exports its module name", () => {
    expect(moduleName).toBe("ai-pipeline-sdk");
  });
});
