export const moduleName = "auth-membership";

export const GRADE_EVIDENCE_BUCKET = "grade-evidence";
export const BADGE_EVIDENCE_BUCKET = "badge-evidence";
export const MAX_GRADE_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_GRADE_EVIDENCE_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const BUILT_IN_OAUTH_PROVIDERS = [
  "google",
  "github",
  "apple",
  "kakao",
  "azure",
] as const;
export type BuiltInOAuthProvider = (typeof BUILT_IN_OAUTH_PROVIDERS)[number];

export function enabledOAuthProviders(value: string | undefined) {
  if (!value) return [];
  return [
    ...new Set(value.split(",").map((provider) => provider.trim())),
  ].filter((provider): provider is BuiltInOAuthProvider =>
    BUILT_IN_OAUTH_PROVIDERS.includes(provider as BuiltInOAuthProvider),
  );
}

export function isBuiltInOAuthProvider(
  value: unknown,
): value is BuiltInOAuthProvider {
  return (
    typeof value === "string" &&
    BUILT_IN_OAUTH_PROVIDERS.includes(value as BuiltInOAuthProvider)
  );
}

export function safeSameOriginPath(
  value: string | null | undefined,
  origin: string,
  fallback = "/account",
) {
  if (!value?.startsWith("/")) return fallback;
  try {
    const expectedOrigin = new URL(origin).origin;
    const target = new URL(value, expectedOrigin);
    if (target.origin !== expectedOrigin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export type GradeApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "cancelled";

export type AuthMethodReference = {
  method?: unknown;
  timestamp?: unknown;
};

export type VerifiedAuthClaims = {
  sub?: unknown;
  aal?: unknown;
  amr?: unknown;
  session_id?: unknown;
};

export type StepUpResult =
  | { ok: true; verifiedAt: number; sessionId: string }
  | {
      ok: false;
      reason: "AAL2_REQUIRED" | "RECENT_TOTP_REQUIRED" | "SESSION_REQUIRED";
    };

/**
 * getClaims()로 서명 검증된 JWT에만 사용한다. 기본 10분, clock skew ±60초는 ADR-0002 계약이다.
 */
export function verifyRecentTotp(
  claims: VerifiedAuthClaims,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 10 * 60,
  clockSkewSeconds = 60,
): StepUpResult {
  if (claims.aal !== "aal2") {
    return { ok: false, reason: "AAL2_REQUIRED" };
  }
  if (typeof claims.session_id !== "string" || claims.session_id.length === 0) {
    return { ok: false, reason: "SESSION_REQUIRED" };
  }

  const methods = Array.isArray(claims.amr)
    ? (claims.amr as AuthMethodReference[])
    : [];
  const latestTotp = methods.reduce<number | undefined>((latest, entry) => {
    if (entry.method !== "totp" || typeof entry.timestamp !== "number") {
      return latest;
    }
    return latest === undefined
      ? entry.timestamp
      : Math.max(latest, entry.timestamp);
  }, undefined);

  if (
    latestTotp === undefined ||
    latestTotp < nowSeconds - maxAgeSeconds - clockSkewSeconds ||
    latestTotp > nowSeconds + clockSkewSeconds
  ) {
    return { ok: false, reason: "RECENT_TOTP_REQUIRED" };
  }
  return { ok: true, verifiedAt: latestTotp, sessionId: claims.session_id };
}
