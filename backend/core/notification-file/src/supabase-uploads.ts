/**
 * 실 UploadsPort — Supabase Storage signed upload URL (§3.5, 스택 표준: presigned).
 * SUPABASE_URL + service key는 주입(managed secrets 게이트 — Eric 인프라). 코드에 키 없음.
 * 리사이징·바이러스 검사는 Gate 4 이후(§3.5 폴백); v0는 크기·타입 제한만.
 */
import {
  buildObjectKey,
  objectKeyIsSafe,
  validateUpload,
  validateUploadedObject,
} from "./uploads";
import type { CompleteUploadResult, UploadsPort } from "./ports";
import type { UploadPolicy, UploadRequest, UploadTicket } from "./types";

const FETCH_TIMEOUT_MS = 15_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SupabaseUploadsConfig {
  supabaseUrl: string;
  serviceKey: string | (() => Promise<string>); // 주입(env/시크릿 매니저), 코드에 하드코딩 금지
  newId: () => string;
  clock?: () => Date;
}

export class SupabaseUploadsAdapter implements UploadsPort {
  constructor(private readonly config: SupabaseUploadsConfig) {}

  private async key(): Promise<string> {
    const k = this.config.serviceKey;
    return typeof k === "function" ? k() : k;
  }

  async createUpload(
    request: UploadRequest,
    policy: UploadPolicy,
  ): Promise<UploadTicket> {
    const check = validateUpload(request, policy);
    if (!check.ok) throw new Error(`upload rejected: ${check.reason}`);
    const objectKey = buildObjectKey(policy, request, this.config.newId());
    // Supabase Storage: signed upload URL 발급 (object key는 URL 경로라 인코딩)
    const res = await timedFetch(
      `${this.config.supabaseUrl}/storage/v1/object/upload/sign/${encodeURI(objectKey)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.key()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) throw new Error(`supabase sign failed: ${res.status}`);
    const json = (await res.json()) as { url?: string; token?: string };
    // 응답 shape 검증: url 없이 ticket을 만들면 base URL로 업로드가 새는 셈이다.
    if (!json.url) throw new Error("missing signed upload url");
    const now = (this.config.clock ?? (() => new Date()))();
    return {
      objectKey,
      uploadUrl: `${this.config.supabaseUrl}/storage/v1${json.url}`,
      fields: json.token ? { token: json.token } : undefined,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    };
  }

  async completeUpload(
    objectKey: string,
    policy: UploadPolicy,
  ): Promise<CompleteUploadResult> {
    // I/O 전에 거부: 조작된 key·bucket 불일치는 네트워크에 닿기 전에 끊는다.
    if (
      !objectKeyIsSafe(objectKey) ||
      objectKey.split("/")[0] !== policy.bucket
    ) {
      return { ok: false };
    }
    // 실제 저장된 객체 메타 조회 후 **정책 재검증**(TOCTOU 차단, C1).
    const res = await timedFetch(
      `${this.config.supabaseUrl}/storage/v1/object/info/${encodeURI(objectKey)}`,
      {
        headers: { Authorization: `Bearer ${await this.key()}` },
      },
    );
    if (!res.ok) return { ok: false, reason: "not_found" };
    const meta = (await res.json()) as { size?: number; mimetype?: string };
    const check = validateUploadedObject(
      { sizeBytes: meta.size, mimeType: meta.mimetype },
      policy,
    );
    return {
      ok: check.ok,
      reason: check.reason,
      sizeBytes: meta.size,
      mimeType: meta.mimetype,
    };
  }
}
