import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("public-v1 OpenAPI contract", () => {
  const contract = readFileSync(
    join(
      fileURLToPath(new URL("..", import.meta.url)),
      "openapi/public-v1.yaml",
    ),
    "utf8",
  );

  it("freezes every Gate 4 public endpoint", () => {
    expect(contract).toContain('"openapi": "3.1.0"');
    for (const path of [
      "/v1/boards",
      "/v1/boards/{boardSlug}/posts",
      "/v1/posts/{postId}",
      "/v1/posts/{postId}/comments",
      "/v1/comments/{commentId}",
      "/v1/posts/{postId}/reactions",
      "/v1/posts/{postId}/bookmark",
      "/v1/reports",
      "/v1/uploads/presign",
      "/v1/uploads/{uploadId}/complete",
    ]) {
      expect(contract).toContain(`"${path}"`);
    }
  });
});
