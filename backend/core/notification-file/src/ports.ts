/**
 * 포트 인터페이스 (현상 PRD §3.5·§3.4 Ports: mailer·uploads·notifier·clock).
 * 소비 모듈(auth·content)은 이 포트를 주입받아 쓴다. 구현체는 이 모듈이 제공(mock/실).
 */
import type {
  MailMessage,
  Notification,
  UploadPolicy,
  UploadRequest,
  UploadTicket,
} from "./types";

export type CompleteUploadResult = {
  ok: boolean;
  reason?: string;
  sizeBytes?: number;
  mimeType?: string;
};

/** 일반 트랜잭션 메일(§3.5). 인증 계열 메일은 Supabase Auth(§5.7) — 여기 아님. */
export interface MailerPort {
  send(
    message: MailMessage,
  ): Promise<{ delivered: boolean; providerId?: string }>;
}

/** presigned 발급 + 업로드 확정 콜백(§3.5). private 기본, 정책 기반 접근. */
export interface UploadsPort {
  createUpload(
    request: UploadRequest,
    policy: UploadPolicy,
  ): Promise<UploadTicket>;
  /** 완료 후 확정 — **실제 객체 메타를 정책에 재검증**(TOCTOU 차단, C1). */
  completeUpload(
    objectKey: string,
    policy: UploadPolicy,
  ): Promise<CompleteUploadResult>;
}

/** 인앱 알림 저장·조회·읽음(§3.5). 발송 트리거 이벤트는 도메인이 발행(§9.2). */
export interface NotifierPort {
  notify(
    input: Omit<Notification, "id" | "createdAt" | "readAt">,
  ): Promise<Notification>;
  listForRecipient(
    recipientId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]>;
  markRead(notificationId: string, recipientId: string): Promise<boolean>;
}

export interface ClockPort {
  now(): Date;
}
