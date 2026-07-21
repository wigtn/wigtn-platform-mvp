/**
 * Mock 포트 구현 (개발/테스트용, 의존성 0). 실 구현은 supabase-uploads·실 mailer(SMTP/HTTP·시크릿 주입).
 */
import type { MailerPort, NotifierPort } from "./ports";
import type { MailMessage, Notification } from "./types";

export class MockMailer implements MailerPort {
  readonly sent: MailMessage[] = [];
  private readonly seen = new Set<string>();
  async send(
    message: MailMessage,
  ): Promise<{ delivered: boolean; providerId?: string }> {
    if (message.idempotencyKey && this.seen.has(message.idempotencyKey)) {
      return { delivered: false }; // 멱등: 중복 발송 방지
    }
    if (message.idempotencyKey) this.seen.add(message.idempotencyKey);
    this.sent.push(message);
    return { delivered: true, providerId: `mock-${this.sent.length}` };
  }
}

/** 인메모리 인앱 알림 저장소(테스트용). 실 구현 = Supabase 테이블(§3.5). */
export class InMemoryNotifier implements NotifierPort {
  private readonly store: Notification[] = [];
  private seq = 0;
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async notify(
    input: Omit<Notification, "id" | "createdAt" | "readAt">,
  ): Promise<Notification> {
    const n: Notification = {
      ...input,
      id: `ntf-${++this.seq}`,
      createdAt: this.clock().toISOString(),
      readAt: null,
    };
    this.store.push(n);
    return n;
  }
  async listForRecipient(
    recipientId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]> {
    let rows = this.store.filter((n) => n.recipientId === recipientId);
    if (options?.unreadOnly) rows = rows.filter((n) => !n.readAt);
    rows = rows.slice().reverse();
    return options?.limit ? rows.slice(0, options.limit) : rows;
  }
  async markRead(
    notificationId: string,
    recipientId: string,
  ): Promise<boolean> {
    const n = this.store.find(
      (x) => x.id === notificationId && x.recipientId === recipientId,
    );
    if (!n || n.readAt) return false;
    n.readAt = this.clock().toISOString();
    return true;
  }
}
