/**
 * 글 본문 HTML 을 화면에 그리기 전에 걸러 낸다.
 *
 * ## 왜 직접 거르나
 *
 * 본문은 에디터가 만든 HTML 이다. 하지만 화면이 믿을 수 있는 건 **지금 이
 * 브라우저가 방금 만든 값**뿐이고, 목록에 뜨는 남의 글은 DB 를 거쳐 온다.
 * 그 사이에 무엇이 들어갔는지는 알 수 없으므로, 그릴 때 한 번 더 거른다.
 *
 * 라이브러리를 붙이지 않은 이유는 허용 목록이 짧아서다. 에디터가 만들 수
 * 있는 태그가 여덟 개뿐이라, 그 여덟 개만 남기고 나머지를 버리면 끝난다.
 * 목록이 짧을 때는 남의 코드보다 눈으로 읽히는 코드가 낫다.
 *
 * ## 무엇을 남기나
 *
 * 서식 도구가 만들 수 있는 것만 남긴다. 속성은 링크의 href 하나뿐이고,
 * 그마저 http/https 로 시작할 때만 남긴다 - `javascript:` 로 시작하는
 * 주소가 링크에 들어가면 누르는 순간 스크립트가 된다.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);

/** 사람이 쓴 글자를 HTML 안에서 안전한 글자로 바꾼다. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 태그가 하나도 없으면 옛 글(그냥 글자)이다.
 *
 * DB 에는 에디터가 생기기 전에 쓴 글이 그대로 있다. 그것들을 HTML 로 보면
 * 줄바꿈이 사라져 한 덩어리가 된다.
 */
export function isPlainText(body: string): boolean {
  return !/<\/?[a-z][^>]*>/i.test(body);
}

/** href 가 안전한 주소인지. 상대 경로와 http(s) 만 통과시킨다. */
function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return null;
}

/**
 * 허용한 태그만 남긴다.
 *
 * 브라우저의 파서를 쓴다. 정규식으로 태그를 세려고 하면 중첩과 따옴표에서
 * 반드시 새는데, 파서는 실제 브라우저가 읽는 대로 읽어 준다. 서버에서는
 * 파서가 없으므로 글자만 남긴다 - 목록의 미리보기는 어차피 글자다.
 */
export function sanitizeRichText(body: string): string {
  if (typeof DOMParser === "undefined") {
    // 서버에는 파서가 없다. 글자만 남기되, script·style 안의 내용은 글이
    // 아니라 코드라 통째로 버린다 - 안 그러면 `alert(1)` 같은 것이 본문에
    // 글자로 떠 버린다.
    return escapeText(stripTags(dropCodeBlocks(body)));
  }

  const doc = new DOMParser().parseFromString(body, "text/html");

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeText(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    /*
      script·style 은 안의 내용까지 버린다.

      아래 규칙은 "모르는 태그는 껍데기만 버리고 글은 남긴다" 인데, 이 둘에
      그대로 적용하면 `alert(1)` 같은 코드가 본문에 글자로 떠 버린다.
      실행되지는 않지만 남의 글에 남의 코드가 보이는 건 마찬가지로 이상하다.
    */
    if (tag === "script" || tag === "style" || tag === "template") return "";

    const inner = Array.from(element.childNodes).map(walk).join("");

    // 허용하지 않는 태그는 껍데기만 버리고 안의 글은 남긴다. 통째로 버리면
    // 사람이 쓴 문장이 소리 없이 사라진다.
    if (!ALLOWED_TAGS.has(tag)) return inner;
    if (tag === "br") return "<br />";

    if (tag === "a") {
      const href = safeHref(element.getAttribute("href") ?? "");
      if (!href) return inner;
      // 남의 글에서 나가는 링크다. 원문 창을 넘겨주지 않는다.
      return `<a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer nofollow">${inner}</a>`;
    }

    return `<${tag}>${inner}</${tag}>`;
  };

  return Array.from(doc.body.childNodes).map(walk).join("");
}

/** script·style 은 안의 내용까지 버린다. 글이 아니라 코드다. */
function dropCodeBlocks(body: string): string {
  return body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
}

/** 태그를 걷어내고 글자만 남긴다. 목록 미리보기와 검색에 쓴다. */
export function stripTags(body: string): string {
  return dropCodeBlocks(body)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
