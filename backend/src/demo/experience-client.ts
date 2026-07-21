import type { SupabaseClient } from "@supabase/supabase-js";

export type DemoBootstrap = {
  mode: "isolated-demo";
  userId: string;
  expiresAt: string;
  writeMode: "private-action-ledger";
  realCommandAccess: false;
  features: string[];
};

export type DemoActionResult = Record<string, unknown> & {
  action: string;
  executedAt: string;
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/**
 * 브라우저 진입 시 한 번 호출한다. 로그인 UI 없이 익명 세션을 만들되,
 * 기존 영구 회원 세션이 있으면 덮어쓰지 않는다.
 */
export async function ensureDemoExperience(client: SupabaseClient) {
  let { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  throwOnError(sessionError);

  if (sessionData.session?.user && !sessionData.session.user.is_anonymous) {
    return { mode: "live" as const, session: sessionData.session };
  }

  if (!sessionData.session) {
    const anonymous = await client.auth.signInAnonymously();
    throwOnError(anonymous.error);
    sessionData = { session: anonymous.data.session };
  }

  const bootstrap = await client.rpc("bootstrap_demo_experience");
  throwOnError(bootstrap.error);
  return {
    mode: "isolated-demo" as const,
    data: bootstrap.data as DemoBootstrap,
  };
}

export async function executeDemoAction(
  client: SupabaseClient,
  action: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  const result = await client.rpc("execute_demo_action", {
    p_action: action,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  });
  throwOnError(result.error);
  return result.data as DemoActionResult;
}

export async function resetDemoExperience(client: SupabaseClient) {
  const result = await client.rpc("reset_demo_experience");
  throwOnError(result.error);
  return result.data as {
    mode: "isolated-demo";
    deletedActions: number;
    reset: true;
  };
}
