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
      <body>{children}</body>
    </html>
  );
}
