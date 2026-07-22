/**
 * 아이콘.
 *
 * 직접 path 를 그려 쓰다가 lucide-react 로 바꿨다. 손으로 그린 아이콘은
 * 굵기·여백·모서리 처리가 조금씩 어긋나서, 여러 개가 한 화면에 모이면
 * 급하게 만든 티가 난다.
 *
 * 여기서는 **이름만 붙여 준다.** 화면 쪽 코드가 lucide 이름(BadgeCheck 같은)
 * 을 직접 알 필요는 없고, 나중에 라이브러리를 바꿔도 이 파일만 고치면 된다.
 */

import {
  BadgeCheck,
  Circle,
  Eye,
  Search,
  SlidersHorizontal,
  SquarePen,
  Star,
} from "lucide-react";

/** 크기는 부모 글자 크기를 따르고 색은 currentColor 를 따른다. */
const base = { size: "1em", strokeWidth: 1.75, "aria-hidden": true } as const;

/** 비회원 — 읽기만 한다. */
export const IconEye = () => <Eye {...base} />;

/** 일반 영업인 — 글과 답변을 쓴다. */
export const IconPen = () => <SquarePen {...base} />;

/** 인증 영업인 — 재직이 확인된 사람. */
export const IconVerified = () => <BadgeCheck {...base} />;

/** 운영 관리자 — 기준을 조정한다. */
export const IconSliders = () => <SlidersHorizontal {...base} />;

export const IconSearch = () => <Search {...base} />;

/** 평점. 작게 그려도 형태가 읽히도록 면으로 채운다. */
export const IconStar = () => <Star {...base} fill="currentColor" />;

/** 데모 체험 중 표시. 켜져 있다는 뜻이라 채운 점이다. */
export const IconLive = () => <Circle {...base} fill="currentColor" />;
