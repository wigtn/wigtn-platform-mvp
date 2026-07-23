/**
 * 본문 거르기.
 *
 * 남의 글은 DB 를 거쳐 온다. 그 사이에 무엇이 들어갔는지 알 수 없으므로
 * 그릴 때 한 번 더 거른다. 이 확인이 빨개지면 남의 글이 내 브라우저에서
 * 코드를 돌릴 수 있다는 뜻이다.
 */
import { describe, expect, it } from "vitest";

import { isPlainText, sanitizeRichText, stripTags } from "./rich-text";

describe("sanitizeRichText", () => {
  it("서식은 그대로 남긴다", () => {
    const out = sanitizeRichText(
      "<p><strong>굵게</strong></p><ul><li>항목</li></ul><blockquote>인용</blockquote>",
    );
    expect(out).toContain("<strong>굵게</strong>");
    expect(out).toContain("<li>항목</li>");
    expect(out).toContain("<blockquote>인용</blockquote>");
  });

  it("script 태그를 버린다", () => {
    const out = sanitizeRichText("<p>앞</p><script>alert(1)</script><p>뒤</p>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("이벤트 속성을 버린다", () => {
    const out = sanitizeRichText('<p onclick="alert(1)">글</p>');
    expect(out).toBe("<p>글</p>");
  });

  it("javascript: 링크를 버리고 글자는 남긴다", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">눌러</a>');
    expect(out).not.toContain("javascript");
    expect(out).toContain("눌러");
  });

  it("http 링크는 새 창으로 열되 원문 창을 넘기지 않는다", () => {
    const out = sanitizeRichText('<a href="https://example.com">링크</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("img 로 실어 나르는 시도를 막는다", () => {
    const out = sanitizeRichText('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
  });

  it("허용하지 않은 태그의 글자는 살린다", () => {
    expect(sanitizeRichText("<h1>제목</h1>")).toBe("제목");
  });
});

describe("isPlainText", () => {
  it("편집기 이전 글은 그냥 글자로 본다", () => {
    expect(isPlainText("줄바꿈이\n있는 예전 글")).toBe(true);
    expect(isPlainText("<p>새 글</p>")).toBe(false);
  });
});

describe("stripTags", () => {
  it("목록 미리보기와 검색에 쓸 글자만 남긴다", () => {
    expect(stripTags("<p>앞</p><ul><li>뒤</li></ul>")).toBe("앞 뒤");
  });
});
