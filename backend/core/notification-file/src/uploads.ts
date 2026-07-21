/**
 * 업로드 검증 순수 로직 + 정책 (§3.5). 리사이징은 Gate 4 데모 전엔 생략, 크기·타입 제한만(§3.5 폴백).
 * presigned 발급 자체는 UploadsPort 구현체(supabase-uploads)가 담당.
 */
import type { UploadPolicy, UploadRequest } from "./types";

/** 첨부 기본 정책. auth-membership 증빙(10MB·jpeg/png/pdf)과 정합. */
export const DEFAULT_ATTACHMENT_POLICY: UploadPolicy = {
  maxBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
  bucket: "attachments",
  private: true,
};

export const DEFAULT_IMAGE_POLICY: UploadPolicy = {
  maxBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  bucket: "images",
  private: false,
};

export interface UploadValidation {
  ok: boolean;
  reason?:
    | "too_large"
    | "mime_not_allowed"
    | "empty"
    | "bad_filename"
    | "bad_owner"
    | "not_found";
}

// 경로 조작 차단: 슬래시·상위참조·역슬래시·널 금지.
const PATH_UNSAFE = /[/\\]|\.\.|\0/;

/** 업로드 요청을 정책에 대조(presign 전). */
export function validateUpload(
  request: UploadRequest,
  policy: UploadPolicy,
): UploadValidation {
  if (request.sizeBytes <= 0) return { ok: false, reason: "empty" };
  if (request.sizeBytes > policy.maxBytes)
    return { ok: false, reason: "too_large" };
  if (!policy.allowedMimeTypes.includes(request.mimeType))
    return { ok: false, reason: "mime_not_allowed" };
  if (!request.filename.trim() || PATH_UNSAFE.test(request.filename)) {
    return { ok: false, reason: "bad_filename" };
  }
  // ownerId는 서버 파생값이어야 하지만 방어적으로 경로 격리(§6)를 지킨다(M5).
  if (!request.ownerId.trim() || PATH_UNSAFE.test(request.ownerId)) {
    return { ok: false, reason: "bad_owner" };
  }
  return { ok: true };
}

/**
 * 업로드 완료 후 **실제 저장된 객체 메타**를 정책에 재검증(TOCTOU 차단, C1).
 * presign은 클라이언트 신고값만 보므로 complete 시 실제 size/mime를 반드시 재확인한다.
 */
export function validateUploadedObject(
  meta: { sizeBytes?: number; mimeType?: string },
  policy: UploadPolicy,
): UploadValidation {
  if (meta.sizeBytes === undefined || meta.sizeBytes <= 0)
    return { ok: false, reason: "empty" };
  if (meta.sizeBytes > policy.maxBytes)
    return { ok: false, reason: "too_large" };
  if (!meta.mimeType || !policy.allowedMimeTypes.includes(meta.mimeType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  return { ok: true };
}

/** 서버 파생 경로 세그먼트(ownerId·id)는 정화가 아니라 거부한다 — 조작이면 상위 버그다. */
export function assertSafePathSegment(segment: string): string {
  if (!segment.trim() || PATH_UNSAFE.test(segment)) {
    throw new Error(`bad path segment: ${segment}`);
  }
  return segment;
}

/** object key 전 세그먼트가 안전한지(bucket/owner/file 최소 2단, 상위참조·구분자 없음). */
export function objectKeyIsSafe(objectKey: string): boolean {
  const segments = objectKey.split("/");
  if (segments.length < 2) return false;
  return segments.every((segment) => {
    try {
      assertSafePathSegment(segment);
      return true;
    } catch {
      return false;
    }
  });
}

/** 안전한 object key: filename은 정화, owner·id는 강제(불량이면 throw). */
export function buildObjectKey(
  policy: UploadPolicy,
  request: UploadRequest,
  id: string,
): string {
  const safeOwner = assertSafePathSegment(request.ownerId);
  const safeId = assertSafePathSegment(id);
  const safeName = request.filename.replace(/[^\w.\-가-힣]/g, "_").slice(-80);
  return `${policy.bucket}/${safeOwner}/${safeId}-${safeName}`;
}

/** 확장자 화이트리스트(파일명 기반 보조 검증). */
export function extensionAllowed(
  filename: string,
  policy: UploadPolicy,
): boolean {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return policy.allowedMimeTypes.includes(map[ext] ?? "");
}
