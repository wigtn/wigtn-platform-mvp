export const moduleName = "content-engine";

export const CONTENT_FORMAT_VERSION = 1 as const;
export const POST_ATTACHMENT_BUCKET = "post-attachments";
export const MAX_POST_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_POST_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "unordered-list"; items: string[] };

export type StructuredContent = {
  version: typeof CONTENT_FORMAT_VERSION;
  blocks: ContentBlock[];
};

export type Cursor = { createdAt: string; id: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

export function parseStructuredContent(value: unknown): StructuredContent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("content must be an object");
  }
  const document = value as { version?: unknown; blocks?: unknown };
  if (
    document.version !== CONTENT_FORMAT_VERSION ||
    !Array.isArray(document.blocks)
  ) {
    throw new Error("unsupported content format");
  }
  if (document.blocks.length === 0 || document.blocks.length > 200) {
    throw new Error("content must contain 1 to 200 blocks");
  }

  const blocks = document.blocks.map((raw): ContentBlock => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("invalid content block");
    }
    const block = raw as {
      type?: unknown;
      text?: unknown;
      level?: unknown;
      items?: unknown;
    };
    if (block.type === "paragraph") {
      const text = boundedText(block.text, 10_000);
      if (text === null) throw new Error("invalid paragraph");
      return { type: "paragraph", text };
    }
    if (block.type === "heading") {
      const text = boundedText(block.text, 500);
      if (text === null || (block.level !== 2 && block.level !== 3)) {
        throw new Error("invalid heading");
      }
      return { type: "heading", level: block.level, text };
    }
    if (block.type === "unordered-list") {
      if (
        !Array.isArray(block.items) ||
        block.items.length === 0 ||
        block.items.length > 100
      ) {
        throw new Error("invalid list");
      }
      const items = block.items.map((item) => {
        const text = boundedText(item, 1_000);
        if (text === null) throw new Error("invalid list item");
        return text;
      });
      return { type: "unordered-list", items };
    }
    throw new Error("unsupported content block");
  });
  return { version: CONTENT_FORMAT_VERSION, blocks };
}

export function plainTextToStructuredContent(value: string): StructuredContent {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("body is required");
  return parseStructuredContent({
    version: CONTENT_FORMAT_VERSION,
    blocks: normalized
      .split(/\n{2,}/)
      .map((text) => ({ type: "paragraph", text })),
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderSanitizedHtml(value: unknown) {
  const document = parseStructuredContent(value);
  return document.blocks
    .map((block) => {
      if (block.type === "paragraph") {
        return `<p>${escapeHtml(block.text).replaceAll("\n", "<br>")}</p>`;
      }
      if (block.type === "heading") {
        return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      }
      return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    })
    .join("");
}

export function contentPlainText(value: unknown) {
  const document = parseStructuredContent(value);
  return document.blocks
    .flatMap((block) =>
      block.type === "unordered-list" ? block.items : [block.text],
    )
    .join("\n");
}

export function encodeCursor(cursor: Cursor) {
  if (!UUID.test(cursor.id) || Number.isNaN(Date.parse(cursor.createdAt))) {
    throw new Error("invalid cursor");
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Cursor;
    if (!UUID.test(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt)))
      return null;
    return decoded;
  } catch {
    return null;
  }
}

export function clampPageSize(value: string | null, fallback = 20) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50
    ? parsed
    : fallback;
}

export const API_RATE_LIMITS = {
  search: { limit: 30, windowSeconds: 60 },
  comment: { limit: 20, windowSeconds: 60 },
  report: { limit: 10, windowSeconds: 3600 },
  upload: { limit: 20, windowSeconds: 3600 },
} as const;

export type RateLimitKind = keyof typeof API_RATE_LIMITS;
