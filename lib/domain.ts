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
  flags?: Array<"privacy" | "report">;
};

export type Post = {
  id: string;
  board: "자유" | "Q&A" | "실적" | "노하우";
  title: string;
  body: string;
  author: string;
  badge?: string;
  likes: number;
  /** 내가 눌렀는지. 눌린 상태에서 다시 누르면 취소된다. */
  liked?: boolean;
  saved: boolean;
  comments: string[];
  images?: string[];
  ai?: "queued" | "thinking" | "posted";
  aiAnswer?: string;
  aiModel?: string;
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
    summary: "분기 초 계정 배분 기준을 공유하고 큰 딜에는 SE가 동행합니다.",
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
    summary:
      "입사 후 제품 교육이 이어지고 병원·연구기관 고객을 장기 관리합니다.",
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
    summary: "파트너 영업 담당자가 제안부터 계약까지 직접 맡는 편입니다.",
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
    summary: "기술팀과 함께 제조 고객의 도입 검토를 길게 진행합니다.",
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
    summary: "채널별 실적과 전환율을 기준으로 영업 계획을 관리합니다.",
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
    summary: "주간 콜 리뷰와 짧은 피드백이 자주 이뤄집니다.",
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
    title: "계정 배분 기준이 공개돼 있어요",
    body: "분기 초에 계정 배분 기준을 공유합니다. 큰 딜은 초반부터 세일즈 엔지니어가 같이 들어옵니다. 목표가 왜 그렇게 잡혔는지도 팀장에게 물어볼 수 있었습니다.",
    score: 4.6,
    status: "published",
    employment: "재직",
    verified: true,
    flags: ["privacy"],
  },
  {
    id: "r2",
    companySlug: "northstar-cloud",
    title: "프로세스 변경이 잦은 편입니다",
    body: "영업 툴과 보고 방식이 자주 바뀝니다. 적응이 빠른 사람에게는 괜찮지만 안정적인 방식을 선호하면 피곤할 수 있습니다. 효과가 없으면 다시 바꾸는 속도도 빠릅니다.",
    score: 4.1,
    status: "published",
    employment: "퇴사",
    verified: true,
    flags: ["report"],
  },
  {
    id: "r3",
    companySlug: "orbit-bioworks",
    title: "제품 교육은 꾸준히 받습니다",
    body: "입사 교육이 끝난 뒤에도 사례 교육이 계속 있습니다. 단기 계약보다 고객 관계를 오래 관리하는 영업 방식에 가깝습니다.",
    score: 4.3,
    status: "published",
    employment: "재직",
    verified: true,
    flags: ["report"],
  },
  {
    id: "r4",
    companySlug: "ledger-lab",
    title: "파트너 발굴을 직접 제안할 수 있습니다",
    body: "새 파트너 후보를 직접 찾고 제안할 수 있습니다. 팀 사이 역할이 명확하지 않을 때가 있어 일정과 담당 범위를 스스로 조율해야 합니다.",
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
    body: "의사결정 구조가 복잡한 고객과 첫 미팅을 앞두고 있습니다. 필요 사항 외에 무엇을 확인해야 다음 미팅으로 이어갈 수 있을까요?",
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
    title: "할인 요청이 나왔을 때 공유한 ROI 문서",
    body: "현재 문제로 드는 비용, 도입 후 달라지는 지표, 실행할 때 생길 수 있는 위험을 세 장으로 정리했습니다. 가격보다 도입 효과를 먼저 이야기할 수 있었습니다.",
    author: "윤서진",
    badge: "B2B 전문가",
    likes: 87,
    saved: true,
    comments: ["문제 비용 산식 예시가 특히 도움됐어요."],
  },
  {
    id: "p3",
    board: "실적",
    title: "분기 128% 달성하면서 바꾼 파이프라인 기준",
    body: "리드 점수보다 다음 일정이 잡혀 있는지를 기준으로 파이프라인을 정리했습니다. 3주 이상 후속 일정이 없던 딜이 절반으로 줄었습니다.",
    author: "한도윤",
    badge: "실적 인증",
    likes: 126,
    saved: false,
    comments: [],
  },
  {
    id: "p4",
    board: "자유",
    title: "첫 영업 리더 이직, 팀 규모와 제품 중 뭘 봐야 할까요?",
    body: "실무자에서 매니저로 옮기는 시점이라 성장 중인 팀을 알아보고 있습니다. 첫 리더 역할을 고를 때 어떤 조건을 확인하셨는지 궁금합니다.",
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
