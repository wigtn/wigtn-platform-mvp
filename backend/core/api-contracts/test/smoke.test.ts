import { describe, expect, it } from "vitest";

import { moduleName } from "../src/index";

describe("api-contracts package", () => {
  it("exports its module name", () => {
    expect(moduleName).toBe("api-contracts");
  });
});
