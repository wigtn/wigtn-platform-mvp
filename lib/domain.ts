export type Role = "guest" | "sales" | "verified" | "admin";

export type Company = {
  slug: string;
  name: string;
  industry: string;
  type: string;
  score: number;
  reviewCount: number;
  trend: number;
  summary: string;
  scores: Record<string, number>;
};

export type Review = {
  id: string;
  companySlug: string;
  title: string;
  body: string;
  score: number;
  dimensions?: Record<string, number>;
  status: "published" | "hidden";
  employment: "재직" | "퇴사";
  verified: boolean;
};

export type Post = {
  id: string;
  board: "자유" | "Q&A" | "실적" | "노하우";
  title: string;
  body: string;
  author: string;
  badge?: string;
  likes: number;
  saved: boolean;
  comments: string[];
  images?: string[];
  ai?: "queued" | "thinking" | "posted";
};

export const companies: Company[] = [
  {
    slug: "northstar-cloud",
    name: "노스스타 클라우드",
    industry: "B2B SaaS",
    type: "인바운드·엔터프라이즈",
    score: 4.4,
    reviewCount: 18,
    trend: 12,
    summary: "명확한 ICP와 세일즈 엔지니어 협업이 강한 성장기 조직",
    scores: {
      "목표 현실성": 4.2,
      "인센티브 투명성": 4.6,
      "리드 품질": 4.5,
      "계정 배분": 4.0,
      "세일즈 툴": 4.7,
      "매니저 코칭": 4.3,
    },
  },
  {
    slug: "orbit-bioworks",
    name: "오빗 바이오웍스",
    industry: "제약·바이오",
    type: "필드 세일즈",
    score: 4.1,
    reviewCount: 23,
    trend: 7,
    summary: "전문 교육과 장기 고객관계에 투자하는 안정형 세일즈 조직",
    scores: {
      "목표 현실성": 4.4,
      "인센티브 투명성": 3.9,
      "리드 품질": 3.8,
      "계정 배분": 4.2,
      "세일즈 툴": 3.7,
      "매니저 코칭": 4.5,
    },
  },
  {
    slug: "ledger-lab",
    name: "레저 랩",
    industry: "핀테크",
    type: "파트너 세일즈",
    score: 3.8,
    reviewCount: 15,
    trend: -2,
    summary: "빠른 실행과 높은 자율성이 공존하는 파트너 중심 조직",
    scores: {
      "목표 현실성": 3.5,
      "인센티브 투명성": 4.1,
      "리드 품질": 3.7,
      "계정 배분": 3.6,
      "세일즈 툴": 4.4,
      "매니저 코칭": 3.5,
    },
  },
  {
    slug: "harbor-robotics",
    name: "하버 로보틱스",
    industry: "제조·로봇",
    type: "기술 영업",
    score: 4.0,
    reviewCount: 11,
    trend: 9,
    summary: "긴 세일즈 사이클을 기술 신뢰로 돌파하는 제조 DX 조직",
    scores: {
      "목표 현실성": 4.1,
      "인센티브 투명성": 3.8,
      "리드 품질": 4.0,
      "계정 배분": 4.3,
      "세일즈 툴": 3.5,
      "매니저 코칭": 4.2,
    },
  },
  {
    slug: "greenmile-commerce",
    name: "그린마일 커머스",
    industry: "유통·커머스",
    type: "채널 세일즈",
    score: 3.6,
    reviewCount: 29,
    trend: 3,
    summary: "데이터 기반 채널 운영을 빠르게 경험할 수 있는 대규모 조직",
    scores: {
      "목표 현실성": 3.2,
      "인센티브 투명성": 3.7,
      "리드 품질": 3.9,
      "계정 배분": 3.3,
      "세일즈 툴": 4.1,
      "매니저 코칭": 3.5,
    },
  },
  {
    slug: "mosaic-learning",
    name: "모자이크 러닝",
    industry: "에듀테크",
    type: "SMB 세일즈",
    score: 4.2,
    reviewCount: 9,
    trend: 15,
    summary: "짧은 피드백 주기와 체계적인 콜 코칭이 돋보이는 팀",
    scores: {
      "목표 현실성": 4.0,
      "인센티브 투명성": 4.4,
      "리드 품질": 4.1,
      "계정 배분": 4.0,
      "세일즈 툴": 4.2,
      "매니저 코칭": 4.6,
    },
  },
];

