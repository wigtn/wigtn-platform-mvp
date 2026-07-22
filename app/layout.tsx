import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "FIELDNOTE | 영업직 회사 리뷰",
  description:
    "목표, 인센티브, 리드 배분 등 회사별 영업환경을 현직자 리뷰로 확인하세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <head>
        {/*
          Pretendard 를 실어 보낸다.

          CSS 는 `font-family: Pretendard, ...` 라고 적어 놓고 폰트를 어디서도
          받지 않았다. 만든 사람 맥에는 깔려 있고, 없어도 두 번째 후보인
          Apple SD Gothic Neo 가 받쳐 주니 안 보였다.

          윈도우에는 둘 다 없다. Noto Sans KR 도 기본 설치가 아니라 Arial 까지
          내려가고, Arial 에 한글이 없어 결국 맑은 고딕이 그린다. 이 디자인은
          큰 제목을 font-weight 900 으로 세우는데 맑은 고딕에는 그런 굵기가
          없어서 브라우저가 가짜 볼드를 흉내 낸다 - 제목이 뭉갠 것처럼 보인다.

          보는 사람 PC 사정에 디자인을 걸어 두면 안 된다.

          dynamic-subset 은 한글을 자모 단위 구간으로 쪼개 둬서, 화면에 실제로
          쓰인 글자 구간만 내려받는다. 전체 변수 폰트(약 2MB)를 통째로 받는
          것보다 훨씬 가볍다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
