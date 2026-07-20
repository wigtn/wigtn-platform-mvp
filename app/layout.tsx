import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "FIELDNOTE — 영업 커리어 인텔리전스",
  description: "영업인의 회사 선택과 현장 노하우를 연결하는 커뮤니티 플랫폼",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
