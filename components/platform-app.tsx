"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import {
  companies as seedCompanies,
  companyScore,
  initialPosts,
  initialReviews,
  type Company,
  type Post,
  type Review,
  type Role,
} from "@/lib/domain";
import {
  AXIS_KEY,
  ensureDemoSession,
  requestAiAnswer,
  loadMyActions,
  loadPublicData,
  recordAction,
  resetMyDemo,
} from "@/lib/demo-store";
import {
  parseFieldnoteAiAnswer,
  type FieldnoteAiAnswer,
} from "@/lib/fieldnote-ai";
import { supabaseConfigured } from "@/lib/supabase";
import { useDemoStateContext } from "./demo-state-provider";
import {
  IconBold,
  IconBookmark,
  IconCaution,
  IconCheck,
  IconChevron,
  IconLock,
  IconEye,
  IconLink,
  IconList,
  IconQuote,
  IconFlag,
  IconThumbsUp,
  IconLive,
  IconPen,
  IconSearch,
  IconSliders,
  IconStar,
  IconVerified,
} from "./icons";

/*
  회사 목록은 이 파일 39곳에서 `companies` 라는 이름으로 쓰인다. DB 에서
  받아오도록 바꾸면서 그 39곳을 전부 고치면 실수가 난다.

  그래서 import 이름만 `seedCompanies` 로 바꾸고, 쓰는 컴포넌트마다
  `const companies = useCompanies(state)` 한 줄로 가린다. 나머지 줄은
  그대로다.

  DB 가 아직 안 붙었거나(설정 없음) 조회가 실패하면 시드 배열로 돌아간다 -
  화면이 통째로 비는 것보다 낫다.
*/
function pickCompanies(state: { companies?: Company[] }): Company[] {
  return state.companies?.length ? state.companies : seedCompanies;
}

/**
 * 6축 중 가장 높은 항목.
 *
 * 홈에서 "가장 높은 항목"이 `세일즈 툴 4.7` 로 박혀 있었다. 어느 회사가
 * 뽑히든 같은 값이 나와서, 비교 화면과 대 보면 서로 다른 말을 했다.
 * 순위 목록의 부제도 배열 순서로 골라 회사와 상관이 없었다.
 */
/**
 * 점수를 화면에 쓸 글자로 바꾼다.
 *
 * 공개 리뷰가 없으면 숫자가 없다. 예전 값이나 회사 레코드의 값을 대신
 * 보여 주면, 아무 리뷰도 없는데 평점이 있는 상태가 된다.
 */
/*
  브라우저가 띄우는 안내 문구를 한국어로 바꾼다.

  빈 채로 등록을 누르면 크롬이 "Please fill out this field." 를 띄웠다.
  전부 한국어인 화면에서 폼을 처음 만져 본 사람이 제일 먼저 보는 글이
  영어였다. 글자 수가 모자랄 때도 마찬가지다.

  form 하나에 걸어 두면 안쪽 입력이 전부 따라온다 - invalid 는 위로
  올라오지 않지만(버블 안 함) 캡처 단계에서는 잡힌다.
*/
type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function koreanValidity(event: { target: EventTarget | null }) {
  const field = event.target as FormField | null;
  if (!field || typeof field.setCustomValidity !== "function") return;
  field.setCustomValidity("");
  if (field.validity.valueMissing) {
    field.setCustomValidity("이 항목을 입력해 주세요.");
  } else if (field.validity.tooShort && "minLength" in field) {
    field.setCustomValidity(`${field.minLength}자 이상 적어 주세요.`);
  }
}

/** 다시 입력하면 안내를 지운다. 안 지우면 고쳐도 계속 빨갛게 남는다. */
function clearValidity(event: { target: EventTarget | null }) {
  const field = event.target as FormField | null;
  field?.setCustomValidity?.("");
}

/**
 * 화면이 아는 공개 리뷰 수.
 *
 * `company.reviewCount` 는 서버 집계라 방문자가 방금 쓴 리뷰를 모른다.
 * 점수는 화면 상태에서 계산하므로, 리뷰를 하나 쓰면 목록에서 **점수는
 * 3.6→3.9 로 움직이는데 옆의 "리뷰 1"은 그대로**였다. 상세 화면은 같은
 * 리뷰를 2건이라고 했다. 같은 것을 세는 자리는 출처가 같아야 한다.
 */
/**
 * 6축 점수를 공개 리뷰에서 계산한다.
 *
 * 회사 상세 안에만 있던 계산이라, 비교 화면은 회사 레코드의 값을 그대로
 * 썼다. 리뷰를 하나 쓰면 비교 화면의 종합 점수는 움직이는데 6축은 그대로라,
 * 한 번만 눌러 들어가면 같은 회사의 같은 항목이 3.5 와 2.8 로 갈렸다.
 *
 * 공개 리뷰가 없으면 null - 화면은 "집계 전"으로 쓴다. 리뷰가 0건인데
 * 막대 여섯 개가 꽉 차 있으면 안 된다.
 */
function dimensionScoresOf(
  reviews: Review[],
  company: Company,
): Record<string, number> | null {
  const visible = reviews.filter(
    (review) =>
      review.companySlug === company.slug && review.status === "published",
  );
  if (!visible.length) return null;
  return Object.fromEntries(
    reviewDimensions.map((label) => {
      const values = visible
        .map((review) => review.dimensions?.[label])
        .filter((value): value is number => typeof value === "number");
      const value = values.length
        ? values.reduce((sum, item) => sum + item, 0) / values.length
        : company.scores[label];
      return [label, value];
    }),
  );
}

function reviewCountOf(reviews: Review[], slug: string): number {
  return reviews.filter(
    (review) => review.companySlug === slug && review.status === "published",
  ).length;
}

function scoreText(value: number | null): string {
  return value === null ? "집계 전" : value.toFixed(1);
}

function topDimension(company: Company): string | null {
  const ranked = Object.entries(company.scores ?? {}).sort(
    ([, a], [, b]) => b - a,
  );
  if (!ranked.length) return null;
  return `${ranked[0][0]} ${ranked[0][1].toFixed(1)}`;
}

type DemoState = {
  role: Role;
  /** DB 에서 받은 회사 목록. 못 받았으면 비어 있고 시드로 되돌아간다. */
  companies?: Company[];
  /**
   * 게시판 이름(화면) → id(DB).
   *
   * 화면은 게시판을 "노하우" 처럼 한글 이름으로 고른다. 서버 액션은 id 를
   * 받는다. 글을 쓸 때마다 조회하면 느리므로 처음 읽을 때 같이 받아 둔다.
   */
  boardIds?: Record<string, string>;
  /** 회사 이름표(slug) → id(DB). 리뷰를 쓸 때 필요하다. */
  companyIds?: Record<string, string>;
  reviews: Review[];
  posts: Post[];
  placementsPublished: boolean;
  imported: boolean;
  crawlPreviewed: boolean;
  badgeStatus: "미신청" | "검토중" | "승인" | "반려";
  manualCompanies: string[];
  hiddenPostIds: string[];
  profile: { name: string; headline: string };
};

const baseline: DemoState = {
  role: "guest",
  reviews: initialReviews,
  posts: initialPosts,
  placementsPublished: false,
  imported: false,
  crawlPreviewed: false,
  badgeStatus: "미신청",
  manualCompanies: [],
  hiddenPostIds: [],
  profile: { name: "윤서진", headline: "B2B SaaS · 7년차 · Enterprise AE" },
};

const reviewDimensions = [
  "목표 현실성",
  "인센티브 투명성",
  "리드 품질",
  "계정 배분",
  "세일즈 툴",
  "매니저 코칭",
] as const;

const companySignals: Record<string, string[]> = {
  "northstar-cloud": [
    "분기 초 계정 배분 기준을 공유합니다.",
    "큰 딜에는 세일즈 엔지니어가 초반부터 참여합니다.",
    "툴과 프로세스 변경이 잦다는 의견이 있습니다.",
  ],
  "orbit-bioworks": [
    "입사 교육 이후에도 제품 사례 교육이 이어집니다.",
    "단기 계약보다 고객 관계를 오래 관리하는 편입니다.",
    "제품 지식을 꾸준히 따라가야 한다는 의견이 있습니다.",
  ],
  "ledger-lab": [
    "새 파트너 후보를 담당자가 직접 제안할 수 있습니다.",
    "제안부터 계약까지 한 담당자가 맡는 경우가 많습니다.",
    "팀 사이 담당 범위를 직접 조율해야 할 때가 있습니다.",
  ],
  "harbor-robotics": [
    "기술팀과 함께 고객의 도입 조건을 검토합니다.",
    "제조 고객 특성상 계약 검토 기간이 긴 편입니다.",
    "기술 설명과 현장 대응 역량이 중요하다는 의견이 있습니다.",
  ],
  "greenmile-commerce": [
    "채널별 실적과 전환율을 기준으로 목표를 관리합니다.",
    "프로모션 일정에 따라 업무량 차이가 큰 편입니다.",
    "여러 판매 채널의 이해관계를 조율해야 합니다.",
  ],
  "mosaic-learning": [
    "주간 통화 리뷰와 짧은 피드백이 자주 진행됩니다.",
    "중소 고객을 빠르게 많이 경험할 수 있습니다.",
    "반복 업무를 스스로 정리해야 한다는 의견이 있습니다.",
  ],
};

const roleNames: Record<Role, string> = {
  guest: "비회원",
  sales: "일반 영업인",
  verified: "인증 영업인",
  admin: "운영 관리자",
};

const roleExperience: Record<
  Role,
  { icon: ReactNode; description: string; unlocks: string }
> = {
  guest: {
    icon: <IconEye />,
    description: "회사 리뷰와 공개 커뮤니티를 읽습니다.",
    unlocks: "공개 회사 리뷰와 커뮤니티 열람",
  },
  sales: {
    icon: <IconPen />,
    description: "프로필·게시글·답변 작성 흐름을 체험합니다.",
    unlocks: "프로필 관리, 게시글·답변 작성",
  },
  verified: {
    icon: <IconVerified />,
    description: "재직 확인 배지가 붙는 리뷰와 답변을 작성합니다.",
    unlocks: "재직 확인 리뷰와 인증 배지 작성",
  },
  admin: {
    icon: <IconSliders />,
    description: "리뷰 검수·회원 인증·콘텐츠 운영 화면을 엽니다.",
    unlocks: "리뷰 검수, 회원 인증, 콘텐츠 운영",
  },
};

const roles = Object.keys(roleNames) as Role[];

const demoAccounts: Record<
  Exclude<Role, "guest">,
  { name: string; title: string; destination: string }
> = {
  sales: {
    name: "윤서진",
    title: "Enterprise AE · 프로필과 답변 작성",
    destination: "/account",
  },
  verified: {
    name: "한도윤",
    title: "재직 확인 완료 · 검증 리뷰와 배지",
    destination: "/account",
  },
  admin: {
    name: "FIELDNOTE 운영팀",
    title: "리뷰 검수 · 회원 인증 · 콘텐츠 운영",
    destination: "/admin",
  },
};

const accountRoles = Object.keys(demoAccounts) as Array<Exclude<Role, "guest">>;

const VISIT_KEY = "fieldnote-visited-v2";
/** DB 없이 돌 때만 쓰는 보관함. 붙어 있으면 서버 원장이 정본이다. */
const LOCAL_STATE_KEY = "fieldnote-demo-v1";
const PENDING_QUESTION_KEY = "fieldnote-pending-question-v1";
const TRANSIENT_STATE_KEY = "fieldnote-transient-state-v1";

/**
 * 서버 액션이 원장에 반영되기 전에 라우트를 이동하는 짧은 구간을 메운다.
 * localStorage 가 아니라 현재 탭의 sessionStorage 만 써서, 새 방문까지 낡은
 * 공개 데이터를 붙잡지 않는다.
 */
function overlayTransientState(state: DemoState): DemoState {
  try {
    const raw = window.sessionStorage.getItem(TRANSIENT_STATE_KEY);
    if (!raw) return state;
    const transient = JSON.parse(raw) as Partial<DemoState>;
    if (!Array.isArray(transient.posts) || !Array.isArray(transient.reviews)) {
      return state;
    }
    /*
      스냅샷이 서버 데이터를 통째로 덮지 않게 한다.

      전에는 `...transient` 를 그대로 펼쳐서 posts·reviews 배열이 방금 읽은
      서버 값을 통째로 밀어냈다. 이 스냅샷은 **탭이 열려 있는 동안 계속**
      살아 있으므로, 서버에서 바뀐 것이 탭을 닫기 전까지 화면에 안 나온다.

      실제로 이것 때문에 등급 배지가 안 보였다. DB 에 컬럼을 만들고 값을
      채우고 조회까지 200 으로 잘 받아 왔는데, 화면은 배지가 없던 시절의
      스냅샷을 계속 그리고 있었다. 오류가 없어서 원인을 찾기 어려웠다.

      스냅샷이 알아야 하는 건 **방문자가 방금 한 일**뿐이다. 서버가 아는
      글은 서버 값을 쓰고, 내 흔적(좋아요·스크랩·댓글·AI 답변)만 얹는다.
      서버가 아직 모르는 글은 그대로 앞에 붙인다.
    */
    /*
      같은 글을 id 로만 찾으면 안 된다.

      질문을 올리면 화면은 `p-<시각>` 이라는 임시 id 로 글을 먼저 만든다.
      서버 원장이 따라오면 `replayActions` 가 **서버 uuid** 로 같은 글을
      다시 만든다. id 가 다르니 임시본이 "서버가 모르는 글"로 남아, 목록에
      똑같은 질문이 두 개 떴다. 새로 고쳐도 안 없어졌다.

      제목과 본문이 같으면 같은 글로 본다. 아래 pending 질문 합치기가 이미
      쓰는 기준이다.
    */
    const sameStory = (a: Post, b: Post) =>
      a.title === b.title && a.body === b.body;
    const mine = new Map(transient.posts.map((post) => [post.id, post]));
    const merged = (state.posts ?? []).map((post) => {
      const saved =
        mine.get(post.id) ??
        [...mine.values()].find((item) => sameStory(item, post));
      if (!saved) return post;
      mine.delete(saved.id);
      return {
        ...post,
        liked: saved.liked,
        likes: saved.likes,
        saved: saved.saved,
        comments: saved.comments,
        ai: saved.ai ?? post.ai,
        aiAnswer: saved.aiAnswer ?? post.aiAnswer,
        aiModel: saved.aiModel ?? post.aiModel,
      };
    });

    return {
      ...state,
      ...transient,
      // 서버가 방금 읽은 조회용 id와 회사 목록은 최신 값을 우선한다.
      companies: state.companies?.length
        ? state.companies
        : transient.companies,
      boardIds: state.boardIds ?? transient.boardIds,
      companyIds: state.companyIds ?? transient.companyIds,
      // 서버가 아직 모르는 글(방금 쓴 것)을 앞에, 서버가 아는 글을 뒤에.
      posts: [...mine.values(), ...merged],
      /*
        리뷰도 같은 규칙이다. 서버 값을 정본으로 두되, 원장이 아직 못 따라온
        내 리뷰는 잃지 않는다. `state.reviews` 를 통째로 쓰면 방금 쓴 리뷰가
        잠깐 사라졌다가 나타난다.
      */
      reviews: [
        ...transient.reviews.filter(
          (review) => !(state.reviews ?? []).some((r) => r.id === review.id),
        ),
        ...(state.reviews ?? []),
      ],
    } as DemoState;
  } catch {
    return state;
  }
}

/**
 * 질문 등록 직후 다른 화면으로 이동해도 방금 받은 AI 초안을 잃지 않는다.
 *
 * 서버 원장은 최종 출처지만, 라우트 이동이 서버 반영보다 먼저 일어날 수 있다.
 * 이 짧은 틈만 sessionStorage 로 메우고, 서버에서 같은 글을 읽으면 AI 답변
 * 필드만 합친다. 브라우저를 닫으면 사라져 공개 데이터처럼 남지도 않는다.
 */
function readPendingQuestion(): Post | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_QUESTION_KEY);
    if (!raw) return null;
    const post = JSON.parse(raw) as Partial<Post>;
    if (!post.id || !post.title || !post.body || post.board !== "Q&A") {
      return null;
    }
    return post as Post;
  } catch {
    return null;
  }
}

function overlayPendingQuestion(state: DemoState): DemoState {
  const pending = readPendingQuestion();
  if (!pending) return state;
  const matchingIndex = state.posts.findIndex(
    (post) => post.title === pending.title && post.body === pending.body,
  );
  if (matchingIndex < 0) {
    return { ...state, posts: [pending, ...state.posts] };
  }
  const posts = [...state.posts];
  posts[matchingIndex] = {
    ...posts[matchingIndex],
    ai: pending.ai,
    aiAnswer: pending.aiAnswer,
    aiModel: pending.aiModel,
    comments: pending.comments,
  };
  return { ...state, posts };
}

/**
 * 화면 상태의 출처.
 *
 * 전에는 전부 localStorage 였다. 이제 공개 데이터는 Supabase 에서 읽고,
 * 방문자가 한 일은 서버의 **방문자별 액션 원장**에 쌓인다(RLS 로 격리).
 * 화면이 보는 모양(`DemoState`)은 그대로라 렌더 코드는 안 바뀐다.
 *
 * 역할 전환·"처음 방문인가" 같은 **화면 설정**만 localStorage 에 남는다.
 * 이건 데이터가 아니라 이 브라우저의 보기 상태다.
 *
 * DB 가 안 붙거나 조회가 실패하면 시드 데이터로 돌아간다. 포트폴리오 링크를
 * 타고 온 사람에게 빈 화면을 보이는 것이 제일 나쁘다.
 */
