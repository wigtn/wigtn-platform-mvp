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
  Flag,
  Search,
  SlidersHorizontal,
  SquarePen,
  Star,
  ThumbsUp,
  Bold,
  Link2,
  List,
  Quote,
  ChevronRight,
  ChevronDown,
  Bookmark,
  Lock,
  Check,
  TriangleAlert,
  Building2,
  TrendingUp,
  TrendingDown,
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

/** 도움됐어요. 누른 상태는 색으로 구분한다. */
export const IconThumbsUp = () => <ThumbsUp {...base} />;

/** 신고. */
export const IconFlag = () => <Flag {...base} />;

/** 글쓰기 서식 도구. 글자만 있으면 눌리는 것으로 안 보인다. */
export const IconBold = () => <Bold {...base} />;
export const IconLink = () => <Link2 {...base} />;
export const IconList = () => <List {...base} />;
export const IconQuote = () => <Quote {...base} />;

/** 목록에서 "눌러서 들어간다"를 알리는 표시. */
export const IconChevron = () => <ChevronRight {...base} />;

/** 아래로 펼쳐지는 메뉴를 알리는 표시. 헤더 계정 칩에 쓴다. */
export const IconChevronDown = () => <ChevronDown {...base} />;

/** 지금 역할로는 못 쓰는 기능. 전에는 `⌁` 글자를 그대로 썼는데, 뜻도 안
 *  읽히고 글꼴에 따라 모양이 달라졌다. */
export const IconLock = () => <Lock {...base} />;

/** 확인된 항목. 전에는 `✓` 글자였는데 획 굵기가 다른 아이콘들과 안 맞았다. */
export const IconCheck = () => <Check {...base} />;

/**
 * 회사.
 *
 * 한때는 이름 첫 글자, 그다음엔 이름에서 뽑은 도형이었다. 글자는 안 만든
 * 화면처럼 보였고 도형은 아이콘 세트로 읽혔다. 가상의 회사라 진짜 로고가
 * 없으니, 무엇을 그리든 로고인 척하는 그림이 된다.
 *
 * 로고인 척하지 않고 "회사" 라고만 말한다. 여섯 곳이 같은 그림이어도 이름이
 * 바로 옆에 있다.
 */
export const IconBuilding = () => <Building2 {...base} />;

/** 관심도 오름·내림. 숫자를 읽기 전에 방향부터 보이게 한다. */
export const IconTrendUp = () => <TrendingUp {...base} />;
export const IconTrendDown = () => <TrendingDown {...base} />;

/** 주의. 전에는 `!` 글자를 그대로 썼다. */
export const IconCaution = () => <TriangleAlert {...base} />;

/** 스크랩. 담긴 상태는 채워서 구분한다. */
export const IconBookmark = ({ filled = false }: { filled?: boolean }) => (
  <Bookmark {...base} fill={filled ? "currentColor" : "none"} />
);