export const initialReviews: Review[] = [
  {
    id: "r1",
    companySlug: "northstar-cloud",
    title: "목표와 지원 체계가 같은 방향을 봅니다",
    body: "분기 초 계정 배분 기준이 공개되고, 큰 딜에는 세일즈 엔지니어가 초반부터 함께합니다. 숫자의 근거를 질문할 수 있는 문화가 가장 좋았습니다.",
    score: 4.6,
    status: "published",
    employment: "재직",
    verified: true,
  },
  {
    id: "r2",
    companySlug: "northstar-cloud",
    title: "성장 속도만큼 프로세스 변화도 빠릅니다",
    body: "툴과 프로세스가 자주 바뀌어 적응력은 필요합니다. 대신 실험 결과를 공유하고 잘못된 목표를 조정하는 속도도 빠릅니다.",
    score: 4.1,
    status: "published",
    employment: "퇴사",
    verified: true,
  },
  {
    id: "r3",
    companySlug: "orbit-bioworks",
    title: "제품 교육이 실제 현장에서 힘이 됩니다",
    body: "입사 교육 이후에도 케이스 스터디가 이어집니다. 단기 성과보다 관계와 전문성을 중시하는 분에게 맞습니다.",
    score: 4.3,
    status: "published",
    employment: "재직",
    verified: true,
  },
  {
    id: "r4",
    companySlug: "ledger-lab",
    title: "자율성이 큰 만큼 우선순위 판단이 중요합니다",
    body: "새 파트너를 직접 제안하고 움직일 수 있습니다. 다만 팀 간 역할이 선명하지 않은 시기가 있어 조율 역량이 필요합니다.",
    score: 3.7,
    status: "published",
    employment: "퇴사",
    verified: false,
  },
];

export const initialPosts: Post[] = [
  {
    id: "p1",
    board: "Q&A",
    title: "엔터프라이즈 첫 미팅에서 꼭 확인하는 세 가지는?",
    body: "의사결정 구조가 복잡한 고객과 첫 미팅을 앞두고 있습니다. 니즈 외에 무엇을 확인해야 다음 단계가 선명해질까요?",
    author: "파이프라인메이커",
    badge: "검증 영업인 L2",
    likes: 42,
    saved: false,
    comments: [
      "경제적 구매자와 실제 사용자의 성공 기준이 같은지 먼저 확인합니다.",
      "다음 회의의 참석자와 의사결정 이벤트를 그 자리에서 합의해 보세요.",
    ],
    ai: "posted",
  },
  {
    id: "p2",
    board: "노하우",
    title: "할인 없이 계약을 닫은 ROI 문서 구조",
    body: "문제 비용, 변화 후 지표, 실행 리스크 세 장으로 줄였더니 가격 협상이 가치 협상으로 바뀌었습니다.",
    author: "윤서진",
    badge: "B2B 전문가",
    likes: 87,
    saved: true,
    comments: ["문제 비용 산식 예시가 특히 도움됐어요."],
  },
  {
    id: "p3",
    board: "실적",
    title: "분기 128% 달성, 리드 수보다 바꾼 한 가지",
    body: "리드 점수보다 다음 행동의 명확성을 기준으로 파이프라인을 정리했습니다. 3주 뒤 stalled 딜이 절반으로 줄었습니다.",
    author: "한도윤",
    badge: "실적 인증",
    likes: 126,
    saved: false,
    comments: [],
  },
  {
    id: "p4",
    board: "자유",
    title: "첫 영업 리더 이직, 팀 규모와 제품 중 무엇을 볼까요",
    body: "플레이어에서 매니저로 넘어가는 시점이라 성장기 팀을 보고 있습니다. 경험자분들의 기준이 궁금합니다.",
    author: "세일즈러너",
    likes: 31,
    saved: false,
    comments: ["리더에게 목표 수정 권한이 실제로 있는지 물어보세요."],
  },
];

export function companyScore(
  reviews: Review[],
  slug: string,
  fallback: number,
) {
  const visible = reviews.filter(
    (review) => review.companySlug === slug && review.status === "published",
  );
  if (!visible.length) return fallback;
  return Number(
    (
      visible.reduce((sum, review) => sum + review.score, 0) / visible.length
    ).toFixed(1),
  );
}
