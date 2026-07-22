"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DemoStateBundle } from "./platform-app";

/**
 * 데모 상태를 라우트 **바깥**에 둔다.
 *
 * ## 왜
 *
 * 이 앱은 catch-all 라우트 하나(`app/[[...path]]`)로 모든 화면을 그린다.
 * 주소가 바뀌면 그 세그먼트가 갈리면서 `PlatformApp` 이 통째로 다시
 * 마운트된다. 상태가 `useState(baseline)` 로 되돌아가므로:
 *
 *   - 화면이 한 번 깜빡인다(관리자 사이드바를 누를 때 특히 티가 난다)
 *   - 방금 고른 역할이 사라진다
 *   - **화면을 옮길 때마다 DB 를 처음부터 다시 읽는다**
 *
 * 마지막 것이 제일 비싸다. 회사·리뷰·글·댓글을 매 클릭마다 다시 받아 온다.
 *
 * 레이아웃은 라우트가 바뀌어도 다시 마운트되지 않는다. 그래서 상태를 여기로
 * 올리면 셋 다 사라진다.
 */

const DemoStateContext = createContext<DemoStateBundle | null>(null);

export function DemoStateProvider({
  value,
  children,
}: {
  value: DemoStateBundle;
  children: ReactNode;
}) {
  return (
    <DemoStateContext.Provider value={value}>
      {children}
    </DemoStateContext.Provider>
  );
}

/** 제공자 밖에서 부르면 바로 알 수 있게 던진다. 조용히 빈 상태를 주면
 *  화면이 이유 없이 비어 보인다. */
export function useDemoStateContext(): DemoStateBundle {
  const value = useContext(DemoStateContext);
  if (!value) {
    throw new Error("DemoStateProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}
