/**
 * 회사 표시.
 *
 * ## 왜 글자를 뺐나
 *
 * 전에는 회사 이름의 첫 글자를 네모 안에 넣었다("모", "노", "하"…). 목록을
 * 훑을 때 회사가 구분되지 않고, 로고 자리에 글자만 있으니 아직 안 만든
 * 화면처럼 보였다.
 *
 * ## 왜 이미지 파일이 아닌가
 *
 * 여섯 곳 다 가상의 회사라 진짜 로고가 없다. 이미지를 만들어 넣으면 파일이
 * 늘고, 화면 크기마다 다시 그려야 하고, 색을 바꾸려면 파일을 다시 만들어야
 * 한다.
 *
 * 대신 회사 이름에서 **정해진 방식으로** 도형을 고른다. 같은 회사는 늘
 * 같은 도형이고, 어떤 크기에서도 또렷하고, 색은 지금 글자색을 따라간다.
 * 회사가 늘어나도 코드를 안 고쳐도 된다.
 *
 * 도형은 아홉 가지다. 흔한 기업 마크의 최소 단위 - 원, 겹친 사각, 반원,
 * 세 줄, 대각 분할, 고리, 십자, 삼각, 네 칸 - 을 골라서 단색으로도 서로
 * 구분된다. 여섯 가지였을 때는 회사 여섯 곳 중 둘이 같은 도형을 받았다.
 */

/** 이름을 숫자로 바꾼다. 같은 이름이면 늘 같은 값이 나온다. */
function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return hash;
}

/** 도형 여섯 가지. viewBox 는 24×24 로 통일한다. */
const SHAPES = [
  // 원 안의 점 — 가장 단순한 형태
  <g key="0">
    <circle cx="12" cy="12" r="8" fill="none" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.6" />
  </g>,
  // 겹친 사각
  <g key="1">
    <rect x="4" y="4" width="11" height="11" fill="none" strokeWidth="1.6" />
    <rect x="9" y="9" width="11" height="11" fill="none" strokeWidth="1.6" />
  </g>,
  // 반원 두 개가 맞물린 형태
  <g key="2">
    <path d="M12 4a8 8 0 0 1 0 16z" />
    <path d="M12 4a8 8 0 0 0 0 16" fill="none" strokeWidth="1.6" />
  </g>,
  // 굵기가 다른 세 줄
  <g key="3">
    <rect x="4" y="6" width="16" height="2.6" />
    <rect x="4" y="11" width="11" height="2.6" />
    <rect x="4" y="16" width="6" height="2.6" />
  </g>,
  // 대각으로 나뉜 사각
  <g key="4">
    <rect x="4" y="4" width="16" height="16" fill="none" strokeWidth="1.6" />
    <path d="M4 20 20 4 20 20z" />
  </g>,
  // 끊긴 고리
  <g key="5">
    <path d="M20 12a8 8 0 1 1-8-8" fill="none" strokeWidth="2.2" />
    <circle cx="20" cy="12" r="2.4" />
  </g>,
  // 십자
  <g key="6">
    <rect x="10.4" y="3" width="3.2" height="18" />
    <rect x="3" y="10.4" width="18" height="3.2" />
  </g>,
  // 겹친 삼각
  <g key="7">
    <path d="M12 4 21 19H3z" fill="none" strokeWidth="1.6" />
    <path d="M12 11 16.5 19h-9z" />
  </g>,
  // 네 칸 중 둘
  <g key="8">
    <rect x="4" y="4" width="7" height="7" />
    <rect x="13" y="13" width="7" height="7" />
    <rect x="13" y="4" width="7" height="7" fill="none" strokeWidth="1.6" />
    <rect x="4" y="13" width="7" height="7" fill="none" strokeWidth="1.6" />
  </g>,
];

export function CompanyMark({ slug, name }: { slug: string; name: string }) {
  const shape = SHAPES[hashOf(slug) % SHAPES.length];
  return (
    <svg
      className="company-mark"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeLinejoin="round"
      role="img"
      aria-label={`${name} 로고`}
    >
      {shape}
    </svg>
  );
}
