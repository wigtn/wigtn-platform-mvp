import { describe, expect, it } from "vitest";

import {
  clampPageSize,
  contentPlainText,
  decodeCursor,
  encodeCursor,
  plainTextToStructuredContent,
  renderSanitizedHtml,
} from "../src/index";

describe("structured content", () => {
  it("escapes markup and renders only the supported block vocabulary", () => {
    const document = {
      version: 1,
      blocks: [
        { type: "heading", level: 2, text: "Hello <script>" },
        { type: "paragraph", text: "safe & sound\nnext" },
        { type: "unordered-list", items: ["one", "<img src=x>"] },
      ],
    };
    const html = renderSanitizedHtml(document);
    expect(html).toBe(
      "<h2>Hello &lt;script&gt;</h2><p>safe &amp; sound<br>next</p><ul><li>one</li><li>&lt;img src=x&gt;</li></ul>",
    );
    expect(html).not.toContain("<script>");
    expect(contentPlainText(document)).toContain("safe & sound");
  });

  it("turns plain text into a versioned canonical document", () => {
    expect(plainTextToStructuredContent("first\n\nsecond").blocks).toHaveLength(
      2,
    );
  });

  it("rejects raw or unsupported document shapes", () => {
    expect(() =>
      renderSanitizedHtml({
        version: 1,
        blocks: [{ type: "html", text: "<b>x</b>" }],
      }),
    ).toThrow();
    expect(() => renderSanitizedHtml({ version: 2, blocks: [] })).toThrow();
  });
});

describe("pagination helpers", () => {
  it("round-trips a stable cursor and rejects malformed data", () => {
    const cursor = {
      createdAt: "2026-07-19T00:00:00.000Z",
      id: "c0000000-0000-4000-8000-000000000001",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor("broken")).toBeNull();
  });

  it("bounds page size", () => {
    expect(clampPageSize("50")).toBe(50);
    expect(clampPageSize("51")).toBe(20);
  });
});
