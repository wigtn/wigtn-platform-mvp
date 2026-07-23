/**
 * 회사 로고.
 *
 * ## 어떻게 여기까지 왔나
 *
 * 처음엔 이름 첫 글자를 네모에 넣었다("모", "노", "하"…). 목록을 훑을 때
 * 회사가 구분되지 않고, 로고 자리에 글자만 있으니 아직 안 만든 화면처럼
 * 보였다.
 *
 * 다음엔 얇은 선 도형으로 바꿨는데, 이번엔 아이콘 세트처럼 읽혔다. 실제
 * 회사 로고는 선이 아니라 **면**이다 - 작게 줄여도 형태가 남고 흑백으로
 * 찍어도 뭉개지지 않는다. 그래서 전부 채운 도형으로 다시 그렸다.
 *
 * ## 왜 이미지 파일이 아닌가
 *
 * 여섯 곳 다 가상의 회사라 진짜 로고가 없다. 이미지를 만들어 넣으면 파일이
 * 늘고, 화면 크기마다 다시 그려야 하고, 색을 바꾸려면 파일을 다시 만들어야
 * 한다.
 *
 * 대신 이름에서 **정해진 방식으로** 고른다. 같은 회사는 늘 같은 로고이고,
 * 어떤 크기에서도 또렷하고, 회사가 늘어나도 코드를 안 고쳐도 된다.
 */

/** 이름을 숫자로 바꾼다. 같은 이름이면 늘 같은 값이 나온다. */
function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return hash;
}

/*
  전부 면으로 채운다.

  겹치는 곳은 `fill-rule="evenodd"` 로 뚫는다 - 단색 한 겹으로 그리면서
  안쪽에 형태를 만드는, 기업 마크에서 흔한 방식이다.

  아홉 가지를 둔다. 여섯이었을 때는 회사 여섯 곳 중 둘이 같은 로고를 받았다.
*/
const SHAPES = [
  // 원에서 사분면 하나를 덜어낸 형태
  <path key="0" fillRule="evenodd" d="M12 2a10 10 0 1 0 10 10H12z" />,
  // 두 겹 사각. 안쪽이 뚫린다
  <path
    key="1"
    fillRule="evenodd"
    d="M2 2h13v13H2zm4 4v5h5V6zM9 9h13v13H9zm4 4v5h5v-5z"
  />,
  // 사각과 반원이 맞물린 형태
  <path key="2" d="M2 2h9v20H2zM12 2a10 10 0 0 1 0 20z" />,
  // 계단
  <path key="3" d="M2 16h6v6H2zm7-7h6v13H9zm7-7h6v20h-6z" />,
  // 대각으로 나뉜 사각
  <path key="4" fillRule="evenodd" d="M2 2h20v20zM2 7v11h11z" />,
  // 끊긴 고리
  <path
    key="5"
    fillRule="evenodd"
    d="M12 2a10 10 0 1 0 10 10h-5a5 5 0 1 1-5-5z"
  />,
  // 십자
  <path key="6" d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" />,
  // 삼각 두 겹
  <path key="7" fillRule="evenodd" d="M12 2 22 21H2zm0 8 4 7H8z" />,
  // 네 칸 중 대각 둘
  <path key="8" d="M2 2h9v9H2zm11 11h9v9h-9z" />,
];

export function CompanyMark({ slug, name }: { slug: string; name: string }) {
  const shape = SHAPES[hashOf(slug) % SHAPES.length];
  return (
    <svg
      className="company-mark"
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={`${name} 로고`}
    >
      {shape}
    </svg>
  );
}
