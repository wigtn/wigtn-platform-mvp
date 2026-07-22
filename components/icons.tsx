import type { ReactNode } from "react";

/**
 * 아이콘 한 벌.
 *
 * ## 왜 만들었나
 *
 * 전에는 유니코드 글자를 아이콘 자리에 넣어 썼다.
 *
 *     ○  비회원      ↗  일반 영업인
 *     ✓  인증 영업인  ⌘  운영 관리자
 *
 * `⌘` 는 맥 커맨드키 기호다. "운영 관리자"와 아무 관계가 없고, `↗` 도
 * 임의였다. 뜻이 없는 기호를 아이콘 자리에 넣으면 화면이 급하게 만든 것처럼
 * 읽힌다.
 *
 * 검색에 쓰던 `⌕` 는 더 위험했다. 대부분의 폰트에 없는 글자라 기기에 따라
 * 네모나 엉뚱한 모양으로 떨어진다.
 *
 * ## 규칙
 *
 * 하나만 지킨다 - **선 굵기 1.6, 24 격자, 색은 currentColor.** 굵기가
 * 섞이면 한 벌로 안 보이고, 색을 박으면 어두운 배경에서 안 보인다.
 * 크기는 부모의 font-size 를 따른다(1em).
 */

function Svg({ children, ...rest }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 비회원 - 읽기만 한다. */
export function IconEye() {
  return (
    <Svg>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Svg>
  );
}

/** 일반 영업인 - 글과 답변을 쓴다. */
export function IconPen() {
  return (
    <Svg>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M13.5 7 17 10.5" />
    </Svg>
  );
}

/** 인증 영업인 - 재직이 확인된 사람. */
export function IconVerified() {
  return (
    <Svg>
      <path d="M12 3.2 14.1 5l2.7-.2.9 2.5 2.3 1.4-1 2.5 1 2.5-2.3 1.4-.9 2.5-2.7-.2-2.1 1.8-2.1-1.8-2.7.2-.9-2.5L3.9 13l1-2.5-1-2.5 2.4-1.4.9-2.5 2.7.2L12 3.2Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </Svg>
  );
}

/** 운영 관리자 - 기준을 조정한다. */
export function IconSliders() {
  return (
    <Svg>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

export function IconSearch() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Svg>
  );
}

/**
 * 평점.
 *
 * 여기만 선이 아니라 면으로 채운다. 별은 작게 그리면 선만으로는 형태가
 * 안 읽힌다.
 */
export function IconStar() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" />
    </svg>
  );
}

/** 데모 체험 중임을 알리는 표시. 켜져 있다는 뜻이라 채운 점이다. */
export function IconLive() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        opacity={0.35}
      />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}
