/**
 * write-back (contract-v0 §1.3) — 봇 서비스계정으로 **공개 댓글 API** 호출(AI 전용 API 없음).
 * AI 표시는 body 플래그가 아니라 서버가 인증 주체에서 파생(C4). SDK는 공개 API만 호출한다.
 *
 * 봇 JWT 취득은 인증(Maximus) 게이트 A — SDK는 토큰을 주입받거나 tokenProvider로 지연 취득한다.
 */

export interface CommentApiClient {
  /** POST /v1/posts/{postId}/comments (Idempotency-Key = 이벤트 id). 성공 시 commentId. */
  postComment(input: {
    postId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<{ commentId: string }>;
}

export interface HttpCommentApiOptions {
  baseUrl: string;
  /** 봇 서비스계정 JWT. 정적 토큰 또는 매 호출 지연 취득(게이트 A). */
  botToken: string | (() => Promise<string>);
  timeoutMs?: number;
}

/** 실제 공개 댓글 API HTTP 클라이언트(fetch). 봇 토큰은 주입(env/인증 게이트). */
export class HttpCommentApiClient implements CommentApiClient {
  constructor(private readonly options: HttpCommentApiOptions) {}

  private async token(): Promise<string> {
    const t = this.options.botToken;
    return typeof t === "function" ? t() : t;
  }

  async postComment(input: {
    postId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<{ commentId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 15_000,
    );
    try {
      const res = await fetch(
        `${this.options.baseUrl}/v1/posts/${input.postId}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this.token()}`,
            "Idempotency-Key": input.idempotencyKey, // §1.3 · §6-1 중복 답변 방지
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: input.content }),
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error(`comment api ${res.status}`);
      const json = (await res.json()) as { commentId?: string; id?: string };
      return { commentId: json.commentId ?? json.id ?? "" };
    } finally {
      clearTimeout(timer);
    }
  }
}
