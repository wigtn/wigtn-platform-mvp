/**
 * notification-file (6위, Hyunwoo) 타입 — 소비 스펙 = 현상 PRD §3.5.
 * mailer(일반 트랜잭션 메일)·uploads(presigned)·인앱 알림·수신자 결정 규칙(§9.2).
 * 인증 계열 메일(가입확인·비번재설정)은 Supabase Auth가 제어(§5.7) → 이 모듈 밖.
 */

export type ActorType = "user" | "admin" | "service" | "system";

/** §9.2 알림 트리거용 도메인 이벤트(수신자 결정 입력). ai-sdk와 동일 봉투(C1). */
export interface DomainEvent<T = Record<string, unknown>> {
  specVersion: "1";
  id: string;
  type: string;
  occurredAt: string;
  traceId: string;
  actor: { type: ActorType; id: string };
  subject: { type: string; id: string };
  data: T;
}

// ── 메일 ──
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** 멱등키(이벤트 id 재사용 권장) — 중복 발송 방지. */
  idempotencyKey?: string;
}

// ── 업로드(presigned) ──
export interface UploadPolicy {
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  bucket: string;
  /** true면 private(정책 기반 접근) — 기본값. */
  private: boolean;
}

export interface UploadRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ownerId: string;
}

export interface UploadTicket {
  objectKey: string;
  uploadUrl: string;
  /** 업로드 후 확정 콜백에 쓸 토큰/키. */
  fields?: Record<string, string>;
  expiresAt: string;
}

// ── 인앱 알림 ──
export type NotificationChannel = "in_app" | "email";

export interface Notification {
  id: string;
  recipientId: string;
  type: string; // 예: "grade.application.approved"
  title: string;
  body: string;
  linkPath?: string;
  createdAt: string;
  readAt?: string | null;
}
