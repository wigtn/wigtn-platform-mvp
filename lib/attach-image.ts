/**
 * 첨부 이미지를 화면용으로 줄인다.
 *
 * 데모는 버킷에 올리지 않는다. 그렇다고 이름만 남기면 "업로드했는데
 * 아무 데도 안 보이는" 반쪽 체험이 된다. 원본 대신 긴 변 1280px 의
 * JPEG 으로 줄여 데이터 URL 로 들고 다닌다 - 폰 사진 한 장이 수 MB 라
 * 원본 그대로는 세션 보관함(약 5MB)이 금방 넘친다.
 */
export async function shrinkImage(file: File, maxEdge = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`이미지를 읽지 못했습니다: ${file.name}`));
      el.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들지 못했습니다");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
