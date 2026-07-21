/**
 * notification-file v0 (6위, Hyunwoo) — mailer·uploads(presigned)·인앱 알림·수신자 결정 규칙.
 * 소비 스펙 = 현상 PRD §3.5. 포트 인터페이스 + 순수 로직 + mock + 실 Supabase 어댑터(시크릿 주입).
 * 인증 계열 메일은 Supabase Auth(§5.7). 리사이징·바이러스 검사는 Gate 4 이후(§3.5 폴백).
 */
export const moduleName = "notification-file";

export * from "./types";
export * from "./ports";
export * from "./uploads";
export * from "./recipients";
export * from "./mock-adapters";
export * from "./supabase-uploads";
