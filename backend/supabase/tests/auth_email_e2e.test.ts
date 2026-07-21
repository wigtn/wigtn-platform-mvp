import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://127.0.0.1:55321";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const MAILPIT_URL = process.env.LOCAL_MAILPIT_URL ?? "http://127.0.0.1:55324";

if (SUPABASE_URL.startsWith("https://127.0.0.1:")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type MailpitMessage = {
  ID: string;
  To: Array<{ Address: string }>;
  Snippet: string;
};

async function findSignupOtp(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const body = (await response.json()) as { messages: MailpitMessage[] };
    const message = body.messages.find((item) =>
      item.To.some((recipient) => recipient.Address === email),
    );
    const otp = message?.Snippet.match(/code:\s*([0-9]{6})/)?.[1];
    if (otp) return otp;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`signup OTP was not delivered to ${email}`);
}

describe("Gate 2 이메일 가입 → 동의 → 프로필 E2E", () => {
  it("메일 확인 전 세션을 발급하지 않고 확인 후에만 active로 전이한다", async () => {
    const unique = Date.now().toString(36);
    const email = `gate2-e2e-${unique}@demo.test`;
    const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signup = await supabase.auth.signUp({
      email,
      password: "Gate2-test-password!",
    });
    expect(signup.error).toBeNull();
    expect(signup.data.session).toBeNull();
    expect(signup.data.user?.id).toBeTruthy();

    const otp = await findSignupOtp(email);
    const verified = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });
    expect(verified.error).toBeNull();
    expect(verified.data.session).toBeTruthy();

    const pendingProfile = await supabase
      .from("profiles")
      .select("account_status")
      .eq("user_id", verified.data.user!.id)
      .single();
    expect(pendingProfile.data?.account_status).toBe("pending_verification");

    const documents = await supabase
      .from("consent_documents")
      .select("id")
      .eq("is_required", true);
    expect(documents.error).toBeNull();
    expect(documents.data?.length).toBeGreaterThan(0);

    const onboarding = await supabase.rpc("complete_member_onboarding", {
      p_handle: `e2e_${unique}`,
      p_display_name: "Gate 2 E2E",
      p_consent_document_ids: documents.data!.map((document) => document.id),
      p_trace_id: `e2e-${unique}`,
    });
    expect(onboarding.error).toBeNull();
    expect(onboarding.data.account_status).toBe("active");

    const consents = await supabase
      .from("user_consents")
      .select("document_id")
      .eq("user_id", verified.data.user!.id);
    expect(consents.data).toHaveLength(documents.data!.length);

    const withdrawal = await supabase.rpc("withdraw_current_user", {
      p_confirmation: "WITHDRAW",
      p_trace_id: `e2e-withdraw-${unique}`,
    });
    expect(withdrawal.error).toBeNull();
    expect(withdrawal.data.account_status).toBe("withdrawn");
    const refreshed = await supabase.auth.refreshSession();
    expect(refreshed.data.session).toBeNull();
  });
});
