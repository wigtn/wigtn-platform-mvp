import { describe, expect, it } from "vitest";

import { moduleName } from "../src/index";

describe("notification-file package", () => {
  it("exports its module name", () => {
    expect(moduleName).toBe("notification-file");
  });
});