/** 레이아웃이 들고 있다가 화면에 내려 준다(components/demo-state-provider). */
export type DemoStateBundle = ReturnType<typeof useDemoState>;

export function useDemoState() {
  const [state, setState] = useState<DemoState>(baseline);
  const [ready, setReady] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsFirstVisit(!window.localStorage.getItem(VISIT_KEY));
    window.localStorage.setItem(VISIT_KEY, "1");
    setState((current) =>
      overlayPendingQuestion(overlayTransientState(current)),
    );

    const savedRole = window.localStorage.getItem(
      "fieldnote-role",
    ) as Role | null;
    // 역할은 화면 설정이라 DB 와 무관하게 먼저 되살린다.
    //
    // 라우트를 옮기면 이 컴포넌트가 다시 마운트된다(catch-all 라우트 하나라
    // 화면 전체가 갈린다). 그때 역할을 안 되살리면 방금 고른 관점이 사라진다 -
    // "운영 관리자로 전환"을 눌러 /admin 에 갔는데 "역할이 필요합니다"가 뜬다.
    //
    // DB 를 읽는 쪽 안에만 두면, 연결이 안 되는 환경에서 역할 전환이 통째로
    // 안 먹는다.
    if (savedRole) setState((current) => ({ ...current, role: savedRole }));

    (async () => {
      if (!supabaseConfigured) {
        // DB 가 없으면 예전처럼 브라우저에 통째로 보관한다.
        //
        // 라우트를 옮길 때마다 이 컴포넌트가 다시 마운트되므로, 어딘가에
        // 남겨 두지 않으면 방금 쓴 글·리뷰가 화면을 넘기는 순간 사라진다.
        try {
          const saved = window.localStorage.getItem(LOCAL_STATE_KEY);
          if (saved && !cancelled) {
            const parsed = JSON.parse(saved) as Partial<DemoState>;
            setState((current) => ({
              ...current,
              ...parsed,
              role: savedRole ?? parsed.role ?? current.role,
              reviews: parsed.reviews ?? current.reviews,
              posts: parsed.posts ?? current.posts,
              profile: { ...current.profile, ...parsed.profile },
            }));
          }
        } catch {
          window.localStorage.removeItem(LOCAL_STATE_KEY);
        }
        // 이동 중이던 질문도 겹친다(main 이 따로 보관한다).
        if (!cancelled) {
          setState((current) => overlayPendingQuestion(current));
          setReady(true);
        }
        return;
      }
      try {
        // profiles 는 authenticated 에만 열려 있다. 세션을 먼저 연다.
        await ensureDemoSession();
        const data = await loadPublicData();
        const actions = await loadMyActions();
        if (cancelled || !data) return;
        setState((current) => {
          const base: DemoState = {
            ...current,
            role:
              (window.localStorage.getItem("fieldnote-role") as Role | null) ??
              savedRole ??
              current.role,
            companies: data.companies,
            boardIds: LABEL_TO_BOARD_ID(data.boardIds),
            companyIds: data.companyIds,
            reviews: data.reviews,
            posts: data.posts,
          };
          return overlayPendingQuestion(
            overlayTransientState(replayActions(base, actions, data.boardIds)),
          );
        });
        setLive(true);
      } catch (error) {
        // 여기서 던지면 화면이 통째로 안 뜬다. 시드로 계속 간다.
        console.warn(
          "[fieldnote] DB 연결 실패, 시드 데이터로 표시합니다",
          error,
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateState = (update: (current: DemoState) => DemoState) => {
    setState((current) => {
      const next = update(current);
      // 역할은 화면 설정이라 브라우저에 남긴다. 새로고침해도 유지된다.
      window.localStorage.setItem("fieldnote-role", next.role);
      window.sessionStorage.setItem(TRANSIENT_STATE_KEY, JSON.stringify(next));
      // DB 가 없을 때는 상태 전체를 남긴다. 붙어 있으면 서버 원장이 정본이라
      // 두 곳에 두면 어느 쪽이 맞는지 알 수 없게 된다.
      if (!supabaseConfigured) {
        window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  /*
    첫 방문 표시는 한 번만 쓰인다.

    상태를 레이아웃으로 올리면서 이 값이 세션 내내 살아남게 됐다. 그대로
    두면 화면을 옮길 때마다 역할 선택 모달이 다시 뜬다 - 전에는 화면마다
    새로 마운트되며 저절로 꺼졌다.
  */
  const markFirstVisitHandled = () => setIsFirstVisit(false);

  return [
    state,
    updateState,
    { ready, isFirstVisit, live, markFirstVisitHandled },
  ] as const;
}

/**
 * 화면에서 일어난 일을 서버에 남긴다.
 *
 * ## 왜 기다리지 않나
 *
 * 화면은 이미 `setState` 로 즉시 바뀐다. 여기서 응답을 기다리면 버튼을 누른
 * 뒤 멈칫한다. 서버 기록은 뒤따라가면 되고, 새로고침하면 원장에서 다시
 * 재생된다(replayActions).
 *
 * ## 실패하면
 *
 * 조용히 넘긴다. DB 가 안 붙은 상태(설정 없음)에서도 데모는 끝까지 돌아야
 * 한다 - 포트폴리오 링크를 타고 온 사람에게 오류 창을 띄우는 것이 제일
 * 나쁘다. 대신 콘솔에는 남겨서 개발 중에는 보이게 한다.
 *
 * 실패해도 화면은 이미 바뀐 상태다. 새로고침하면 사라진다 - 데모에서는
 * 그게 맞다. 서버에 없는 것을 있는 척 유지하면 더 헷갈린다.
 */
/** slug 로 받은 게시판 id 를 화면이 쓰는 한글 이름으로 다시 묶는다. */
function LABEL_TO_BOARD_ID(bySlug: Record<string, string>) {
  const label: Record<string, Post["board"]> = {
    qna: "Q&A",
    howto: "노하우",
    deals: "실적",
    free: "자유",
  };
  const out: Record<string, string> = {};
  for (const [slug, id] of Object.entries(bySlug)) {
    const name = label[slug];
    if (name) out[name] = id;
  }
  return out;
}

function persist(action: string, payload: Record<string, unknown>) {
  if (!supabaseConfigured) return;
  void recordAction(action, payload).catch((error) => {
    console.warn(`[fieldnote] ${action} 기록 실패`, error);
  });
}

/**
 * 내가 한 일을 공개 데이터 위에 겹친다.
 *
 * 서버는 방문자의 쓰기를 공용 테이블이 아니라 원장에 적는다. 그래서 화면을
 * 그리려면 [공용 시드] + [내 원장] 을 합쳐야 한다. 전에 localStorage 에
 * 통째로 저장하던 것을 대신한다.
 *
 * 오래된 것부터 순서대로 적용한다 - 좋아요를 눌렀다 취소한 기록이 있으면
 * 순서가 곧 결과다.
 */
function replayActions(
  base: DemoState,
  actions: Array<{
    action: string;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
  }>,
  boardIds: Record<string, string>,
): DemoState {
  const slugOf = Object.fromEntries(
    Object.entries(boardIds).map(([slug, id]) => [id, slug]),
  );
  const boardLabel: Record<string, Post["board"]> = {
    qna: "Q&A",
    howto: "노하우",
    deals: "실적",
    free: "자유",
  };

  let next = base;
  for (const entry of actions) {
    const req = entry.request ?? {};
    const res = entry.response ?? {};
    switch (entry.action) {
      case "community.post.create": {
        const slug = slugOf[String(req.boardId)] ?? "free";
        next = {
          ...next,
          posts: [
            {
              // 서버가 준 id 를 쓴다. 없을 때만 임시 id 를 만든다 -
              // crypto.randomUUID 는 HTTPS 에서만 있어서 못 쓴다.
              id: String(res.id ?? `local-${Date.now()}`),
              board: boardLabel[slug] ?? "자유",
              title: String(req.title ?? ""),
              body: String(req.body ?? ""),
              author: next.profile.name,
              likes: 0,
              saved: false,
              comments: [],
              ai: req.askAi ? "queued" : undefined,
            },
            ...next.posts,
          ],
        };
        break;
      }
      case "community.comment.create": {
        const postId = String(req.postId);
        next = {
          ...next,
          posts: next.posts.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  comments: [...post.comments, String(req.body ?? "")],
                }
              : post,
          ),
        };
        break;
      }
      case "community.reaction.toggle": {
        // 누를 때마다 더하지 않는다. 원장에는 켜고 끈 기록이 순서대로
        // 남으므로, 마지막 상태만 반영해야 새로고침 뒤 숫자가 맞는다.
        const postId = String(req.postId);
        const active = req.active !== false;
        next = {
          ...next,
          posts: next.posts.map((post) => {
            if (post.id !== postId) return post;
            if (Boolean(post.liked) === active) return post;
            return {
              ...post,
              liked: active,
              likes: Math.max(0, post.likes + (active ? 1 : -1)),
            };
          }),
        };
        break;
      }
      case "community.bookmark.toggle": {
        const postId = String(req.postId);
        next = {
          ...next,
          posts: next.posts.map((post) =>
            post.id === postId ? { ...post, saved: !post.saved } : post,
          ),
        };
        break;
      }
      case "ai.answer.request": {
        // 답변은 요청 페이로드에 같이 넣어 뒀다. 방금 만든 질문 글(맨 앞)에
        // 붙인다 - 원장은 시간순이라 바로 앞이 그 글이다.
        const answer = String(req.answer ?? "");
        if (!answer || next.posts.length === 0) break;
        const [first, ...rest] = next.posts;
        // 답변은 aiAnswer 로만 들고 간다. 전에는 댓글에도 원본 문자열을
        // 밀어 넣었는데, 그 값이 구조화 JSON 이라 화면에 통째로 찍혔다.
        next = {
          ...next,
          posts: [{ ...first, ai: "posted", aiAnswer: answer }, ...rest],
        };
        break;
      }
      case "admin.content.moderate": {
        /*
          관리자가 숨긴 것이 새로고침하면 되살아났다.

          화면은 바로 반영하는데 원장에서 다시 읽을 때 이 액션을 안 봤다.
          블라인드는 운영 판단이라, 다시 들어왔을 때 풀려 있으면 처리한
          사람이 두 번 누르게 된다.
        */
        const targetId = String(req.targetId ?? "");
        if (!targetId) break;
        if (req.targetType === "company_review") {
          next = {
            ...next,
            reviews: next.reviews.map((review) =>
              review.id === targetId
                ? {
                    ...review,
                    status: req.action === "restore" ? "published" : "hidden",
                  }
                : review,
            ),
          };
        } else {
          const hidden = new Set(next.hiddenPostIds);
          if (req.action === "restore") hidden.delete(targetId);
          else hidden.add(targetId);
          next = { ...next, hiddenPostIds: [...hidden] };
        }
        break;
      }
      case "member.profile.update": {
        const name = String(req.displayName ?? "").trim();
        if (name) next = { ...next, profile: { ...next.profile, name } };
        break;
      }
      case "membership.badge.submit":
        next = { ...next, badgeStatus: "검토중" };
        break;
      case "admin.placement.publish":
        next = { ...next, placementsPublished: true };
        break;
      case "admin.company.import":
        next = { ...next, imported: true };
        break;
      default:
        // 모르는 액션은 건너뛴다. 서버가 기능을 늘려도 화면이 안 죽는다.
        break;
    }
  }
  return next;
}

function useDialogFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));

    window.requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? focusable()[0])?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return dialogRef;
}

export function PlatformApp({ initialPath }: { initialPath: string }) {
  const [state, setState, demoMeta] = useDemoStateContext();
  const [toast, setToast] = useState("");
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [accountLoginOpen, setAccountLoginOpen] = useState(false);
  const [mobileRoleSheetOpen, setMobileRoleSheetOpen] = useState(false);
  const [pulseRoleControl, setPulseRoleControl] = useState(false);
  const pulseTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const startRoleControlPulse = () => {
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    setPulseRoleControl(true);
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseRoleControl(false);
      pulseTimerRef.current = null;
    }, 3000);
  };
  useEffect(() => {
    const pendingToast = window.sessionStorage.getItem(
      "fieldnote-pending-toast",
    );
    if (!pendingToast) return;
    window.sessionStorage.removeItem("fieldnote-pending-toast");
    notify(pendingToast);
  }, []);
  useEffect(() => {
    if (window.sessionStorage.getItem("fieldnote-pending-role-pulse")) {
      window.sessionStorage.removeItem("fieldnote-pending-role-pulse");
      startRoleControlPulse();
    }
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);
  const reset = () => {
    // 서버의 내 액션 원장을 지운다. 공용 시드는 안 건드린다.
    //
    // 끝나면 새로고침한다. 원장을 지운 뒤 화면만 baseline 으로 돌리면
    // 시드 데이터가 아니라 정적 배열이 뜬다 - 초기화했더니 다른 데이터가
    // 나오는 셈이라 더 헷갈린다.
    void resetMyDemo()
      .catch((error) => console.warn("[fieldnote] 초기화 실패", error))
      .finally(() => {
        window.localStorage.removeItem("fieldnote-role");
        window.sessionStorage.removeItem(TRANSIENT_STATE_KEY);
        window.sessionStorage.removeItem(PENDING_QUESTION_KEY);
        window.location.href = "/";
      });
    notify("데모 데이터가 초기화됐습니다.");
  };

  useEffect(() => {
    if (demoMeta.ready && demoMeta.isFirstVisit) {
      setRolePickerOpen(true);
      demoMeta.markFirstVisitHandled();
    }
  }, [demoMeta]);

  const switchRole = (role: Role, destination?: string) => {
    const roleMessage = `${roleNames[role]} 역할로 전환했습니다. 새로 볼 수 있는 것: ${roleExperience[role].unlocks}`;
    // 경로 이동으로 컴포넌트가 바로 언마운트되어도 선택한 역할이 유실되지
    // 않도록 React 상태 갱신보다 먼저 저장한다.
    window.localStorage.setItem("fieldnote-role", role);
    setState((current) => ({ ...current, role }));
    setMobileRoleSheetOpen(false);
    const nextPath =
      destination ??
      (role === "admin"
        ? "/admin"
        : initialPath.startsWith("/admin")
          ? "/"
          : undefined);
    if (nextPath) {
      window.sessionStorage.setItem("fieldnote-pending-toast", roleMessage);
      router.push(nextPath);
    } else notify(roleMessage);
  };

  const loginWithDemoAccount = (role: Exclude<Role, "guest">) => {
    setAccountLoginOpen(false);
    switchRole(role, demoAccounts[role].destination);
  };

  const closeRolePicker = (role: Role = "guest") => {
    if (role === "admin")
      window.sessionStorage.setItem("fieldnote-pending-role-pulse", "true");
    else startRoleControlPulse();
    setRolePickerOpen(false);
    switchRole(role);
  };

  let content;
  if (initialPath === "/" || initialPath === "")
    content = <Home state={state} />;
  else if (initialPath === "/companies") content = <Companies state={state} />;
  else if (initialPath.startsWith("/companies/"))
    content = <CompanyDetail slug={initialPath.split("/")[2]} state={state} />;
  else if (initialPath === "/reviews/new")
    content = (
      <ReviewForm
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else if (initialPath === "/community")
    content = <Community state={state} setState={setState} notify={notify} />;
  else if (initialPath === "/posts/new")
    content = (
      <PostForm
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else if (initialPath.startsWith("/posts/"))
    content = (
      <PostDetail
        id={initialPath.split("/")[2]}
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else if (initialPath === "/questions/new")
    content = (
      <QuestionForm
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else if (initialPath === "/account")
    content = (
      <Account
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else if (initialPath === "/compare") content = <Compare state={state} />;
  else if (initialPath === "/trust") content = <Trust />;
  else if (initialPath.startsWith("/admin"))
    content = (
      <Admin
        path={initialPath}
        state={state}
        setState={setState}
        notify={notify}
        onRoleChange={switchRole}
      />
    );
  else content = <NotFound />;

  return (
    <>
      <DemoRoleBar
        role={state.role}
        setRole={switchRole}
        reset={reset}
        openMobileSheet={() => setMobileRoleSheetOpen(true)}
        mobileSheetOpen={mobileRoleSheetOpen}
        pulse={pulseRoleControl}
      />
      <Header
        role={state.role}
        path={initialPath}
        openAccountLogin={() => setAccountLoginOpen(true)}
      />
      {content}
      {!initialPath.startsWith("/admin") ? <Footer /> : null}
      <RolePickerModal
        open={rolePickerOpen}
        selectRole={closeRolePicker}
        dismiss={() => closeRolePicker("guest")}
      />
      <AccountLoginModal
        open={accountLoginOpen}
        currentRole={state.role}
        login={loginWithDemoAccount}
        continueAsGuest={() => {
          setAccountLoginOpen(false);
          switchRole("guest");
        }}
        close={() => setAccountLoginOpen(false)}
      />
      <MobileRoleSheet
        open={mobileRoleSheetOpen}
        role={state.role}
        setRole={switchRole}
        reset={reset}
        close={() => setMobileRoleSheetOpen(false)}
      />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function Header({
  role,
  path,
  openAccountLogin,
}: {
  role: Role;
  path: string;
  openAccountLogin: () => void;
}) {
  const navigation = [
    ["/companies", "회사 리뷰"],
    ["/community", "영업 Q&A"],
    ["/compare", "회사 비교"],
    ["/trust", "검증 정책"],
  ] as const;
  /*
    메뉴 밑에 붙지 않는 자식 주소들.

    `path.startsWith(href + "/")` 만으로는 `/posts/p1`, `/questions/new`,
    `/reviews/new` 에서 아무 메뉴도 안 켜졌다. 커뮤니티 글을 읽는 중인데
    메뉴는 전부 꺼져 있어서, 지금 어디인지 알 수 없었다.
  */
  const navHome: Array<[string, string]> = [
    ["/posts", "/community"],
    ["/questions", "/community"],
    ["/reviews", "/companies"],
  ];
  const section =
    navHome.find(([prefix]) => path.startsWith(prefix))?.[1] ?? path;
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="FIELDNOTE 홈">
          FIELD<span>NOTE</span>
        </Link>
        <nav aria-label="주요 메뉴">
          {navigation.map(([href, label]) => {
            const active = section === href || section.startsWith(`${href}/`);
            return (
              <Link
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
                href={href}
                key={href}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="header-actions">
          {/* 좁은 화면에서 통째로 숨겼더니 리뷰를 쓰러 갈 길이 화면
              어디에도 없었다. 글자만 접고 아이콘은 남긴다. */}
          <Link className="header-write" href="/reviews/new" title="리뷰 작성">
            <IconPen />
            <span>리뷰 작성</span>
          </Link>
          <button
            type="button"
            className="header-role"
            aria-haspopup="dialog"
            onClick={openAccountLogin}
          >
            {role === "guest" ? "데모 계정 로그인" : `${roleNames[role]} 계정`}
          </button>
        </div>
      </div>
    </header>
  );
}

function Home({ state }: { state: DemoState }) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  const top = companies.slice(0, 4);
  const [query, setQuery] = useState("");
  const router = useRouter();
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero">
        <div className="page-shell hero-layout">
          <div className="hero-copy reveal">
            <p className="hero-badge">영업직 회사 리뷰</p>
            <h1>
              목표, 인센티브, 리드 배분.
              <br />
              <em>입사 전에 확인하세요.</em>
            </h1>
            <p className="hero-lead">
              현직자 리뷰에서 목표 수준, 인센티브 기준, 리드 배분 방식을
              확인하세요.
            </p>
            <form
              onInvalidCapture={koreanValidity}
              onInputCapture={clearValidity}
              className="hero-search"
              onSubmit={(event) => {
                event.preventDefault();
                router.push(`/companies?q=${encodeURIComponent(query)}`);
              }}
            >
              <IconSearch />
              <input
                aria-label="회사 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="회사명, 업종, 영업 유형으로 검색"
              />
              <button type="submit">회사 검색</button>
            </form>
            <div className="popular-searches">
              <span>인기 검색</span>
              {["B2B SaaS", "엔터프라이즈", "인센티브", "세일즈 리더"].map(
                (item) => (
                  <Link
                    href={`/companies?q=${encodeURIComponent(item)}`}
                    key={item}
                  >
                    {item}
                  </Link>
                ),
              )}
            </div>
            <Link className="hero-explore-link" href="/companies">
              회사 탐색 시작
            </Link>
          </div>
          <aside className="career-preview" aria-label="추천 회사 미리보기">
            <div className="preview-head">
              <div>
                <span>지금 보고 있는 회사</span>
                <strong>최근 조회가 늘어난 회사</strong>
              </div>
              <Link href="/companies">전체 보기</Link>
            </div>
            {top.slice(0, 3).map((company) => (
              <Link
                className="preview-company"
                href={`/companies/${company.slug}`}
                key={company.slug}
              >
                <span className={`company-logo logo-${company.slug}`}>
                  {company.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{company.name}</strong>
                  <small>
                    {company.industry} · {company.type}
                  </small>
                </span>
                {/* 점수만 크게 두면 근거가 안 보인다. 표본 수를 붙인다. */}
                {/* 전에는 회사 레코드의 원값을 그대로 썼다. 바로 아래
                    순위 목록은 리뷰에서 계산한 값을 써서, 같은 회사가 한
                    화면에서 4.1 과 4.3 으로 동시에 나왔다. */}
                <b>
                  {scoreText(
                    companyScore(state.reviews, company.slug, company.score),
                  )}
                  <small>
                    리뷰 {reviewCountOf(state.reviews, company.slug)}
                  </small>
                </b>
              </Link>
            ))}
            {/* 4,812명 · 1,260건이 박혀 있었다. 회사 6곳짜리 화면에서
                이 숫자는 바로 들통난다. 실제로 센다. */}
            <div className="preview-proof">
              <span>
                <b>{companies.length}</b> 등록 회사
              </span>
              <span>
                <b>
                  {state.reviews.filter((r) => r.status === "published").length}
                </b>{" "}
                공개 리뷰
              </span>
            </div>
          </aside>
        </div>
      </section>

      <section className="trust-bar" aria-label="서비스 신뢰 지표">
        <div className="page-shell trust-bar-inner">
          <p>
            <strong>리뷰 작성자는 공개되지 않습니다.</strong> 재직·실적 확인
            여부만 리뷰에 표시합니다.
          </p>
          <Link href="/trust">검증 정책 보기</Link>
        </div>
      </section>

      <section className="page-shell section home-companies">
        <div className="section-heading">
          <div>
            <p className="kicker">회사 리뷰</p>
            <h2>이번 주 많이 본 회사</h2>
            <p>최근 조회수와 공개 리뷰를 기준으로 정리했습니다.</p>
          </div>
          <Link className="text-link" href="/companies">
            전체 회사 보기
          </Link>
        </div>
        <div className="recommendation-layout">
          <article className="featured-company">
            <div className="featured-company-topline">
              <span>주간 추천 01</span>
              <span>이번 주 관심도 +{top[0].trend}%</span>
            </div>
            <div className="featured-company-main">
              <span className={`company-logo logo-${top[0].slug}`}>
                {top[0].name.slice(0, 1)}
              </span>
              <div>
                <p>
                  {top[0].industry} · {top[0].type}
                </p>
                <h3>
                  <Link href={`/companies/${top[0].slug}`}>{top[0].name}</Link>
                </h3>
                <p>{top[0].summary}</p>
              </div>
            </div>
            <dl className="featured-company-signals">
              <div>
                <dt>종합 점수</dt>
                <dd>
                  {scoreText(
                    companyScore(state.reviews, top[0].slug, top[0].score),
                  )}
                </dd>
              </div>
              <div>
                <dt>가장 높은 항목</dt>
                <dd>
                  {companyScore(state.reviews, top[0].slug, top[0].score) ===
                  null
                    ? "집계 전"
                    : (topDimension(top[0]) ?? "집계 전")}
                </dd>
              </div>
              <div>
                <dt>공개 리뷰</dt>
                <dd>{reviewCountOf(state.reviews, top[0].slug)}건</dd>
              </div>
            </dl>
            <div className="featured-company-actions">
              <Link
                className="button primary"
                href={`/companies/${top[0].slug}`}
              >
                회사 리포트 보기
              </Link>
              {/* "담기"라고 했지만 아무것도 안 담겼다. 비교 화면은 늘 앞의
                  두 회사로 시작해서, 방금 담은 회사가 안 골라져 있었다. */}
              <Link className="text-link" href={`/compare?a=${top[0].slug}`}>
                이 회사로 비교하기
              </Link>
            </div>
          </article>
          <div className="ranked-companies">
            {/* 목록은 관심도 순인데 열 이름은 "순위"이고 옆에는 평점만
                보였다. 02→4.3, 03→3.7, 04→4.0 처럼 아래가 위보다 높은
                줄이 생겨, 평점 순인 줄 읽으면 틀린 화면이 된다. */}
            <div className="ranked-heading">
              <span>조회 순</span>
              <span>회사 / 높은 평가 항목</span>
              <span>평점</span>
            </div>
            {top.slice(1).map((company, index) => (
              <Link
                className="ranked-company"
                href={`/companies/${company.slug}`}
                key={company.slug}
              >
                <strong>0{index + 2}</strong>
                <span className={`company-logo logo-${company.slug}`}>
                  {company.name.slice(0, 1)}
                </span>
                <span className="ranked-company-copy">
                  <b>{company.name}</b>
                  {/* 점수가 "집계 전"인데 부제만 "세일즈 툴 4.7" 이면
                      한 줄 안에서 말이 어긋난다. */}
                  <small>
                    {companyScore(
                      state.reviews,
                      company.slug,
                      company.score,
                    ) === null
                      ? "집계 전"
                      : (topDimension(company) ?? "집계 전")}
                  </small>
                </span>
                <span className="ranked-company-score">
                  {scoreText(
                    companyScore(state.reviews, company.slug, company.score),
                  )}
                  <small>
                    {company.trend >= 0
                      ? `+${company.trend}%`
                      : `${company.trend}%`}
                  </small>
                </span>
              </Link>
            ))}
            <div className="ranked-note">
              <span>평가 기준</span>
              <p>최근 12개월 리뷰와 재직 확인 여부를 반영합니다.</p>
              <Link className="text-link" href="/trust">
                산정 방식 확인
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="insight-section">
        <div className="page-shell insight-grid">
          <div>
            <p className="kicker">커뮤니티</p>
            <h2>최근 많이 본 글</h2>
            <p>영업 실무, 이직, 팀 운영에 관한 질문과 경험을 모았습니다.</p>
            <Link className="button secondary" href="/community">
              커뮤니티 둘러보기
            </Link>
          </div>
          <div className="story-list">
            {/* 전에는 `slice(1, 4)` 라 첫 글을 이유 없이 건너뛰었다.
                도움이 제일 많은 글이 홈에 영영 안 나오고, 방금 쓴 글도
                밀려났다. 블라인드된 글도 그대로 남아 있었다. */}
            {state.posts
              .filter((post) => !state.hiddenPostIds.includes(post.id))
              .slice(0, 3)
              .map((post) => (
                <Link href={`/posts/${post.id}`} key={post.id}>
                  <span className="story-board">{post.board}</span>
                  <span className="story-copy">
                    <h3>{post.title}</h3>
                    <small>
                      {post.author}
                      {post.badge ? ` · ${post.badge}` : ""}
                    </small>
                  </span>
                  <span className="story-stats">
                    도움 {post.likes} · 댓글 {post.comments.length}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </section>

      <section className="page-shell section decision-section">
        <div className="decision-card compare-card">
          <div>
            <p className="kicker">회사 비교</p>
            <h2>
              결정 전에, 두 회사를
              <br />
              나란히 보세요.
            </h2>
            <p>목표·인센티브·리드 배분 등 핵심 조건의 차이를 확인합니다.</p>
          </div>
          <Link className="button primary" href="/compare">
            회사 비교하기
          </Link>
        </div>
        <div className="decision-card question-card">
          <div>
            <p className="kicker">영업 Q&amp;A</p>
            <h2>
              지원 전 궁금한 점,
              <br />
              현직자에게 물어보세요.
            </h2>
            <p>회사와 직무를 적어 올리면 해당 경험이 있는 회원이 답합니다.</p>
          </div>
          <Link className="button secondary" href="/questions/new">
            질문 올리기
          </Link>
        </div>
      </section>
    </main>
  );
}

function CompanyCard({
  company,
  score,
  reviewCount,
}: {
  // 전에는 `(typeof companies)[number]` 였다. 회사 목록이 모듈 상수가
  // 아니라 DB 에서 오므로 타입을 직접 가리킨다.
  company: Company;
  /** 공개 리뷰가 없으면 null. 화면에는 "집계 전"으로 나간다. */
  score: number | null;
  /** 점수와 같은 출처에서 센 개수. 서버 집계와 어긋나지 않게 한다. */
  reviewCount: number;
}) {
  return (
    /*
      카드 전체가 눌린다.

      전에는 회사 이름 글자에만 링크가 걸려 있어서, 목록에서 카드를 눌러도
      아무 일이 없었다. 링크 자체는 그대로 두고(스크린리더·새 탭 열기가
      유지된다) 그 링크를 카드 전면에 깔아 어디를 눌러도 넘어가게 한다.
    */
    <article className="company-card is-clickable">
      <div className="company-card-head">
        <span className={`company-logo logo-${company.slug}`}>
          {company.name.slice(0, 1)}
        </span>
      </div>
      <p className="caption">
        {company.industry} · {company.type}
      </p>
      <h3>
        <Link className="card-link" href={`/companies/${company.slug}`}>
          {company.name}
        </Link>
        {/* 눌러서 들어간다는 표시. 카드 전체가 링크라 단서가 필요하다. */}
        <span className="card-go" aria-hidden="true">
          <IconChevron />
        </span>
      </h3>
      <p>{company.summary}</p>
      <div className="score-line">
        {/* 공개 리뷰가 없으면 별도 점수도 안 보여 준다. 별만 남으면 평점이
            있는데 0 인 것처럼 읽힌다. */}
        {score !== null ? (
          <span className="star">
            <IconStar />
          </span>
        ) : null}
        <strong>{scoreText(score)}</strong>
        <span>리뷰 {reviewCount}</span>
        <b className={company.trend >= 0 ? "up" : "down"}>
          관심도 {company.trend >= 0 ? "+" : ""}
          {company.trend}%
        </b>
      </div>
    </article>
  );
}

function Companies({ state }: { state: DemoState }) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("전체");
  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);
  const filtered = companies.filter(
    (company) =>
      (industry === "전체" || company.industry === industry) &&
      `${company.name}${company.industry}${company.type}`.includes(query),
  );
  return (
    <main id="main" tabIndex={-1} className="page-shell page">
      <PageTitle
        eyebrow="회사 리뷰"
        title="회사 리뷰 찾기"
        description="회사명이나 업종을 검색하고 영업환경 점수를 비교하세요."
      />
      <div className="filter-bar">
        <label>
          회사 검색
          <input
            data-testid="company-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회사명, 업종, 영업유형"
          />
        </label>
        <label>
          업종
          <select
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            <option>전체</option>
            {[...new Set(companies.map((company) => company.industry))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <span>회사 {filtered.length}곳</span>
      </div>
      {filtered.length ? (
        <div className="company-list">
          {filtered.map((company) => (
            <CompanyCard
              key={company.slug}
              company={company}
              score={companyScore(state.reviews, company.slug, company.score)}
              reviewCount={reviewCountOf(state.reviews, company.slug)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          <span>검색 결과 0</span>
          <h2>조건에 맞는 회사가 없습니다.</h2>
          <p>회사명을 줄여 검색하거나 업종 필터를 초기화해 보세요.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setIndustry("전체");
            }}
          >
            검색 조건 초기화
          </button>
        </div>
      )}
    </main>
  );
}

function CompanyDetail({ slug, state }: { slug: string; state: DemoState }) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  /* 없는 slug 면 목록 첫 회사를 보여 줬다. `/companies/does-not-exist` 가
     노스스타 페이지를 그리고 빵부스러기까지 "노스스타 클라우드"로 떴다.
     방문자는 자기가 어디에 있는지 알 수 없다. */
  const company = companies.find((item) => item.slug === slug);
  if (!company) return <NotFound />;
  const reviews = state.reviews.filter(
    (review) =>
      review.companySlug === company.slug && review.status === "published",
  );
  const score = companyScore(state.reviews, company.slug, company.score);
  const dimensionScores = dimensionScoresOf(state.reviews, company);
  const rankedDimensions = Object.entries(dimensionScores ?? {}).sort(
    ([, a], [, b]) => b - a,
  );
  const strongest = rankedDimensions[0];
  const weakest = rankedDimensions[rankedDimensions.length - 1];
  return (
    <main
      id="main"
      tabIndex={-1}
      className="page-shell page company-detail-page"
    >
      <nav className="breadcrumb" aria-label="현재 위치">
        <Link href="/companies">회사 탐색</Link>
        <span>/</span>
        <span>{company.name}</span>
      </nav>
      <div className="company-hero">
        <div className="company-identity">
          <span
            className={`company-logo company-logo-large logo-${company.slug}`}
          >
            {company.name.slice(0, 1)}
          </span>
          <div>
            <p className="kicker">
              {company.industry} · {company.type}
            </p>
            <h1>{company.name}</h1>
            <p>{company.summary}</p>
            {/*
              한 화면에서 리뷰 수를 네 가지로 말했다. 여기 "리뷰 18건",
              탭 "현직자 리뷰 2", 6축 "표본 18", 오른쪽 "현재 공개 2건".
              18 은 회사 레코드에 적힌 값이고 실제 리뷰는 2건뿐이다.

              "최근 업데이트 3일 전"도 모든 회사에 똑같이 박혀 있었다.
            */}
            <div className="company-facts">
              <span>리뷰 {reviews.length}건</span>
              <span>최근 12개월 리뷰 반영</span>
            </div>
          </div>
        </div>
        <div className="company-decision-box">
          <div className="score-monument">
            <span>영업환경 종합</span>
            <strong>
              {/* 전에는 `★` 글자를 CSS content 로 붙였다. 굵기가 옆의 다른
                  아이콘들과 안 맞았고, 좁은 화면에서는 숫자 위로 떠올랐다. */}
              <i className="score-star" aria-hidden="true">
                <IconStar />
              </i>
              {scoreText(score)}
            </strong>
            <small>
              재직 확인 리뷰{" "}
              {reviews.filter((review) => review.verified).length}건 포함
            </small>
          </div>
          <div className="company-decision-actions">
            <Link
              className="button primary"
              href={`/reviews/new?company=${company.slug}`}
            >
              익명 리뷰 작성
            </Link>
            <Link className="button secondary" href="/compare">
              다른 회사와 비교
            </Link>
          </div>
        </div>
      </div>
      <nav className="company-tabs" aria-label="회사 정보 섹션">
        <a href="#overview">리뷰 요약</a>
        <a href="#environment">영업환경 6축</a>
        <a href="#reviews">현직자 리뷰 {reviews.length}</a>
      </nav>
      <section className="decision-overview" id="overview">
        <div className="decision-summary">
          <p className="kicker">리뷰 요약</p>
          <h2>리뷰에서 확인된 주요 내용</h2>
          <div className="decision-findings">
            {/* 리뷰가 0건이면 강점도 확인 항목도 말할 수 없다. 위에서
                "집계 전"이라고 해 놓고 여기서 "세일즈 툴 4.7 이 가장 높은
                점수"라고 하면 앞뒤가 안 맞는다. */}
            {strongest && weakest ? (
              <>
                <article>
                  <span className="finding-label positive">강점</span>
                  <div>
                    <strong>
                      {strongest[0]} {strongest[1].toFixed(1)}
                    </strong>
                    <p>6개 평가 항목 중 가장 높은 점수입니다.</p>
                  </div>
                </article>
                <article>
                  <span className="finding-label caution">확인</span>
                  <div>
                    <strong>
                      {weakest[0]} {weakest[1].toFixed(1)}
                    </strong>
                    <p>6개 평가 항목 중 가장 낮은 점수입니다.</p>
                  </div>
                </article>
              </>
            ) : (
              <article>
                <span className="finding-label neutral">집계 전</span>
                <div>
                  <strong>공개된 리뷰 없음</strong>
                  <p>리뷰가 쌓이면 강점과 확인 항목이 여기에 나옵니다.</p>
                </div>
              </article>
            )}
            <article>
              <span className="finding-label neutral">변화</span>
              <div>
                <strong>
                  관심도 {company.trend >= 0 ? "+" : ""}
                  {company.trend}%
                </strong>
                <p>지난 4주 대비 회사 상세 조회수 변화입니다.</p>
              </div>
            </article>
          </div>
        </div>
        <aside className="fit-checklist">
          <span>리뷰에서 언급된 팀 운영 방식</span>
          <ul>
            {(companySignals[company.slug] ?? []).map((signal) => (
              <li key={signal}>
                <IconCheck />
                {signal}
              </li>
            ))}
          </ul>
          <Link className="text-link" href="/questions/new">
            현직자에게 확인 질문하기
          </Link>
        </aside>
      </section>
      <section className="section-tight" id="environment">
        <div className="section-heading">
          <div>
            <p className="kicker">항목별 점수</p>
            <h2>영업환경 6축</h2>
          </div>
          <span className="trust-chip">
            표본 {reviews.length} · 최근 12개월
          </span>
        </div>
        {/* 리뷰가 0건인데 막대 여섯 개가 꽉 차 있으면 안 된다. 바로 위
            꼬리표가 "표본 0" 이라 특히 어긋나 보였다. */}
        {dimensionScores ? (
          <div className="score-bars">
            {Object.entries(dimensionScores).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <div>
                  <i style={{ width: `${value * 20}%` }} />
                </div>
                <strong>{value.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="list-empty">
            공개된 리뷰가 없어 항목별 점수를 계산할 수 없습니다.
          </p>
        )}
      </section>
      <section className="section-tight" id="reviews">
        <div className="section-heading">
          <div>
            <p className="kicker">회사 리뷰</p>
            <h2>재직자·퇴사자 리뷰</h2>
          </div>
          <div className="review-heading-actions">
            <span>최신순</span>
            <Link className="text-link" href="/trust">
              검증·익명성 기준
            </Link>
          </div>
        </div>
        <div className="review-layout">
          <div className="review-list">
            {/* 다른 목록에는 다 있는데 여기만 빈 상태가 없었다. 리뷰를 전부
                가리면 커다란 빈 자리만 남아 화면이 덜 그려진 것처럼 보였다. */}
            {reviews.length === 0 ? (
              <p className="list-empty">
                공개된 리뷰가 없습니다. 첫 리뷰를 남기면 여기에 표시됩니다.
              </p>
            ) : null}
            {reviews.map((review) => (
              <article key={review.id}>
                <div>
                  <span className="trust-chip">
                    {review.verified ? "재직 검증" : "일반"}
                  </span>
                  <span>{review.employment}</span>
                  <strong>
                    <IconStar /> {review.score.toFixed(1)}
                  </strong>
                </div>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <small>최근 12개월 경험 · 개인 식별정보 분리 보관</small>
              </article>
            ))}
          </div>
          <aside className="review-guide">
            <strong>리뷰를 읽는 기준</strong>
            <p>점수 하나보다 같은 항목이 반복해서 언급되는지 확인하세요.</p>
            <dl>
              <div>
                <dt>재직 검증</dt>
                <dd>이메일·증빙 확인</dd>
              </div>
              <div>
                <dt>최근 리뷰</dt>
                <dd>12개월 이내</dd>
              </div>
              <div>
                <dt>현재 공개</dt>
                <dd>{reviews.length}건</dd>
              </div>
            </dl>
            <Link className="button secondary" href="/reviews/new">
              내 경험 남기기
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ReviewForm({
  state,
  setState,
  notify,
  onRoleChange,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  const router = useRouter();
  /*
    어느 회사 페이지에서 왔는지를 받는다.

    전에는 무조건 목록 첫 회사가 골라져 있었다. 노스스타 상세에서 "익명
    리뷰 작성"을 누르면 폼에는 모자이크가 떠 있고, 그대로 등록하면 **리뷰가
    다른 회사에 달렸다.** 회사 칸을 안 보고 넘어가면 알아챌 방법이 없다.
  */
  const [companySlug, setCompanySlug] = useState(companies[0].slug);
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("company");
    if (from && companies.some((c) => c.slug === from)) setCompanySlug(from);
    // 목록이 DB 에서 늦게 오므로 도착한 뒤 한 번 더 맞춘다.
  }, [companies]);
  const [score, setScore] = useState(4.2);
  const [dimensions, setDimensions] = useState<Record<string, number>>(() =>
    Object.fromEntries(reviewDimensions.map((label) => [label, 4.0])),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const review: Review = {
      id: `r-${Date.now()}`,
      companySlug,
      title: String(data.get("title")),
      body: String(data.get("body")),
      score,
      dimensions,
      status: "published",
      employment: data.get("employment") as "재직" | "퇴사",
      verified: state.role === "verified",
    };
    setState((current) => ({
      ...current,
      reviews: [review, ...current.reviews],
    }));
    const companyId = state.companyIds?.[companySlug];
    if (companyId) {
      persist("company.review.create", {
        companyId,
        title: review.title,
        body: review.body,
        employmentStatus: review.employment === "재직" ? "current" : "former",
        // 6축을 DB 가 쓰는 영어 키로 바꾼다. check 제약이 이 이름을 요구한다.
        scoreDimensions: Object.fromEntries(
          Object.entries(dimensions).map(([label, value]) => [
            AXIS_KEY[label] ?? label,
            value,
          ]),
        ),
      });
    }
    notify("리뷰를 등록했습니다. 회사 점수에 반영됐어요.");
    router.push(`/companies/${companySlug}`);
  };
  return (
    <main id="main" tabIndex={-1} className="page-shell page narrow">
      <PageTitle
        eyebrow="회사 리뷰"
        title="익명 리뷰 작성"
        description="개인이나 고객을 특정할 수 있는 정보는 제외해 주세요. 등록 전에 개인정보 포함 여부를 확인합니다."
      />
      {/*
        비회원은 리뷰를 쓸 수 없다.

        글·질문 폼은 막아 뒀는데 리뷰 폼만 열려 있었다. 비회원으로 그냥
        등록되고 공개 목록에 published 로 올라갔다. 역할별 권한 차이를
        보여 주는 데모인데 그 전제가 깨진다.
      */}
      {state.role === "guest" ? (
        <LockedRoleFeature
          badge="회원 전용"
          title="익명 리뷰 작성"
          description="일반 영업인 역할부터 리뷰를 올릴 수 있습니다."
          targetRole="sales"
          onRoleChange={onRoleChange}
        />
      ) : (
        <>
          {state.role === "verified" ? (
            <div className="role-feature-note is-unlocked">
              <span className="role-access-badge">인증 영업인 전용</span>
              <div>
                <strong>
                  이 역할로 작성한 리뷰에는 재직 확인 표시가 붙습니다.
                </strong>
                <p>다른 방문자에게 작성자의 확인 수준만 공개됩니다.</p>
              </div>
            </div>
          ) : (
            <LockedRoleFeature
              badge="인증 영업인 전용"
              title="재직 확인 표시가 붙은 리뷰 작성"
              description="인증 영업인 역할로 바꾸면 작성한 리뷰에 재직 확인 표시가 붙습니다."
              targetRole="verified"
              onRoleChange={onRoleChange}
            />
          )}
          <form
            onInvalidCapture={koreanValidity}
            onInputCapture={clearValidity}
            className="form-panel"
            onSubmit={submit}
          >
            <label>
              회사
              <select
                value={companySlug}
                onChange={(event) => setCompanySlug(event.target.value)}
              >
                {companies.map((company) => (
                  <option value={company.slug} key={company.slug}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label>
                재직 상태
                <select name="employment">
                  <option>재직</option>
                  <option>퇴사</option>
                </select>
              </label>
              {/* 아래 6축과 같은 모양으로 맞춘다. 전에는 이름과 값이 한 줄에
              그냥 흘러서 옆의 select 와 높이가 안 맞았고, 값이 오른쪽 끝에
              붙는 6축과도 규칙이 달랐다. */}
              <label className="range-field">
                <span>
                  종합 점수 <b>{score.toFixed(1)}</b>
                </span>
                <input
                  aria-label="종합 점수"
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={score}
                  onChange={(event) => setScore(Number(event.target.value))}
                />
              </label>
            </div>
            <fieldset className="dimension-fields">
              <legend>영업환경 항목별 평가</legend>
              {reviewDimensions.map((label) => (
                <label key={label}>
                  <span>
                    {label} <b>{dimensions[label].toFixed(1)}</b>
                  </span>
                  <input
                    aria-label={label}
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={dimensions[label]}
                    onChange={(event) =>
                      setDimensions((current) => ({
                        ...current,
                        [label]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            <label>
              한 줄 요약
              <input
                name="title"
                required
                minLength={5}
                placeholder="이 회사의 영업환경을 한 문장으로"
              />
            </label>
            <label>
              상세 경험
              <textarea
                name="body"
                required
                minLength={20}
                rows={7}
                placeholder="목표, 리드, 보상, 협업과 코칭에서 실제로 경험한 점을 알려주세요."
              />
            </label>
            <div className="privacy-note">
              <strong>익명성 보호</strong>
              <p>
                공개 프로필과 리뷰 작성자 식별키를 분리합니다. 운영자도 승인된
                분쟁 절차와 감사기록 없이 작성자를 볼 수 없습니다.
              </p>
            </div>
            <button className="button primary" type="submit">
              리뷰 등록하고 통계 보기
            </button>
          </form>
        </>
      )}
    </main>
  );
}

function Community({
  state,
  setState,
  notify,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const [board, setBoard] = useState("전체");
  const [search, setSearch] = useState("");
  const matches = (post: Post) =>
    !state.hiddenPostIds.includes(post.id) &&
    `${post.title}${post.body}${post.author}`.includes(search);
  const posts = state.posts.filter(
    (post) => matches(post) && (board === "전체" || post.board === board),
  );
  /*
    게시판별 개수도 검색을 따라간다.

    전에는 검색과 무관하게 전체를 셌다. 찾는 말이 없어서 목록이 "0개 결과"
    인데 왼쪽에는 "전체 4" 가 그대로 떠 있었다. 어느 쪽이 맞는 말인지
    알 수 없다.
  */
  /** 걸러지지 않은 전체. 머리말 숫자는 이걸 센다. */
  const allPosts = state.posts.filter(
    (post) => !state.hiddenPostIds.includes(post.id),
  );
  const boardCount = (value: string) =>
    state.posts.filter(
      (post) => matches(post) && (value === "전체" || post.board === value),
    ).length;
  const toggleSave = (id: string) => {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === id ? { ...post, saved: !post.saved } : post,
      ),
    }));
    persist("community.bookmark.toggle", { postId: id });
    notify("스크랩 상태가 변경됐습니다.");
  };
  return (
    <main id="main" tabIndex={-1} className="page community-page">
      <section className="community-hero">
        <div className="page-shell community-hero-inner">
          <div>
            <p className="kicker">영업 커뮤니티</p>
            <h1>
              먼저 검색하고,
              <br />
              없으면 질문하세요.
            </h1>
            <p>영업 질문과 현장 사례를 검색할 수 있습니다.</p>
          </div>
          <div className="community-hero-actions">
            <Link className="button primary" href="/questions/new">
              질문 작성
            </Link>
            <Link className="button secondary" href="/posts/new">
              경험 공유
            </Link>
          </div>
          {/*
            94% · 18분 · 4,812명이 박혀 있었다. 바로 아래 목록에는 여섯 글
            중 셋이 "답변 0"으로 떠 있어서, 화면이 스스로를 반박했다.

            셀 수 있는 것만 센다.
          */}
          <dl className="community-stats">
            {/*
              걸러진 목록(`posts`)에서 셌더니 게시판 탭을 누르거나 검색어를
              넣을 때마다 머리말 숫자가 같이 움직였다. 서비스 전체를 말하는
              자리인데 "답변이 달린 글 0/0" 이 되기도 했다. 셋 중 "게시판
              4개"만 안 움직여서 더 어긋나 보였다.
            */}
            <div>
              <dt>답변이 달린 글</dt>
              <dd>
                {allPosts.filter((post) => post.comments.length).length}/
                {allPosts.length}
              </dd>
            </div>
            <div>
              <dt>AI 첫 답변</dt>
              <dd>
                {allPosts.filter((post) => post.ai === "posted").length}건
              </dd>
            </div>
            <div>
              <dt>게시판</dt>
              <dd>4개</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="page-shell community-workspace">
        <aside className="community-channels">
          <span className="rail-label">주제별 탐색</span>
          <nav className="board-tabs" aria-label="커뮤니티 게시판">
            {["전체", "Q&A", "노하우", "실적", "자유"].map((value) => (
              <button
                className={board === value ? "active" : ""}
                onClick={() => setBoard(value)}
                key={value}
              >
                <span>{value}</span>
                <b>{boardCount(value)}</b>
              </button>
            ))}
          </nav>
          <div className="channel-guide">
            <strong>좋은 질문의 조건</strong>
            <p>
              상황, 시도한 방법, 원하는 결과를 함께 적으면 더 구체적인 답을 받을
              수 있습니다.
            </p>
            <Link className="text-link" href="/questions/new">
              질문 올리기
            </Link>
          </div>
        </aside>
        <section className="community-main">
          <div className="community-toolbar">
            <label>
              <span className="visually-hidden">커뮤니티 검색</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="질문과 노하우 검색"
              />
            </label>
            <span className="feed-count">{posts.length}개 결과</span>
          </div>
          <div className="feed">
            {posts.length === 0 ? (
              <p className="list-empty">
                조건에 맞는 글이 없습니다. 검색어를 줄이거나 다른 게시판을 눌러
                보세요.
              </p>
            ) : null}
            {posts.map((post) => (
              <article
                key={post.id}
                className={post.board === "Q&A" ? "question-post" : ""}
              >
                {/* 전에는 노하우→N, 실적→R, 자유→F 로 로마자를 붙였다.
                    무슨 기준인지 안 읽히고, 회사 카드의 머리글자는 전부
                    한글 첫 글자라 여기만 따로 놀았다. */}
                <div className="post-index">
                  {post.board === "Q&A" ? "Q" : post.board.slice(0, 1)}
                </div>
                <div className="post-content">
                  <div className="post-meta">
                    <span>{post.board}</span>
                    <strong>{post.author}</strong>
                    {post.badge ? <b>{post.badge}</b> : null}
                  </div>
                  <h2>
                    <Link href={`/posts/${post.id}`}>{post.title}</Link>
                  </h2>
                  <p>{post.body}</p>
                  <div className="post-actions">
                    <span>도움 {post.likes}</span>
                    <span>답변 {post.comments.length}</span>
                    {/* `post.ai` 는 queued·thinking 일 때도 참이다. 답변이
                        0건인 글에 "첫 답변 완료"가 붙었고, 관리자 화면은
                        같은 글을 "AI 첫 답변 대기"로 세고 있었다. */}
                    {post.ai === "posted" ? (
                      <span className="ai-label">첫 답변 완료</span>
                    ) : null}
                    <button
                      className={post.saved ? "is-on" : undefined}
                      onClick={() => toggleSave(post.id)}
                    >
                      <IconBookmark filled={post.saved} />
                      {post.saved ? "스크랩됨" : "스크랩"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside className="community-rail">
          <section>
            <span className="rail-label">지금 많이 찾는 주제</span>
            {/*
              전부 `/community` 로 갔다. 지금 보고 있는 그 페이지라, 눌러도
              화면만 다시 그려졌다. 옆의 숫자(42·31·28·19)는 걸러진 결과가
              있다는 뜻으로 읽히는데 실제 글 수와 아무 상관이 없었다.

              누르면 검색어로 넣고, 숫자는 진짜 걸리는 글 수를 센다.
            */}
            <ol>
              {POPULAR_TOPICS.map((topic) => (
                <li key={topic}>
                  <button
                    type="button"
                    className="rail-topic"
                    onClick={() => {
                      setSearch(topic);
                      setBoard("전체");
                    }}
                  >
                    {topic}
                  </button>
                  <span>
                    {
                      state.posts.filter((post) =>
                        `${post.title}${post.body}`.includes(topic),
                      ).length
                    }
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="answer-standard">
            <span>답변자 확인 정보</span>
            <strong>경력·재직·실적 확인 여부를 표시합니다.</strong>
            <p>답변자 이름 옆의 확인 배지를 참고하세요.</p>
            <Link className="text-link" href="/trust">
              검증 정책
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}

/** 서식 도구. 아이콘과 이름을 같이 둔다 - 아이콘만으로는 뜻이 안 통한다. */
/*
  서식 도구.

  전에는 누르면 "굵게 서식 도구를 선택했습니다." 라는 알림만 떴다. 본문은
  건드리지 않았으니 네 개 다 아무 일도 안 하는 버튼이었다. 눌러 보면 바로
  들통나는 자리라, 없느니만 못했다.

  고른 부분을 표시로 감싼다. 줄 단위 도구(목록·인용)는 각 줄 앞에 붙인다.
*/
const EDITOR_TOOLS = [
  { label: "굵게", Icon: IconBold, wrap: "**" },
  { label: "링크", Icon: IconLink, link: true },
  { label: "목록", Icon: IconList, prefix: "- " },
  { label: "인용", Icon: IconQuote, prefix: "> " },
] as const;

type EditorTool = (typeof EDITOR_TOOLS)[number];

/** 고른 글자에 표시를 입힌다. 고른 게 없으면 자리만 만들고 커서를 넣는다. */
function applyEditorTool(area: HTMLTextAreaElement, tool: EditorTool) {
  const { selectionStart: from, selectionEnd: to } = area;
  const picked = area.value.slice(from, to);

  if ("prefix" in tool) {
    const lines = (picked || "").split("\n");
    area.setRangeText(
      lines.map((line) => `${tool.prefix}${line}`).join("\n"),
      from,
      to,
      "end",
    );
  } else if ("link" in tool) {
    area.setRangeText(`[${picked || "링크 글자"}](https://)`, from, to, "end");
  } else {
    area.setRangeText(
      `${tool.wrap}${picked || "굵게"}${tool.wrap}`,
      from,
      to,
      "end",
    );
  }
  // setRangeText 는 input 이벤트를 안 쏜다. React 가 모르면 안 되는 값은
  // 아니지만(제어하지 않는 textarea 다), 글자 수 확인 같은 게 붙으면
  // 필요하다.
  area.dispatchEvent(new Event("input", { bubbles: true }));
  area.focus();
}

function PostForm({
  state,
  setState,
  notify,
  onRoleChange,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  const router = useRouter();
  /** 고른 파일 이름. 입력을 숨겼으므로 화면에 직접 보여 준다. */
  const [imageNames, setImageNames] = useState<string[]>([]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = `p-${Date.now()}`;
    const images = data
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .map((file) => file.name);
    const post: Post = {
      id,
      board: data.get("board") as Post["board"],
      title: String(data.get("title")),
      body: String(data.get("body")),
      author: state.profile.name,
      badge: state.role === "verified" ? "검증 영업인 L2" : undefined,
      likes: 0,
      saved: false,
      comments: [],
      images,
    };
    setState((current) => ({
      ...current,
      posts: [post, ...current.posts],
    }));
    const boardId = state.boardIds?.[post.board];
    if (boardId) {
      persist("community.post.create", {
        boardId,
        title: post.title,
        body: post.body,
      });
    }
    notify("게시글을 올렸습니다.");
    router.push(`/posts/${id}`);
  };
  return (
    <main id="main" tabIndex={-1} className="page-shell page narrow">
      <PageTitle
        eyebrow="커뮤니티"
        title="게시글 작성"
        description="영업 경험이나 업무 자료를 공유할 수 있습니다. 데모에서는 첨부 파일의 이름만 저장합니다."
      />
      {/*
        비회원은 글을 쓸 수 없다. 전에는 폼이 그대로 열려서 비회원도
        등록됐다 - 역할별 권한 차이를 보여 주는 데모인데 그 전제가 깨진다.
      */}
      {state.role === "guest" ? (
        <LockedRoleFeature
          badge="회원 전용"
          title="게시글 작성"
          description="일반 영업인 역할부터 글을 올릴 수 있습니다."
          targetRole="sales"
          onRoleChange={onRoleChange}
        />
      ) : (
        <form
          onInvalidCapture={koreanValidity}
          onInputCapture={clearValidity}
          className="form-panel"
          onSubmit={submit}
        >
          <label>
            게시판
            <select name="board" defaultValue="노하우">
              {(["자유", "실적", "노하우"] as Post["board"][]).map((board) => (
                <option key={board}>{board}</option>
              ))}
            </select>
          </label>
          <label>
            제목
            <input name="title" required minLength={5} />
          </label>
          <div className="editor-field">
            <label htmlFor="post-body">내용</label>
            <span className="editor-toolbar" aria-label="웹 에디터 도구">
              {EDITOR_TOOLS.map((tool) => (
                <button
                  type="button"
                  key={tool.label}
                  title={tool.label}
                  aria-label={tool.label}
                  onClick={() => {
                    const area =
                      document.querySelector<HTMLTextAreaElement>("#post-body");
                    if (area) applyEditorTool(area, tool);
                  }}
                >
                  <tool.Icon />
                  <span>{tool.label}</span>
                </button>
              ))}
            </span>
            <textarea
              id="post-body"
              name="body"
              rows={9}
              required
              minLength={20}
            />
          </div>
          <div className="field">
            <span className="field-label">이미지 첨부</span>
            {/*
              브라우저가 그리는 파일 선택 칸을 그대로 뒀더니 "Choose Files /
              No file chosen" 이 떴다. 화면에서 유일한 영어이자 유일하게
              꾸미지 않은 칸이었다. 입력은 숨기고 label 을 버튼으로 쓴다.
            */}
            <div className="upload-field">
              <label className="button secondary upload-pick">
                이미지 선택
                <input
                  name="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) =>
                    setImageNames(
                      Array.from(event.target.files ?? []).map(
                        (file) => file.name,
                      ),
                    )
                  }
                />
              </label>
              <small>
                {imageNames.length
                  ? imageNames.join(", ")
                  : "JPG·PNG·WebP · 데모에서는 파일 이름만 저장합니다."}
              </small>
            </div>
          </div>
          <button className="button primary">게시글 등록</button>
        </form>
      )}
    </main>
  );
}

/** 답글 표시. 이 글자로 시작하면 화면에서 한 단계 들여쓴다. */
const REPLY_MARK = "↳ ";

/**
 * 답글을 부모 바로 뒤에 넣는다. 그 부모에게 이미 달린 답글들 다음 자리다 -
 * 안 그러면 먼저 단 답글이 뒤로 밀린다.
 */
function insertComment(
  comments: string[],
  body: string,
  parentIndex: number | null,
): string[] {
  if (parentIndex === null) return [...comments, body];
  let at = parentIndex + 1;
  while (at < comments.length && comments[at].startsWith(REPLY_MARK)) at += 1;
  return [...comments.slice(0, at), body, ...comments.slice(at)];
}

/**
 * 커뮤니티 오른쪽에 거는 주제.
 *
 * 눌러서 검색어로 들어가는 값이라, 실제로 글에 나오는 말로 둔다. 보기 좋은
 * 말을 적어 두면 눌렀을 때 결과가 0건이 된다.
 */
const POPULAR_TOPICS = ["엔터프라이즈", "ROI", "파이프라인", "영업 리더"];

/** 신고 사유. 값은 서버의 reason_code 로 그대로 나간다. */
const REPORT_REASONS = [
  { code: "spam_promotion", label: "광고·홍보" },
  { code: "abusive_language", label: "욕설·비방" },
  { code: "copyright", label: "저작권 침해" },
  { code: "privacy", label: "개인정보 노출" },
  { code: "other", label: "기타" },
] as const;

function PostDetail({
  id,
  state,
  setState,
  notify,
  onRoleChange,
}: {
  id: string;
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  /* 없는 id 면 첫 글을 보여 줬다. 블라인드된 글도 그대로 다 보였다. */
  const post = state.posts.find(
    (item) => item.id === id && !state.hiddenPostIds.includes(item.id),
  );
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);
  /* 훅을 다 부른 뒤에 돌려보낸다. 위에서 빠져나가면 렌더마다 훅 개수가
     달라져 React 가 상태를 잘못 잇는다. */
  if (!post) return <NotFound />;

  /**
   * 답변과 답글을 함께 처리한다.
   *
   * 답글은 **그 답변 바로 뒤에** 꽂는다. 전에는 아래쪽 공용 입력창의 상태만
   * 바꾸고 목록 맨 끝에 붙였다. 화면에서는 "어느 답변에 단 답글인지"가
   * 사라져서, 대화가 이어지는 것처럼 안 보였다.
   */
  const addComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const rawBody = String(new FormData(form).get("comment"));
    const body = replyingTo === null ? rawBody : `${REPLY_MARK}${rawBody}`;
    if (!body.trim()) return;
    setState((current) => ({
      ...current,
      posts: current.posts.map((item) =>
        item.id === post.id
          ? {
              ...item,
              comments: insertComment(item.comments, body, replyingTo),
            }
          : item,
      ),
    }));
    persist("community.comment.create", { postId: post.id, body });
    form.reset();
    setReplyingTo(null);
    notify(
      replyingTo === null ? "댓글이 등록됐습니다." : "답글이 등록됐습니다.",
    );
  };
  return (
    <main id="main" tabIndex={-1} className="page-shell page narrow">
      <article className="post-detail">
        <div className="post-meta">
          <span>{post.board}</span>
          <strong>{post.author}</strong>
          {post.badge ? <b>{post.badge}</b> : null}
        </div>
        <h1>{post.title}</h1>
        <p className="post-body">{post.body}</p>
        {post.images?.length ? (
          <div className="attachment-list">
            {post.images.map((image) => (
              <span key={image}>첨부 이미지 · {image}</span>
            ))}
          </div>
        ) : null}
        {/*
          실제 답변이 있으면 그걸 그린다.

          전에는 어떤 질문이든 같은 고정 문구가 나왔다. 답변은 post.aiAnswer
          에 이미 들어 있는데 쓰지 않았다.
        */}
        {post.aiAnswer ? (
          <AiAnswerCard
            answer={parseFieldnoteAiAnswer(post.aiAnswer)}
            model={post.aiModel ?? ""}
          />
        ) : null}
        {/*
          전에는 답변 내용이 없는데도 "답변을 준비했습니다 / 질문 화면에서
          전체 내용을 확인할 수 있습니다."가 떴다. 그 질문 화면으로 갈 길이
          없고 이 글이 바로 그 질문이다. 내용이 있을 때만 보여 준다.
        */}
        <div className="post-actions">
          {/*
            같은 사람이 여러 번 누르면 계속 올라가던 것을 토글로 바꿨다.
            서버 액션 이름도 원래 toggle 이다 - 화면만 한 방향으로 세고
            있었다.
          */}
          <button
            className={`post-action-like${post.liked ? " is-active" : ""}`}
            aria-pressed={Boolean(post.liked)}
            onClick={() => {
              const next = !post.liked;
              setState((current) => ({
                ...current,
                posts: current.posts.map((item) =>
                  item.id === post.id
                    ? {
                        ...item,
                        liked: next,
                        likes: Math.max(0, item.likes + (next ? 1 : -1)),
                      }
                    : item,
                ),
              }));
              persist("community.reaction.toggle", {
                postId: post.id,
                active: next,
              });
              notify(
                next
                  ? "도움됐어요를 남겼습니다."
                  : "도움됐어요를 취소했습니다.",
              );
            }}
          >
            <IconThumbsUp />
            도움됐어요 {post.likes}
          </button>
          <button
            className="post-action-report"
            onClick={() => setReporting(true)}
          >
            <IconFlag />
            신고
          </button>
        </div>
      </article>
      <section className="comments">
        <h2>
          회원 답변 <span>{post.comments.length}</span>
        </h2>
        {post.comments.length === 0 ? (
          <p className="list-empty">
            아직 답변이 없습니다. 먼저 경험을 남겨 주세요.
          </p>
        ) : null}
        {post.comments.map((comment, index) => {
          const isReply = comment.startsWith(REPLY_MARK);
          return (
            <article
              key={`${comment}-${index}`}
              className={isReply ? "is-reply" : undefined}
            >
              <strong>
                {isReply
                  ? "답글"
                  : index === 0
                    ? "검증 영업인"
                    : "커뮤니티 멤버"}
              </strong>
              <p>{isReply ? comment.slice(REPLY_MARK.length) : comment}</p>
              {/* 답글에는 다시 답글을 달지 않는다. 한 단계까지만 둔다. */}
              {!isReply && state.role !== "guest" ? (
                <button
                  className="comment-reply-toggle"
                  onClick={() =>
                    setReplyingTo(replyingTo === index ? null : index)
                  }
                >
                  {replyingTo === index ? "답글 취소" : "답글"}
                </button>
              ) : null}
              {/*
                답글 입력창은 그 답변 바로 아래에 연다. 전에는 화면 맨 아래
                공용 입력창의 상태만 바뀌어서, 어디에 답글을 다는 중인지
                보이지 않았다.
              */}
              {replyingTo === index ? (
                <form
                  onInvalidCapture={koreanValidity}
                  onInputCapture={clearValidity}
                  className="comment-form is-inline"
                  onSubmit={addComment}
                >
                  <label>
                    답글 쓰기
                    <textarea name="comment" rows={3} required />
                  </label>
                  <button type="button" onClick={() => setReplyingTo(null)}>
                    취소
                  </button>
                  <button className="button primary">답글 등록</button>
                </form>
              ) : null}
            </article>
          );
        })}
        {state.role === "guest" ? (
          <LockedRoleFeature
            badge="회원 전용"
            title="현직자 답변 작성"
            description="일반 영업인 역할부터 질문에 답변하고 대화를 이어갈 수 있습니다."
            targetRole="sales"
            onRoleChange={onRoleChange}
          />
        ) : (
          <form
            onInvalidCapture={koreanValidity}
            onInputCapture={clearValidity}
            className="comment-form"
            onSubmit={addComment}
          >
            <span className="role-access-badge">회원 전용</span>
            <label>
              답변 작성
              <textarea name="comment" rows={4} required />
            </label>
            <button className="button primary">답변 등록</button>
          </form>
        )}
      </section>
      {reporting ? (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reasonCode, details) => {
            // 신고는 화면 상태를 안 바꾼다(운영 대기열로만 간다). 그래도 서버에는
            // 남아야 관리자 화면의 신고 건수가 진짜가 된다.
            persist("community.report.create", {
              targetType: "post",
              targetId: post.id,
              reasonCode,
              details,
            });
            setReporting(false);
            notify("신고를 접수했습니다. 운영자가 확인합니다.");
          }}
        />
      ) : null}
    </main>
  );
}

/**
 * 되돌리기 어려운 동작 앞에서 한 번 묻는 창.
 *
 * 신고 창과 같은 뼈대를 쓴다. 확인 창마다 모양이 다르면 같은 성격의 일인지
 * 알아보기 어렵다.
 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogFocus(true, onClose);
  return (
    <div className="role-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="report-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="report-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="button primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 신고 사유를 받는 창.
 *
 * 전에는 버튼을 누르는 즉시 접수됐다. 잘못 눌러도 되돌릴 방법이 없고,
 * 운영자는 무엇이 문제였는지 모른 채 건수만 받는다.
 */
function ReportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reasonCode: string, details: string) => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].code);
  const [details, setDetails] = useState("");
  const dialogRef = useDialogFocus(true, onClose);
  return (
    <div className="role-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="report-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="신고하기"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="kicker">운영 신고</span>
        <h2>어떤 점이 문제인가요?</h2>
        <p>확인 후 운영자가 처리합니다. 사유를 골라 주세요.</p>
        <div className="report-reasons">
          {REPORT_REASONS.map((item) => (
            <label
              key={item.code}
              className={reason === item.code ? "is-selected" : undefined}
            >
              <input
                type="radio"
                name="reason"
                value={item.code}
                checked={reason === item.code}
                onChange={() => setReason(item.code)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <label className="report-details">
          상세 설명 <span className="muted">(선택)</span>
          <textarea
            rows={3}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="어떤 부분이 문제인지 적어 주시면 처리에 도움이 됩니다."
          />
        </label>
        <div className="report-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => onSubmit(reason, details.trim())}
          >
            신고하기
          </button>
        </div>
      </div>
    </div>
  );
}

function AiAnswerCard({
  answer,
  model,
}: {
  answer: FieldnoteAiAnswer;
  model: string;
}) {
  return (
    <section className="fieldnote-answer" aria-label="AI 실무 답변">
      <header className="fieldnote-answer-header">
        <div>
          <span className="fieldnote-answer-mark" aria-hidden="true">
            F
          </span>
          <div>
            <b>FIELDNOTE 실무 답변</b>
            <small>입력·출력 안전성 검사를 통과한 초안입니다.</small>
          </div>
        </div>
        <span className="fieldnote-answer-status">
          <i aria-hidden="true" /> 작성 완료
        </span>
      </header>

      <div className="fieldnote-answer-summary">
        <span>핵심 판단</span>
        <p data-testid="ai-answer-text">{answer.summary}</p>
      </div>

      <div className="fieldnote-answer-actions fieldnote-answer-questions">
        <h3>다음 미팅에서 확인할 질문</h3>
        <ol>
          {answer.clarifyingQuestions.map((question, index) => (
            <li key={question}>
              <b>Q{index + 1}</b>
              <span>{question}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="fieldnote-answer-actions">
        <h3>다음 미팅에서 해볼 일</h3>
        <ol>
          {answer.actions.map((action, index) => (
            <li data-testid="ai-answer-action" key={action}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      </div>

      {answer.missingContext.length > 0 ? (
        <div className="fieldnote-answer-missing">
          <b>답변을 더 정확하게 만들 정보</b>
          <ul>
            {answer.missingContext.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="fieldnote-answer-caution">
        <span aria-hidden="true">
          <IconCaution />
        </span>
        <div>
          <b>놓치기 쉬운 점</b>
          <p>{answer.caution}</p>
        </div>
      </div>

      <footer className="fieldnote-answer-footer">
        <p>{model} · AI 초안은 실제 고객 상황에 맞게 조정해 사용하세요.</p>
        <Link className="button primary" href="/community">
          커뮤니티에서 보기
        </Link>
      </footer>
    </section>
  );
}

function QuestionForm({
  state,
  setState,
  notify,
  onRoleChange,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  /** 이미 만든 글의 id. 다시 등록할 때 새로 만들지 않고 이 자리를 고친다. */
  const createdIdRef = useRef<string | null>(null);
  /** 폼 아래에 걸어 두는 비슷한 질문. 실제 글에서 고른다. */
  const similar = state.posts.find(
    (post) => post.board === "Q&A" && !state.hiddenPostIds.includes(post.id),
  );
  const [status, setStatus] = useState<
    "idle" | "queued" | "thinking" | "posted" | "error"
  >("idle");
  const [title, setTitle] = useState("");
  const [aiAnswer, setAiAnswer] = useState<FieldnoteAiAnswer | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [aiError, setAiError] = useState("");
  /* 예시 문장이 값으로 들어가 있었다. 회색 안내가 아니라 검은 글씨라
     진짜 입력으로 보였고, 써 보려면 전체 선택 후 지워야 했다. */
  const [context, setContext] = useState("");
  /**
   * 질문을 올리고 AI 초안을 받는다.
   *
   * 전에는 setTimeout 세 개로 queued→thinking→posted 를 흉내 냈다. 이제는
   * 진짜로 부른다 - queued 는 요청을 보낸 순간, thinking 은 응답을 기다리는
   * 동안, posted 는 답이 온 뒤다. 상태 이름이 실제 단계와 맞는다.
   *
   * 답을 못 받아도 질문은 남긴다. 사람 답변을 기다리면 되는 흐름이고,
   * 여기서 되돌리면 방금 쓴 글이 사라져 더 나쁘다.
   */
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("queued");
    setAiAnswer(null);
    setAiModel("");
    setAiError("");
    notify("질문을 등록했습니다. AI 초안을 작성 중입니다.");

    const boardId = state.boardIds?.["Q&A"];
    if (boardId) {
      persist("community.post.create", {
        boardId,
        title,
        body: context,
        askAi: true,
      });
    }

    setStatus("thinking");
    let rawAnswer: string | null = null;
    let model = "";
    try {
      const result = await requestAiAnswer({ title, body: context });
      rawAnswer = result.rawAnswer;
      model = result.model;
      setAiAnswer(result.answer);
      setAiModel(model);
      setStatus("posted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI 답변을 받지 못했습니다.";
      setAiError(message);
      setStatus("error");
      notify(message);
    }

    /*
      다시 시도해도 글이 하나만 남는다.

      전에는 등록할 때마다 새 글을 앞에 붙였다. AI 답변이 실패해서 "질문
      다듬기"로 돌아가 다시 등록하면, 커뮤니티에 똑같은 글이 두 개 생겼다.
      실패한 쪽은 지울 방법도 없었다.

      한 번 만든 글의 id 를 들고 있다가, 다시 등록하면 그 자리를 고친다.
    */
    const post: Post = {
      id: createdIdRef.current ?? `p-${Date.now()}`,
      board: "Q&A",
      title,
      body: context,
      author: state.profile.name,
      badge: state.role === "verified" ? "검증 영업인 L2" : undefined,
      likes: 0,
      saved: false,
      comments: [],
      ai: rawAnswer ? "posted" : "queued",
      aiAnswer: rawAnswer ?? undefined,
      aiModel: model || undefined,
    };
    const isRetry = createdIdRef.current !== null;
    createdIdRef.current = post.id;
    window.sessionStorage.setItem(PENDING_QUESTION_KEY, JSON.stringify(post));
    setState((current) => ({
      ...current,
      posts: isRetry
        ? current.posts.map((item) => (item.id === post.id ? post : item))
        : [post, ...current.posts],
    }));
  };
  return (
    <main id="main" tabIndex={-1} className="page-shell page narrow">
      <PageTitle
        eyebrow="영업 Q&A"
        title="커뮤니티에 질문하기"
        description="질문 등록 후 AI 초안이 먼저 표시되고, 이후 회원 답변을 받을 수 있습니다."
      />
      {/* 비회원은 질문을 올릴 수 없다. 역할별 차이를 보여 주는 데모라
          여기서 막지 않으면 전제가 무너진다. */}
      {state.role === "guest" ? (
        <LockedRoleFeature
          badge="회원 전용"
          title="질문 올리기"
          description="일반 영업인 역할부터 질문하고 AI 답변을 받을 수 있습니다."
          targetRole="sales"
          onRoleChange={onRoleChange}
        />
      ) : status === "idle" ? (
        <form
          onInvalidCapture={koreanValidity}
          onInputCapture={clearValidity}
          className="form-panel"
          onSubmit={ask}
        >
          <label>
            질문 제목
            <input
              data-testid="question-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={8}
              placeholder="예: 첫 미팅에서 예산 질문을 자연스럽게 꺼내는 방법은?"
            />
          </label>
          <label>
            상황 설명
            <textarea
              rows={7}
              required
              placeholder="고객이 제품 필요성은 인정하지만 예산 이야기는 계속 미룹니다. 첫 미팅에서 어떤 순서로 물어봐야 할까요?"
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </label>
          {/*
            제목과 주소를 둘 다 박아 뒀다. DB 를 붙이면 글 id 가 uuid 라
            `/posts/p1` 은 없는 주소가 된다 - 전에는 없는 id 면 첫 글을
            대신 보여 줘서 안 드러났고, 그 대체를 없애자 404 가 됐다.

            실제 Q&A 글에서 하나 가져온다.
          */}
          {similar ? (
            <div className="similar-box">
              <span>작성 전 유사 질문</span>
              <Link href={`/posts/${similar.id}`}>{similar.title}</Link>
            </div>
          ) : null}
          <button className="button primary">질문 등록</button>
        </form>
      ) : (
        <div
          className="ai-progress"
          aria-live="polite"
          aria-busy={status === "queued" || status === "thinking"}
        >
          <div
            className={`progress-step ${status !== "queued" ? "done" : "active"}`}
          >
            <b>01</b>
            <span>질문 내용 검사</span>
            {status !== "queued" ? <IconCheck /> : null}
          </div>
          <div
            className={`progress-step ${status === "thinking" ? "active" : status === "posted" ? "done" : ""}`}
          >
            <b>02</b>
            <span>AI 초안 작성</span>
            {status === "posted" ? <IconCheck /> : null}
          </div>
          <div
            className={`progress-step ${status === "posted" ? "active" : ""}`}
          >
            <b>03</b>
            <span>커뮤니티 답변 대기</span>
          </div>
          {status === "posted" && aiAnswer ? (
            <AiAnswerCard answer={aiAnswer} model={aiModel} />
          ) : status === "error" ? (
            <div className="ai-result ai-result-error" role="alert">
              <span>AI 답변을 준비하지 못했습니다</span>
              <h2>질문은 정상적으로 등록됐습니다.</h2>
              <p>{aiError}</p>
              <button
                type="button"
                className="button primary"
                onClick={() => setStatus("idle")}
              >
                질문 다듬기
              </button>
            </div>
          ) : (
            <div className="thinking" role="status">
              <span aria-hidden="true" />
              <div>
                <b>
                  {status === "queued"
                    ? "질문에 민감한 정보가 없는지 확인하고 있습니다."
                    : "상황을 정리해 바로 실행할 답변을 만들고 있습니다."}
                </b>
                <p>대개 10초 안팎이 걸립니다. 이 화면을 그대로 두어 주세요.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Account({
  state,
  setState,
  notify,
  onRoleChange,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  /* 블라인드된 글은 여기서도 빠져야 한다. 커뮤니티에서는 안 보이는데
     내 활동에는 그대로 남아 있었다. */
  const visible = state.posts.filter(
    (post) => !state.hiddenPostIds.includes(post.id),
  );
  const mine = visible.filter((post) => post.author === state.profile.name);
  /*
    내가 쓴 것에서 센다.

    "내 글이 받은 도움"이 428 로 박혀 있었다. 글을 지워도 새로 써도 428
    이었다. 아래 "작성 콘텐츠"도 `mine.length + 12` 라, 아무것도 안 썼는데
    12 였다. 숫자가 화면에 있으면 사람은 그게 자기 기록이라고 읽는다.
  */
  const myHelpful = mine.reduce((sum, post) => sum + post.likes, 0);
  const myScrapped = visible.filter((post) => post.saved);
  return (
    <main id="main" tabIndex={-1} className="page-shell page">
      <PageTitle
        eyebrow="마이페이지"
        title="내 활동 관리"
        description="프로필, 작성 글, 스크랩, 확인 배지를 관리합니다."
      />
      <div className="account-grid">
        <aside className="profile-panel">
          {/* 이름을 바꿔도 "YS" 로 남아 있었고, 다른 곳의 머리글자는 전부
              한글 첫 글자인데 여기만 로마자였다. */}
          <div className="avatar">
            {(state.role === "guest"
              ? "체험 방문자"
              : state.profile.name
            ).slice(0, 1)}
          </div>
          <h2>{state.role === "guest" ? "체험 방문자" : state.profile.name}</h2>
          <p>{state.profile.headline}</p>
          <span className="trust-chip">현재 역할 {roleNames[state.role]}</span>
          <dl>
            <div>
              <dt>내 글이 받은 도움</dt>
              <dd>{myHelpful}</dd>
            </div>
            <div>
              <dt>작성 콘텐츠</dt>
              <dd>{mine.length}</dd>
            </div>
          </dl>
        </aside>
        <div className="account-content">
          <section>
            <div className="section-heading">
              <h2>프로필 관리</h2>
              <span>공개 정보</span>
            </div>
            <form
              onInvalidCapture={koreanValidity}
              onInputCapture={clearValidity}
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setState((current) => ({
                  ...current,
                  profile: {
                    name: String(data.get("profileName")),
                    headline: String(data.get("profileHeadline")),
                  },
                }));
                // 프로필 저장은 서버 액션 목록에 아직 없다. 화면에만 반영된다.
                // (execute_demo_action 의 features 에 member.profile.update 추가 필요)
                notify("프로필이 저장됐습니다.");
              }}
            >
              <label>
                표시 이름
                <input
                  name="profileName"
                  defaultValue={state.profile.name}
                  required
                />
              </label>
              <label>
                경력 한 줄
                <input
                  name="profileHeadline"
                  defaultValue={state.profile.headline}
                  required
                />
              </label>
              <button className="button secondary">프로필 저장</button>
            </form>
          </section>
          <section>
            <div className="section-heading">
              <h2>확인 배지</h2>
              <span>{state.badgeStatus}</span>
            </div>
            {state.role === "guest" ? (
              <LockedRoleFeature
                badge="일반 영업인 이상"
                title="재직·실적 확인 배지 신청"
                description="일반 영업인 역할로 전환하면 비공개 자료 제출과 심사 상태를 체험할 수 있습니다."
                targetRole="sales"
                onRoleChange={onRoleChange}
              />
            ) : (
              <div className="badge-box">
                <div>
                  <strong>L2</strong>
                  <span>재직·실적 검증</span>
                  <small className="role-access-badge">일반 영업인 이상</small>
                </div>
                <p>
                  회사 이메일과 실적 자료는 비공개로 제출합니다. 프로필에는 확인
                  결과만 표시됩니다.
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setState((current) => ({
                      ...current,
                      badgeStatus: "검토중",
                    }));
                    persist("membership.badge.submit", {
                      evidence: "demo-sample",
                    });
                    notify("샘플 확인 자료를 제출했습니다.");
                  }}
                >
                  샘플 자료 제출
                </button>
              </div>
            )}
          </section>
          <section>
            <h2>최근 활동</h2>
            <div className="activity-list">
              {myScrapped.map((post) => (
                <Link href={`/posts/${post.id}`} key={`saved-${post.id}`}>
                  <span>스크랩</span>
                  <strong>{post.title}</strong>
                </Link>
              ))}
              {/* 전에는 이 자리에 "ROI 문서 글에 댓글을 작성했습니다."가
                  늘 붙어 있었다. 방금 초기화해도 남아 있어서, 내 활동이
                  아니라 그냥 그려 둔 줄이었다. */}
              {mine.length === 0 && myScrapped.length === 0 ? (
                <p className="list-empty">
                  아직 활동이 없습니다. 글을 올리거나 스크랩하면 여기에
                  쌓입니다.
                </p>
              ) : null}
              {mine.map((post) => (
                <Link href={`/posts/${post.id}`} key={`mine-${post.id}`}>
                  <span>작성</span>
                  <strong>{post.title}</strong>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Compare({ state }: { state: DemoState }) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  const [a, setA] = useState(companies[0].slug);
  const [b, setB] = useState(companies[1].slug);
  /* 회사 페이지에서 "이 회사로 비교하기"로 왔으면 그 회사를 왼쪽에 둔다.
     안 그러면 방금 고른 회사가 아니라 늘 목록 앞 두 곳이 떠 있다. */
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("a");
    if (!from || !companies.some((c) => c.slug === from)) return;
    setA(from);
    setB((current) =>
      current === from
        ? (companies.find((c) => c.slug !== from)?.slug ?? current)
        : current,
    );
  }, [companies]);
  const selected = [
    companies.find((c) => c.slug === a)!,
    companies.find((c) => c.slug === b)!,
  ];
  return (
    <main id="main" tabIndex={-1} className="page-shell page">
      <PageTitle
        eyebrow="회사 비교"
        title="회사 비교"
        description="영업환경 6개 항목의 점수와 리뷰를 나란히 놓고 봅니다."
      />
      <div className="compare-select">
        <label>
          첫 번째 회사
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {companies.map((c) => (
              <option value={c.slug} key={c.slug} disabled={c.slug === b}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {/* "VS" 는 스포츠 중계 같은 인상이라 뺐다. 두 선택 사이를 잇는
            표시로만 둔다. */}
        <span className="compare-divider" aria-hidden="true" />
        <label>
          두 번째 회사
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {companies.map((c) => (
              <option value={c.slug} key={c.slug} disabled={c.slug === a}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* 초록 행이 무슨 뜻인지 알려 준다. 색만 칠하면 자동 채색으로 읽힌다. */}
      <p className="compare-legend">
        <span className="compare-legend-mark" aria-hidden="true" />
        상대보다 높은 항목
      </p>
      <div className="compare-grid">
        {selected.map((company, companyIndex) => {
          const other = selected[companyIndex === 0 ? 1 : 0];
          const score = companyScore(
            state.reviews,
            company.slug,
            company.score,
          );
          const otherScore = companyScore(
            state.reviews,
            other.slug,
            other.score,
          );
          const axes = dimensionScoresOf(state.reviews, company);
          const otherAxes = dimensionScoresOf(state.reviews, other);
          /*
            두 회사 중 하나라도 공개 리뷰가 없으면 앞선다고 말할 수 없다.
            숫자가 없는데 "종합 점수 +0.4" 가 뜨면 안 된다.
          */
          return (
            <article
              className={
                score !== null && otherScore !== null && score > otherScore
                  ? "comparison-leader"
                  : undefined
              }
              key={company.slug}
            >
              <p>{company.industry}</p>
              <h2>{company.name}</h2>
              <div className="compare-score">
                <strong>{scoreText(score)}</strong>
                {score !== null && otherScore !== null && score > otherScore ? (
                  <span>종합 점수 +{(score - otherScore).toFixed(1)}</span>
                ) : null}
              </div>
              {/*
                전에는 `company.scores` - 회사 레코드의 값을 그대로 썼다.
                종합 점수는 리뷰에서 계산하므로, 리뷰를 하나 쓰면 종합만
                움직이고 6축은 그대로였다. 한 번 눌러 들어가면 같은 회사의
                같은 항목이 3.5 와 2.8 로 갈렸다.

                리뷰가 없으면 항목도 못 센다. "집계 전"이라고 해 놓고 아래에
                숫자 여섯 개를 늘어놓으면 안 된다.
              */}
              {axes ? (
                reviewDimensions.map((label) => {
                  const value = axes[label];
                  const rival = otherAxes?.[label];
                  const ahead = rival !== undefined && value > rival;
                  return (
                    <div
                      className={`compare-row ${ahead ? "leading" : ""}`}
                      key={label}
                    >
                      <span>{label}</span>
                      <b>{value.toFixed(1)}</b>
                    </div>
                  );
                })
              ) : (
                <p className="list-empty">공개된 리뷰가 없습니다.</p>
              )}
              <Link className="text-link" href={`/companies/${company.slug}`}>
                리뷰 자세히 보기
              </Link>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function Admin({
  path,
  state,
  setState,
  notify,
  onRoleChange,
}: {
  path: string;
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
  onRoleChange: (role: Role) => void;
}) {
  // 회사 목록은 DB 에서 온다. 이름을 가려 아래 코드를 그대로 둔다.
  const companies = pickCompanies(state);
  const [, , demoMeta] = useDemoStateContext();
  /*
    확인 창.

    추천 영역 게시에만 확인 창이 붙어 있었다. 정작 되돌리기 어려운 쪽 -
    회원 신청 반려, 리뷰·글 블라인드 - 은 한 번 누르면 바로 나갔다.
    승인과 반려 버튼은 생김새까지 같아서, 8px 옆의 버튼을 잘못 누르면
    되돌릴 틈이 없었다.

    창 하나를 여러 곳이 나눠 쓴다. 창마다 다르게 만들면 같은 성격의 일인지
    안 읽힌다.
  */
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<
    "all" | "privacy" | "report"
  >("all");
  const flaggedReviews = state.reviews.filter((review) => review.flags?.length);
  /*
    처리한 건 세지 않는다.

    전에는 신고 표시가 붙은 리뷰를 전부 셌다. 표시는 블라인드해도 안
    없어지므로, 대기열의 세 건을 모두 처리하고 나서도 제목은 "03 처리
    대기", 필터는 "전체 3", 사이드바 배지도 3 이었다. 할 일을 다 했는데
    화면은 아무 일도 없었다고 말한다.

    목록 자체는 처리한 것도 계속 보여 준다 - 안 그러면 잘못 가린 리뷰를
    되돌릴 길이 사라진다.
  */
  const openReviews = flaggedReviews.filter(
    (review) => review.status !== "hidden",
  );
  const reviewCounts = {
    all: openReviews.length,
    privacy: openReviews.filter((review) => review.flags?.includes("privacy"))
      .length,
    report: openReviews.filter((review) => review.flags?.includes("report"))
      .length,
  };
  const reviewQueue = flaggedReviews.filter((review) => {
    if (reviewFilter === "privacy") return review.flags?.includes("privacy");
    if (reviewFilter === "report") return review.flags?.includes("report");
    return true;
  });
  if (state.role !== "admin")
    return (
      <main id="main" tabIndex={-1} className="page-shell page narrow">
        <PageTitle
          eyebrow="접근 권한"
          title="운영 관리자 역할이 필요합니다"
          description="운영 관리자 역할로 바꾸면 검토 대기열과 대시보드를 볼 수 있습니다."
        />
        <LockedRoleFeature
          badge="운영 관리자 전용"
          title="검수·회원 인증·콘텐츠 운영"
          description="운영 관리자 역할로 전환하면 신고 리뷰 대기열과 관리자 대시보드가 열립니다."
          targetRole="admin"
          onRoleChange={onRoleChange}
        />
      </main>
    );
  /*
    한 화면에 같은 대기열이 세 번 나온다 - 왼쪽 배지, 머리말 숫자, 목록.
    전에는 셋이 따로 적혀 있어서 "회원 8", "20 처리 대기", 실제 목록 2건
    이 한 화면에 같이 떴다. 어느 것이 맞는지 알 방법이 없다. 한 배열에서
    전부 센다.
  */
  const memberApplications = ["윤서진 · L2 신청", "한도윤 · 실적 인증"];
  /*
    AI 첫 답변을 아직 못 받은 글.

    전에는 "AI 답변 오류 0" 이 박혀 있었다. 실패는 화면 상태에 남지 않아서
    셀 수가 없다 - 없는 값을 0 이라고 적으면, 실제로 깨져도 정상으로 보인다.
    셀 수 있는 것(답변을 기다리는 글)으로 바꾸고 이름도 그렇게 단다.
  */
  const aiPending = state.posts.filter(
    (post) => post.ai === "queued" || post.ai === "thinking",
  ).length;
  const moderationPosts = state.posts.slice(0, 4);

  const nav = (
    <nav className="admin-nav">
      <div className="admin-nav-brand">
        <strong>FIELDNOTE 운영</strong>
        <span>관리자 화면</span>
      </div>
      <span className="admin-nav-label">요약</span>
      <Link className={path === "/admin" ? "active" : ""} href="/admin">
        대시보드
      </Link>
      <span className="admin-nav-label">검토 작업</span>
      <Link
        className={path === "/admin/reviews" ? "active" : ""}
        href="/admin/reviews"
      >
        {/* 목록과 같은 데이터를 센다. 숫자를 박아 두면 배지는 3건인데
            목록은 0건인 상태가 생긴다. */}
        리뷰 운영 <b>{reviewCounts.all}</b>
      </Link>
      <Link
        className={path === "/admin/members" ? "active" : ""}
        href="/admin/members"
      >
        회원 <b>{memberApplications.length}</b>
      </Link>
      <Link
        className={path === "/admin/content" ? "active" : ""}
        href="/admin/content"
      >
        {/* 리뷰·회원은 처리할 건수인데 콘텐츠는 늘 4다. 같은 배지를 달면
            처리할 일이 있는 줄 읽힌다. */}
        콘텐츠
      </Link>
      <span className="admin-nav-label">데이터 관리</span>
      <Link
        className={path === "/admin/companies" ? "active" : ""}
        href="/admin/companies"
      >
        회사 데이터
      </Link>
      <Link
        className={path === "/admin/placements" ? "active" : ""}
        href="/admin/placements"
      >
        홈 배치
      </Link>
      {/* "시스템 정상"이 초록 점과 함께 박혀 있었다. 12px 위 상단 줄이
          이미 진짜 연결 상태를 말하고 있어서, 둘 중 하나는 지어낸 말이다.
          아는 쪽만 남긴다. */}
    </nav>
  );
  let panel;
  if (path === "/admin/reviews")
    panel = (
      <>
        <AdminTitle
          title="검토할 리뷰"
          count={String(reviewCounts.all).padStart(2, "0")}
        />
        <div className="admin-queue-toolbar">
          <div>
            <button
              className={reviewFilter === "all" ? "active" : ""}
              aria-pressed={reviewFilter === "all"}
              onClick={() => setReviewFilter("all")}
            >
              전체 {reviewCounts.all}
            </button>
            <button
              className={reviewFilter === "privacy" ? "active" : ""}
              aria-pressed={reviewFilter === "privacy"}
              onClick={() => setReviewFilter("privacy")}
            >
              개인정보 {reviewCounts.privacy}
            </button>
            <button
              className={reviewFilter === "report" ? "active" : ""}
              aria-pressed={reviewFilter === "report"}
              onClick={() => setReviewFilter("report")}
            >
              신고 {reviewCounts.report}
            </button>
          </div>
          {/* "목표 처리시간 2시간 · 현재 SLA 정상"은 어디서도 확인할 수
              없는 값이고, 영어 머리말을 걷어낸 뒤 화면에 남은 유일한
              로마자 약어였다. */}
        </div>
        {/* aria-hidden 이 붙어 있어서 화면 낭독기에는 열 이름이 통째로
            없었다. 대신할 표 구조도 없어, 각 줄이 무슨 값인지 알 방법이
            없었다. 감춤을 뺀다. */}
        <div className="admin-list-head">
          <span>리뷰</span>
          <span>상태</span>
          <span>처리</span>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="list-empty">
            검토할 리뷰가 없습니다. 새 신고나 탐지가 들어오면 여기에 쌓입니다.
          </p>
        ) : null}
        {reviewQueue.map((review) => (
          <div className="admin-row admin-review-row" key={review.id}>
            <div>
              <span>
                {companies.find((c) => c.slug === review.companySlug)?.name}
              </span>
              <strong>{review.title}</strong>
              <small>
                {review.employment} · 평점 {review.score.toFixed(1)} ·{" "}
                {review.flags?.includes("privacy")
                  ? "개인정보 탐지"
                  : "신고 접수"}
              </small>
            </div>
            <span className={`admin-row-status ${review.status}`}>
              {review.status === "hidden" ? "비공개" : "공개"}
            </span>
            {/* 남의 글을 안 보이게 만드는 동작이라 한 번 묻는다. */}
            <button
              className={
                review.status === "hidden" ? undefined : "is-destructive"
              }
              onClick={() => {
                const hiding = review.status !== "hidden";
                setConfirm({
                  title: hiding
                    ? "이 리뷰를 블라인드할까요?"
                    : "이 리뷰를 다시 공개할까요?",
                  description: hiding
                    ? `"${review.title}" 이 목록과 회사 통계에서 빠집니다.`
                    : `"${review.title}" 이 다시 목록과 회사 통계에 들어갑니다.`,
                  confirmLabel: hiding ? "블라인드" : "공개하기",
                  run: () => {
                    setState((current) => ({
                      ...current,
                      reviews: current.reviews.map((item) =>
                        item.id === review.id
                          ? {
                              ...item,
                              status: hiding ? "hidden" : "published",
                            }
                          : item,
                      ),
                    }));
                    persist("admin.content.moderate", {
                      targetType: "company_review",
                      targetId: review.id,
                      action: hiding ? "hide" : "restore",
                    });
                    notify("리뷰 공개 상태를 변경했습니다.");
                  },
                });
              }}
            >
              {review.status === "hidden" ? "복구" : "블라인드"}
            </button>
          </div>
        ))}
      </>
    );
  else if (path === "/admin/companies")
    panel = (
      <>
        <AdminTitle
          title="회사 데이터 관리"
          count={String(
            companies.length + state.manualCompanies.length,
          ).padStart(2, "0")}
          // 등록된 회사 수다. 기본값("처리 대기")을 그냥 두면 6곳이 전부
          // 처리할 일로 읽힌다.
          countLabel="등록 회사"
        />
        <form
          onInvalidCapture={koreanValidity}
          onInputCapture={clearValidity}
          className="admin-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const name = String(new FormData(form).get("companyName")).trim();
            if (!name) return;
            /* 같은 이름을 두 번 넣으면 똑같은 줄이 두 개 생겼다. React key
               까지 같아서 목록이 어긋난다. */
            if (
              state.manualCompanies.includes(name) ||
              companies.some((company) => company.name === name)
            ) {
              notify("이미 등록된 회사입니다.");
              return;
            }
            setState((current) => ({
              ...current,
              manualCompanies: [name, ...current.manualCompanies],
            }));
            form.reset();
            persist("admin.company.import", { mode: "manual", name });
            notify("회사를 등록했습니다.");
          }}
        >
          <label>
            회사 수기 등록
            <input
              name="companyName"
              required
              placeholder="예: 위그튼 세일즈랩"
            />
          </label>
          <button className="button secondary">등록</button>
        </form>
        {/* 화면 이름이 "회사 데이터 관리"인데 정작 회사 목록이 없었다.
            등록 폼과 가져오기 상자만 있었다. */}
        {companies.map((company) => (
          <div className="admin-row" key={company.slug}>
            <div>
              <span>{company.industry}</span>
              <strong>{company.name}</strong>
              <small>
                리뷰 {reviewCountOf(state.reviews, company.slug)}건 ·{" "}
                {company.type}
              </small>
            </div>
            <Link className="text-link" href={`/companies/${company.slug}`}>
              화면에서 보기
            </Link>
          </div>
        ))}
        {state.manualCompanies.map((name) => (
          <div className="admin-row" key={name}>
            <div>
              <span>수기 등록</span>
              <strong>{name}</strong>
              <small>검색 인덱스 반영 대기</small>
            </div>
            {/* "회사 수정 패널을 열었습니다." 알림만 뜨고 아무것도 안
                열렸다. 열 화면이 없으니 버튼을 뺀다. */}
          </div>
        ))}
        <div className="import-box">
          <span>엑셀 파일 사전 검사</span>
          <h2>회사 1,240개 일괄 등록</h2>
          <p>필수값, 중복 회사, 수식·악성 셀을 저장 전에 검사합니다.</p>
          {state.imported ? (
            <div className="import-result">
              <b>1,218 정상</b>
              <b>18 수정 필요</b>
              <b>4 중복 후보</b>
            </div>
          ) : null}
          <button
            className="button primary"
            onClick={() => {
              setState((current) => ({ ...current, imported: true }));
              persist("admin.company.import", {
                mode: "xlsx-dry-run",
                rows: 1240,
              });
              notify("파일 검사를 마쳤습니다. 아직 저장하지 않았습니다.");
            }}
          >
            샘플 파일 검사
          </button>
        </div>
        <div className="crawler-box">
          <span>외부 회사 후보 미리보기</span>
          <h2>새 회사 후보 확인</h2>
          <p>
            출처와 수집 시각을 기록하고, 기존 회사와 중복되는지 먼저 확인합니다.
            확인 전에는 공개되지 않습니다.
          </p>
          {state.crawlPreviewed ? (
            <div className="import-result">
              <b>32 신규 후보</b>
              <b>7 병합 검토</b>
              <b>0 자동 게시</b>
            </div>
          ) : null}
          <button
            className="button secondary"
            onClick={() => {
              setState((current) => ({
                ...current,
                crawlPreviewed: true,
              }));
              // 크롤러 후보 미리보기도 회사 반입의 한 갈래라 같은 액션으로
              // 남긴다. 실제 크롤링은 데모 범위 밖이고, 여기서는 후보를
              // 확인했다는 사실만 기록한다.
              persist("admin.company.import", { mode: "crawler-dry-run" });
              notify("새 회사 후보를 불러왔습니다.");
            }}
          >
            후보 불러오기
          </button>
        </div>
      </>
    );
  else if (path === "/admin/placements")
    panel = (
      <>
        <AdminTitle title="홈 콘텐츠 배치" count="01" countLabel="배치 슬롯" />
        <div className="placement-preview">
          <span>{state.placementsPublished ? "게시 중" : "미리보기"}</span>
          <h2>이번 주 추천 회사 3곳</h2>
          <p>노스스타 클라우드 · 오빗 바이오웍스 · 모자이크 러닝</p>
          {/*
            홈 첫 화면에 바로 나가는 동작이라 한 번 묻는다. 전에는 누르는
            즉시 반영돼서, 잘못 눌러도 되돌릴 틈이 없었다.
          */}
          <button
            className="button primary"
            onClick={() =>
              setConfirm({
                title: state.placementsPublished
                  ? "추천 영역을 내릴까요?"
                  : "추천 영역을 홈에 올릴까요?",
                description: state.placementsPublished
                  ? "홈 첫 화면에서 추천 회사 영역이 사라집니다."
                  : "홈 첫 화면 상단에 추천 회사 3곳이 바로 노출됩니다.",
                confirmLabel: state.placementsPublished ? "내리기" : "게시하기",
                run: () => {
                  setState((current) => ({
                    ...current,
                    placementsPublished: !current.placementsPublished,
                  }));
                  persist("admin.placement.publish", {
                    published: !state.placementsPublished,
                  });
                  notify(
                    state.placementsPublished
                      ? "추천 영역을 미리보기 상태로 되돌렸습니다."
                      : "추천 영역을 홈에 게시했습니다.",
                  );
                },
              })
            }
          >
            {state.placementsPublished ? "게시 취소" : "지금 게시"}
          </button>
        </div>
      </>
    );
  else if (path === "/admin/members")
    panel = (
      <>
        <AdminTitle
          title="회원·검증 신청"
          count={String(memberApplications.length).padStart(2, "0")}
        />
        {memberApplications.map((name) => (
          <div className="admin-row" key={name}>
            <div>
              <strong>{name}</strong>
              <small>최근 활동 정상 · 신고 0</small>
            </div>
            <div className="admin-row-actions">
              <button
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    badgeStatus: "승인",
                  }));
                  persist("admin.member.review", { decision: "approve" });
                  notify("확인 배지 신청을 승인했습니다.");
                }}
              >
                승인
              </button>
              {/* 신청을 되돌리는 쪽이라 한 번 묻는다. 승인 버튼과 생김새가
                  같고 8px 옆이라 잘못 누르기 쉬웠다. */}
              <button
                className="is-destructive"
                onClick={() =>
                  setConfirm({
                    title: "확인 배지 신청을 반려할까요?",
                    description: `${name} 님의 신청이 반려 처리되고 신청자에게 결과가 전달됩니다.`,
                    confirmLabel: "반려하기",
                    run: () => {
                      setState((current) => ({
                        ...current,
                        badgeStatus: "반려",
                      }));
                      persist("admin.member.review", { decision: "reject" });
                      notify("확인 배지 신청을 반려했습니다.");
                    },
                  })
                }
              >
                반려
              </button>
            </div>
          </div>
        ))}
      </>
    );
  else if (path === "/admin/content")
    panel = (
      <>
        {/* 앞에서 네 개를 자른 목록일 뿐 신고된 글이 아니었다. 모든 줄이
            "신고 0"인데 제목은 "04 처리 대기"였다. */}
        <AdminTitle
          title="최근 게시글"
          count={String(moderationPosts.length).padStart(2, "0")}
          countLabel="최근 글"
        />
        {moderationPosts.map((post) => (
          <div className="admin-row" key={post.id}>
            <div>
              <span>{post.board}</span>
              <strong>{post.title}</strong>
              {/* `post.id === "p4"` 는 DB 의 uuid 에는 절대 안 맞는다.
                  신고 대화창으로 접수한 것도 여기 안 잡혔다. */}
              <small>
                답변 {post.comments.length} · 도움 {post.likes}
              </small>
            </div>
            <button
              className={
                state.hiddenPostIds.includes(post.id)
                  ? undefined
                  : "is-destructive"
              }
              onClick={() => {
                const hiding = !state.hiddenPostIds.includes(post.id);
                setConfirm({
                  title: hiding
                    ? "이 글을 블라인드할까요?"
                    : "이 글을 다시 공개할까요?",
                  description: hiding
                    ? `"${post.title}" 이 커뮤니티 목록에서 빠집니다.`
                    : `"${post.title}" 이 다시 커뮤니티 목록에 나옵니다.`,
                  confirmLabel: hiding ? "블라인드" : "공개하기",
                  run: () => {
                    setState((current) => ({
                      ...current,
                      hiddenPostIds: hiding
                        ? [...current.hiddenPostIds, post.id]
                        : current.hiddenPostIds.filter((id) => id !== post.id),
                    }));
                    persist("admin.content.moderate", {
                      targetType: "post",
                      targetId: post.id,
                      action: hiding ? "hide" : "restore",
                    });
                    notify("게시글 공개 상태를 변경했습니다.");
                  },
                });
              }}
            >
              {state.hiddenPostIds.includes(post.id) ? "복구" : "블라인드"}
            </button>
          </div>
        ))}
      </>
    );
  else
    panel = (
      <>
        {/*
          07 로 박혀 있었다. 아래 세 지표의 합도, 대기열 3건도 아니어서
          어디서 온 숫자인지 알 수 없었다. 지표에서 센다.
        */}
        <AdminTitle
          title="오늘의 운영 우선순위"
          count={String(
            memberApplications.length + reviewCounts.all + aiPending,
          ).padStart(2, "0")}
        />
        <section className="priority-brief">
          <div>
            <span>가장 먼저 처리할 작업</span>
            {/* "1건"과 "38분"이 박혀 있었다. 대기열을 다 처리해도 그대로
                남고, 정작 그 리뷰는 공개 상태였다. */}
            <h2>
              {reviewCounts.privacy
                ? `개인정보 탐지로 보류된 리뷰 ${reviewCounts.privacy}건`
                : reviewCounts.report
                  ? `신고 접수된 리뷰 ${reviewCounts.report}건`
                  : "지금 처리할 리뷰가 없습니다"}
            </h2>
            <p>
              {reviewCounts.all
                ? "원문과 탐지 구간을 확인하고 공개 여부를 정하세요."
                : "새 신고나 탐지가 들어오면 여기에 표시됩니다."}
            </p>
          </div>
          <Link className="button primary" href="/admin/reviews">
            검토 시작
          </Link>
        </section>
        <div className="admin-metrics">
          <article>
            <div>
              <span>검증 대기</span>
              <b>정상</b>
            </div>
            {/* 사이드바의 "회원" 배지와 같은 대기열인데 숫자가 달랐다. */}
            <strong>{memberApplications.length}</strong>
            <small>
              {memberApplications.length
                ? "재직·실적 증빙을 확인하고 승인 여부를 정하세요."
                : "대기 중인 신청이 없습니다."}
            </small>
            <Link href="/admin/members">대기열 열기</Link>
          </article>
          <article>
            <div>
              <span>신고 리뷰</span>
              <b className="urgent">주의</b>
            </div>
            <strong>{reviewCounts.all}</strong>
            {/* "고위험 1건 · 오늘 신규 2건"은 어디서도 안 나오는 값이었다. */}
            <small>
              개인정보 {reviewCounts.privacy}건 · 신고 {reviewCounts.report}건
            </small>
            <Link href="/admin/reviews">신고 대기열 열기</Link>
          </article>
          <article>
            <div>
              <span>AI 첫 답변 대기</span>
              <b className={aiPending ? "urgent" : undefined}>
                {aiPending ? "대기" : "정상"}
              </b>
            </div>
            <strong>{aiPending}</strong>
            <small>
              {aiPending
                ? `${aiPending}건이 첫 답변을 기다리는 중입니다.`
                : "기다리는 글 없음"}
            </small>
            <Link href="/admin/content">상태 확인</Link>
          </article>
        </div>
        <div className="admin-dashboard-lower">
          <section className="work-queue">
            <div className="admin-section-head">
              <div>
                <span>대기 작업</span>
                <h2>내 작업 대기열</h2>
              </div>
              <b>우선순위순</b>
            </div>
            {/*
              건수가 박혀 있었다. "재직 증빙 8건"인데 회원 대기열은 2건,
              "중복 후보 4건"인데 회사 화면은 7건이었다. 각 화면으로
              넘어가는 줄이라, 눌러 보면 바로 다른 숫자가 나온다.

              할 일이 없는 줄은 아예 안 보여 준다 - 0건짜리 줄이 대기열에
              남아 있으면 처리한 티가 안 난다.
            */}
            {[
              {
                priority: "P1",
                type: "리뷰",
                count: reviewCounts.all,
                title: `검토 대기 리뷰 ${reviewCounts.all}건`,
                href: "/admin/reviews",
              },
              {
                priority: "P2",
                type: "회원",
                count: memberApplications.length,
                title: `재직·실적 증빙 ${memberApplications.length}건 검토`,
                href: "/admin/members",
              },
              {
                priority: "P3",
                type: "회사",
                count: state.manualCompanies.length,
                title: `수기 등록 회사 ${state.manualCompanies.length}곳 확인`,
                href: "/admin/companies",
              },
            ]
              .filter((row) => row.count > 0)
              .map((row) => (
                <Link className="work-queue-row" href={row.href} key={row.type}>
                  <span
                    className={`priority priority-${row.priority.toLowerCase()}`}
                  >
                    {row.priority}
                  </span>
                  <span>{row.type}</span>
                  <strong>{row.title}</strong>
                </Link>
              ))}
            {reviewCounts.all +
              memberApplications.length +
              state.manualCompanies.length ===
            0 ? (
              <p className="list-empty">지금 처리할 작업이 없습니다.</p>
            ) : null}
          </section>
          <section className="audit-feed">
            <div className="admin-section-head">
              <div>
                <span>처리 기록</span>
                <h2>최근 운영 로그</h2>
              </div>
            </div>
            {/* 시각을 `index * 7` 로 만들어서 늘 방금 전 / 7분 전 / 14분
                전이었다. 시각 대신 무슨 일이었는지만 남긴다. */}
            {[
              "홈 추천 영역 미리보기 생성",
              "회사 중복 후보 확인 요청",
              "리뷰 개인정보 탐지로 자동 보류",
            ].map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
        </div>
      </>
    );
  return (
    <main id="main" tabIndex={-1} className="admin-shell">
      {nav}
      <section className="admin-panel">
        <div className="admin-contextbar">
          <span>
            {new Date().toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · 운영 관리자
          </span>
          {/*
            전에는 항상 초록 점에 "실시간 동기화"만 떴다. 연결이 끊겨도
            정상으로 보여서, 화면의 숫자가 낡았는지 알 수 없었다.
          */}
          <div className={demoMeta.live ? "is-live" : "is-offline"}>
            <i />
            {demoMeta.live
              ? "실시간 동기화"
              : demoMeta.ready
                ? "연결 끊김 · 저장된 값 표시 중"
                : "동기화 중"}
          </div>
        </div>
        {panel}
      </section>
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      ) : null}
    </main>
  );
}

function Trust() {
  return (
    <main id="main" tabIndex={-1} className="page-shell page">
      <PageTitle
        eyebrow="운영 정책"
        title="리뷰 작성자 보호 및 검증 정책"
        description="작성자 정보 보관, 재직 확인, 신고 처리 기준을 안내합니다."
      />
      <div className="trust-grid">
        <article>
          <b>01</b>
          <h2>작성자 정보 분리 보관</h2>
          <p>
            공개 리뷰와 작성자 식별정보는 별도 권한 영역에 저장합니다. 일반
            운영자는 작성자를 확인할 수 없습니다.
          </p>
        </article>
        <article>
          <b>02</b>
          <h2>검증 결과만 공개</h2>
          <p>
            회사 이메일·실적 증빙 원본 대신 검증 수준과 유효기간만 프로필에
            노출합니다.
          </p>
        </article>
        <article>
          <b>03</b>
          <h2>AI 답변 표시</h2>
          <p>
            AI가 작성한 초안에는 별도 표시를 붙입니다. 개인정보가 포함된 질문은
            답변 작성 전에 보류합니다.
          </p>
        </article>
        <article>
          <b>04</b>
          <h2>운영 이력 기록</h2>
          <p>
            비공개, 복구, 승인, 반려 처리에는 담당자와 처리 사유가 기록됩니다.
          </p>
        </article>
      </div>
    </main>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-title">
      <p className="kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
function AdminTitle({
  title,
  count,
  countLabel = "처리 대기",
}: {
  title: string;
  count: string;
  countLabel?: string;
}) {
  return (
    <header className="admin-title">
      <div>
        <p>관리자 도구</p>
        <h1>{title}</h1>
      </div>
      {/* 숫자만 크게 떠 있으면 무슨 값인지 알 수 없다. 라벨을 붙인다. */}
      <div className="admin-title-count">
        <strong>{count}</strong>
        <span>{countLabel}</span>
      </div>
    </header>
  );
}
function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="page-shell page narrow">
      <PageTitle
        eyebrow="404"
        title="페이지를 찾을 수 없습니다"
        description="메인에서 다른 체험 기능을 확인해 주세요."
      />
      <Link className="button primary" href="/">
        메인으로
      </Link>
    </main>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-inner">
        <div className="footer-brand">
          <Link className="brand" href="/">
            FIELD<span>NOTE</span>
          </Link>
          <p>
            영업직 종사자를 위한 회사 리뷰·커뮤니티 서비스입니다. 공개 데모의
            회사와 회원 정보는 모두 샘플 데이터입니다.
          </p>
        </div>
        <nav className="footer-links" aria-label="하단 메뉴">
          <Link href="/companies">회사 리뷰</Link>
          <Link href="/community">영업 Q&amp;A</Link>
          <Link href="/trust">개인정보·검증 정책</Link>
        </nav>
      </div>
    </footer>
  );
}

function RoleSegments({
  role,
  setRole,
}: {
  role: Role;
  setRole: (role: Role) => void;
}) {
  return (
    <div className="role-segments" role="group" aria-label="체험 역할 선택">
      {roles.map((key) => (
        <button
          type="button"
          className={role === key ? "active" : undefined}
          aria-pressed={role === key}
          onClick={() => setRole(key)}
          key={key}
        >
          <span aria-hidden="true">{roleExperience[key].icon}</span>
          <b>{roleNames[key]}</b>
        </button>
      ))}
    </div>
  );
}

function DemoRoleBar({
  role,
  setRole,
  reset,
  openMobileSheet,
  mobileSheetOpen,
  pulse,
}: {
  role: Role;
  setRole: (role: Role) => void;
  reset: () => void;
  openMobileSheet: () => void;
  mobileSheetOpen: boolean;
  pulse: boolean;
}) {
  return (
    <aside
      className={`demo-role-bar role-${role}${pulse ? " is-intro-pulse" : ""}`}
      aria-label="데모 체험 상태"
    >
      <div className="page-shell demo-role-bar-inner">
        <div className="demo-status-copy">
          <IconLive />
          <p>
            <strong>데모 체험 중</strong>
            <span>
              현재 <b>{roleNames[role]}</b> 관점으로 보고 있습니다
            </span>
          </p>
        </div>
        <div className="demo-role-controls" data-testid="role-switch">
          <div className="desktop-role-switch">
            <RoleSegments role={role} setRole={setRole} />
          </div>
          <button
            type="button"
            className="mobile-role-trigger"
            aria-haspopup="dialog"
            aria-expanded={mobileSheetOpen}
            onClick={openMobileSheet}
          >
            <span aria-hidden="true">{roleExperience[role].icon}</span>
            <b>{roleNames[role]}</b>
            <small>역할 변경</small>
          </button>
          <button type="button" className="demo-reset" onClick={reset}>
            초기화
          </button>
        </div>
      </div>
    </aside>
  );
}

function RolePickerModal({
  open,
  selectRole,
  dismiss,
}: {
  open: boolean;
  selectRole: (role: Role) => void;
  dismiss: () => void;
}) {
  const dialogRef = useDialogFocus(open, dismiss);
  if (!open) return null;
  return (
    <div className="role-dialog-backdrop">
      <div
        className="role-picker-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-picker-title"
        aria-describedby="role-picker-description"
      >
        <div className="role-picker-heading">
          <span>역할 미리보기</span>
          <h2 id="role-picker-title">어떤 역할로 둘러보시겠어요?</h2>
          <p id="role-picker-description">
            역할에 따라 작성 기능과 운영 화면이 달라집니다.
          </p>
        </div>
        <div className="role-picker-grid">
          {roles.map((key) => (
            <button
              type="button"
              className={`role-picker-card role-${key}`}
              onClick={() => selectRole(key)}
              key={key}
            >
              <span className="role-picker-icon" aria-hidden="true">
                {roleExperience[key].icon}
              </span>
              <strong>{roleNames[key]}</strong>
              <small>{roleExperience[key].description}</small>
              <b>이 역할로 시작</b>
            </button>
          ))}
        </div>
        <div className="role-picker-footer">
          <button type="button" onClick={dismiss}>
            그냥 둘러보기 (비회원)
          </button>
          <p>언제든 화면 상단에서 역할을 바꿀 수 있어요.</p>
        </div>
      </div>
    </div>
  );
}

function AccountLoginModal({
  open,
  currentRole,
  login,
  continueAsGuest,
  close,
}: {
  open: boolean;
  currentRole: Role;
  login: (role: Exclude<Role, "guest">) => void;
  continueAsGuest: () => void;
  close: () => void;
}) {
  const dialogRef = useDialogFocus(open, close);
  if (!open) return null;
  return (
    <div className="role-dialog-backdrop">
      <div
        className="account-login-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-login-title"
        aria-describedby="account-login-description"
      >
        <div className="account-login-heading">
          <div>
            <span>데모 계정</span>
            <h2 id="account-login-title">어떤 계정으로 로그인할까요?</h2>
            <p id="account-login-description">
              비밀번호 없이 권한별 화면과 기능을 바로 체험할 수 있습니다.
            </p>
          </div>
          <button type="button" aria-label="계정 로그인 닫기" onClick={close}>
            닫기
          </button>
        </div>
        <div className="account-login-list">
          {accountRoles.map((role) => {
            const account = demoAccounts[role];
            const isCurrent = currentRole === role;
            return (
              <button
                type="button"
                className={`account-login-card role-${role}${isCurrent ? " is-current" : ""}`}
                aria-pressed={isCurrent}
                data-autofocus={role === "sales" ? "true" : undefined}
                onClick={() => login(role)}
                key={role}
              >
                <span className="account-avatar" aria-hidden="true">
                  {roleExperience[role].icon}
                </span>
                <span className="account-login-copy">
                  <small>{roleNames[role]}</small>
                  <strong>{account.name}</strong>
                  <span>{account.title}</span>
                </span>
                <b>{isCurrent ? "현재 계정 열기" : "이 계정으로 로그인"}</b>
              </button>
            );
          })}
        </div>
        <div className="account-login-footer">
          <p>모든 계정과 활동 데이터는 포트폴리오용 샘플입니다.</p>
          <button type="button" onClick={continueAsGuest}>
            로그인 없이 둘러보기
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileRoleSheet({
  open,
  role,
  setRole,
  reset,
  close,
}: {
  open: boolean;
  role: Role;
  setRole: (role: Role) => void;
  reset: () => void;
  close: () => void;
}) {
  const dialogRef = useDialogFocus(open, close);
  if (!open) return null;
  return (
    <div className="role-dialog-backdrop mobile-role-backdrop">
      <div
        className="mobile-role-sheet"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-role-sheet-title"
      >
        <div className="mobile-role-sheet-head">
          <div>
            <span>데모 역할</span>
            <h2 id="mobile-role-sheet-title">다른 관점으로 둘러보기</h2>
          </div>
          <button type="button" aria-label="역할 전환 닫기" onClick={close}>
            닫기
          </button>
        </div>
        <RoleSegments role={role} setRole={setRole} />
        <p>
          역할을 바꾸면 사용할 수 있는 기능과 이동 가능한 화면이 달라집니다.
        </p>
        <button
          type="button"
          className="mobile-demo-reset"
          onClick={() => {
            reset();
            close();
          }}
        >
          데모 데이터 초기화
        </button>
      </div>
    </div>
  );
}

function LockedRoleFeature({
  badge,
  title,
  description,
  targetRole,
  onRoleChange,
}: {
  badge: string;
  title: string;
  description: string;
  targetRole: Role;
  onRoleChange: (role: Role) => void;
}) {
  const switchLabels: Record<Role, string> = {
    guest: "비회원으로 전환하기",
    sales: "일반 영업인으로 전환해서 체험하기",
    verified: "인증 영업인으로 전환해서 체험하기",
    admin: "운영 관리자로 전환해서 체험하기",
  };
  return (
    <div className="locked-role-feature">
      <span className="locked-role-icon" aria-hidden="true">
        <IconLock />
      </span>
      <div>
        <span className="role-access-badge">{badge}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => onRoleChange(targetRole)}
      >
        {switchLabels[targetRole]}
      </button>
    </div>
  );
}
