"use client";

import type { ReactNode } from "react";

import { DemoStateProvider } from "./demo-state-provider";
import { useDemoState } from "./platform-app";

/**
 * 레이아웃에서 데모 상태를 한 번만 만든다.
 *
 * 레이아웃은 라우트가 바뀌어도 다시 마운트되지 않는다. 그래서 여기서 만든
 * 상태는 화면을 옮겨도 살아남는다 - 깜빡임도, 매번 DB 를 다시 읽는 것도
 * 없어진다.
 */
export function DemoShell({ children }: { children: ReactNode }) {
  const bundle = useDemoState();
  return <DemoStateProvider value={bundle}>{children}</DemoStateProvider>;
}
