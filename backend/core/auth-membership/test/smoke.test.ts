import { describe, expect, it } from "vitest";

import {
  enabledOAuthProviders,
  isBuiltInOAuthProvider,
  moduleName,
  safeSameOriginPath,
  verifyRecentTotp,
} from "../src/index";

describe("auth-membership package", () => {
  it("exports its module name", () => {
    expect(moduleName).toBe("auth-membership");
  });

  it("검증된 claim에서 최근 TOTP만 허용한다", () => {
    const now = 2_000_000_000;
    expect(
      verifyRecentTotp(
        {
          aal: "aal2",
          session_id: "session-1",
          amr: [{ method: "totp", timestamp: now - 60 }],
        },
        now,
      ),
    ).toEqual({ ok: true, verifiedAt: now - 60, sessionId: "session-1" });
    expect(
      verifyRecentTotp(
        {
          aal: "aal2",
          session_id: "session-1",
          amr: [{ method: "totp", timestamp: now - 12 * 60 }],
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "RECENT_TOTP_REQUIRED" });
    expect(
      verifyRecentTotp({ aal: "aal1", session_id: "session-1", amr: [] }, now),
    ).toEqual({ ok: false, reason: "AAL2_REQUIRED" });
  });

  it("설정에 등록된 Supabase built-in OAuth provider만 활성화한다", () => {
    expect(enabledOAuthProviders("google,kakao,custom,google")).toEqual([
      "google",
      "kakao",
    ]);
    expect(isBuiltInOAuthProvider("github")).toBe(true);
    expect(isBuiltInOAuthProvider("naver")).toBe(false);
  });

  it("OAuth callback next는 실제 파싱 결과가 같은 origin인 경로만 허용한다", () => {
    const origin = "https://app.example.com";
    expect(safeSameOriginPath("/account?tab=auth#links", origin)).toBe(
      "/account?tab=auth#links",
    );
    expect(safeSameOriginPath("https://evil.example", origin)).toBe("/account");
    expect(safeSameOriginPath("//evil.example", origin)).toBe("/account");
    expect(safeSameOriginPath("/\\evil.example", origin)).toBe("/account");
    expect(safeSameOriginPath("account", origin)).toBe("/account");
  });
});
