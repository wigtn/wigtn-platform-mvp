import { ImageResponse } from "next/og";

/*
  브라우저 탭 아이콘.

  없으면 탭에 기본 지구본이 뜬다. 포트폴리오에서 링크를 타고 들어온 사람이
  가장 먼저 보는 자리라 비어 있으면 티가 난다.

  파일 대신 만들어 쓴다. 로고가 글자 하나라 이미지 파일을 넣고 관리할
  이유가 없고, 브랜드 색이 바뀌면 여기 한 줄만 고치면 된다.
*/

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // 사이트의 --navy / --primary 와 같은 값
        background: "#11110f",
        color: "#e34b32",
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: "-0.05em",
      }}
    >
      F
    </div>,
    size,
  );
}
