"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  companies,
  companyScore,
  initialPosts,
  initialReviews,
  type Post,
  type Review,
  type Role,
} from "@/lib/domain";

type DemoState = {
  role: Role;
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

const roleNames: Record<Role, string> = {
  guest: "비회원",
  sales: "일반 영업인",
  verified: "인증 영업인",
  admin: "운영 관리자",
};

function useDemoState() {
  const [state, setState] = useState<DemoState>(baseline);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("fieldnote-demo-v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<DemoState>;
        setState({
          ...baseline,
          ...parsed,
          reviews: parsed.reviews ?? baseline.reviews,
          posts: parsed.posts ?? baseline.posts,
          manualCompanies: parsed.manualCompanies ?? [],
          hiddenPostIds: parsed.hiddenPostIds ?? [],
          profile: { ...baseline.profile, ...parsed.profile },
        });
      } catch {
        window.localStorage.removeItem("fieldnote-demo-v1");
      }
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      window.localStorage.setItem("fieldnote-demo-v1", JSON.stringify(state));
  }, [ready, state]);
  const updateState = (update: (current: DemoState) => DemoState) => {
    setState((current) => {
      const next = update(current);
      window.localStorage.setItem("fieldnote-demo-v1", JSON.stringify(next));
      return next;
    });
  };
  return [state, updateState] as const;
}

export function PlatformApp({ initialPath }: { initialPath: string }) {
  const [state, setState] = useDemoState();
  const [toast, setToast] = useState("");
  const router = useRouter();
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const reset = () => {
    window.localStorage.removeItem("fieldnote-demo-v1");
    setState(() => baseline);
    notify("데모 데이터가 초기화됐습니다.");
    router.push("/");
  };

  let content;
  if (initialPath === "/" || initialPath === "")
    content = <Home state={state} />;
  else if (initialPath === "/companies") content = <Companies state={state} />;
  else if (initialPath.startsWith("/companies/"))
    content = <CompanyDetail slug={initialPath.split("/")[2]} state={state} />;
  else if (initialPath === "/reviews/new")
    content = <ReviewForm state={state} setState={setState} notify={notify} />;
  else if (initialPath === "/community")
    content = <Community state={state} setState={setState} notify={notify} />;
  else if (initialPath === "/posts/new")
    content = <PostForm state={state} setState={setState} notify={notify} />;
  else if (initialPath.startsWith("/posts/"))
    content = (
      <PostDetail
        id={initialPath.split("/")[2]}
        state={state}
        setState={setState}
        notify={notify}
      />
    );
  else if (initialPath === "/questions/new")
    content = (
      <QuestionForm state={state} setState={setState} notify={notify} />
    );
  else if (initialPath === "/account")
    content = <Account state={state} setState={setState} notify={notify} />;
  else if (initialPath === "/compare") content = <Compare state={state} />;
  else if (initialPath === "/trust") content = <Trust />;
  else if (initialPath.startsWith("/admin"))
    content = (
      <Admin
        path={initialPath}
        state={state}
        setState={setState}
        notify={notify}
      />
    );
  else content = <NotFound />;

  return (
    <>
      <Header role={state.role} />
      {content}
      <DemoDock
        role={state.role}
        setRole={(role) => {
          setState((current) => ({ ...current, role }));
          notify(`${roleNames[role]} 역할로 전환했습니다.`);
          if (role === "admin") router.push("/admin");
        }}
        reset={reset}
      />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function Header({ role }: { role: Role }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        FIELDNOTE<span>•</span>
      </Link>
      <nav aria-label="주요 메뉴">
        <Link href="/companies">회사 인사이트</Link>
        <Link href="/community">커뮤니티</Link>
        <Link href="/compare">회사 비교</Link>
        <Link href="/trust">신뢰 정책</Link>
      </nav>
      <Link
        className="header-role"
        href={role === "admin" ? "/admin" : "/account"}
      >
        {roleNames[role]}
      </Link>
    </header>
  );
}

function Home({ state }: { state: DemoState }) {
  const top = companies.slice(0, 3);
  return (
    <main>
      <section className="hero page-shell">
        <div className="hero-copy reveal">
          <p className="kicker">Sales career intelligence · 2026</p>
          <h1>
            영업의 다음 선택은,
            <br />
            <em>감이 아니라 데이터로.</em>
          </h1>
          <p className="hero-lead">
            동료의 검증된 경험, 영업환경 점수, 현장의 답을 한곳에서 읽고
            비교하세요.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/companies">
              회사 탐색 시작
            </Link>
            <Link className="text-link" href="/questions/new">
              질문하고 AI 첫 답 받기 →
            </Link>
          </div>
        </div>
        <aside className="pulse-panel reveal delay">
          <p className="caption">TODAY&apos;S SALES PULSE</p>
          <strong>12,408</strong>
          <span>오늘 읽힌 현장 경험</span>
          <dl>
            <div>
              <dt>가장 많이 본 회사</dt>
              <dd>노스스타 클라우드</dd>
            </div>
            <div>
              <dt>가장 뜨거운 질문</dt>
              <dd>엔터프라이즈 첫 미팅</dd>
            </div>
            <div>
              <dt>새 실적 인증</dt>
              <dd>28건</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="ticker">
        <span>합성 데이터 기반 공개 체험</span>
        <span>역할 전환으로 전 기능 확인</span>
        <span>실서비스 계약과 동일한 상태 모델</span>
      </section>

      <section className="page-shell section">
        <div className="section-heading">
          <div>
            <p className="kicker">Company intelligence</p>
            <h2>지금 주목받는 영업 조직</h2>
          </div>
          <Link className="text-link" href="/companies">
            전체 회사 보기 →
          </Link>
        </div>
        <div className="company-grid">
          {top.map((company, index) => (
            <CompanyCard
              key={company.slug}
              company={company}
              score={companyScore(state.reviews, company.slug, company.score)}
              index={index + 1}
            />
          ))}
        </div>
      </section>

      <section className="dark-section">
        <div className="page-shell editorial-grid">
          <div>
            <p className="kicker copper">Field notes</p>
            <h2>
              성과를 만든 사람들의
              <br />
              구체적인 문장
            </h2>
            <p>
              숫자만 인증하지 않습니다. 어떤 선택과 반복이 결과를 바꿨는지
              기록합니다.
            </p>
          </div>
          <div className="story-list">
            {state.posts.slice(1, 4).map((post) => (
              <Link href={`/posts/${post.id}`} key={post.id}>
                <span>{post.board}</span>
                <h3>{post.title}</h3>
                <small>
                  {post.author} · 도움 {post.likes}
                </small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell section ai-strip">
        <div>
          <p className="kicker">AI + human answer</p>
          <h2>답이 비어 있는 시간을 없앱니다.</h2>
          <p>AI는 첫 관점을 제안하고, 검증된 현장 경험이 답을 완성합니다.</p>
        </div>
        <Link className="button primary" href="/questions/new">
          질문 직접 올려보기
        </Link>
      </section>
    </main>
  );
}

function CompanyCard({
  company,
  score,
  index,
}: {
  company: (typeof companies)[number];
  score: number;
  index: number;
}) {
  return (
    <article className="company-card">
      <div className="company-index">0{index}</div>
      <p className="caption">{company.industry}</p>
      <h3>
        <Link href={`/companies/${company.slug}`}>{company.name}</Link>
      </h3>
      <p>{company.summary}</p>
      <div className="score-line">
        <strong>{score.toFixed(1)}</strong>
        <span>/ 5.0 · 리뷰 {company.reviewCount}</span>
        <b className={company.trend >= 0 ? "up" : "down"}>
          {company.trend >= 0 ? "+" : ""}
          {company.trend}%
        </b>
      </div>
    </article>
  );
}

function Companies({ state }: { state: DemoState }) {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("전체");
  const filtered = companies.filter(
    (company) =>
      (industry === "전체" || company.industry === industry) &&
      `${company.name}${company.industry}${company.type}`.includes(query),
  );
  return (
    <main className="page-shell page">
      <PageTitle
        eyebrow="Company explorer"
        title="나에게 맞는 영업 조직을 찾으세요"
        description="직함이 아니라 실제 영업 방식과 지원 환경으로 비교합니다."
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
        <span>{filtered.length}개 조직</span>
      </div>
      <div className="company-list">
        {filtered.map((company, index) => (
          <CompanyCard
            key={company.slug}
            company={company}
            score={companyScore(state.reviews, company.slug, company.score)}
            index={index + 1}
          />
        ))}
      </div>
    </main>
  );
}

function CompanyDetail({ slug, state }: { slug: string; state: DemoState }) {
  const company = companies.find((item) => item.slug === slug) ?? companies[0];
  const reviews = state.reviews.filter(
    (review) =>
      review.companySlug === company.slug && review.status === "published",
  );
  const score = companyScore(state.reviews, company.slug, company.score);
  const dimensionScores = Object.fromEntries(
    reviewDimensions.map((label) => {
      const values = reviews
        .map((review) => review.dimensions?.[label])
        .filter((value): value is number => typeof value === "number");
      const value = values.length
        ? values.reduce((sum, item) => sum + item, 0) / values.length
        : company.scores[label];
      return [label, value];
    }),
  );
  return (
    <main className="page-shell page">
      <div className="company-hero">
        <div>
          <p className="kicker">
            {company.industry} · {company.type}
          </p>
          <h1>{company.name}</h1>
          <p>{company.summary}</p>
          <div className="hero-actions">
            <Link className="button primary" href="/reviews/new">
              익명 리뷰 작성
            </Link>
            <Link className="button secondary" href="/compare">
              다른 회사와 비교
            </Link>
          </div>
        </div>
        <div className="score-monument">
          <span>영업환경 종합</span>
          <strong>{score.toFixed(1)}</strong>
          <small>
            검증 리뷰 {reviews.filter((review) => review.verified).length}건
            포함
          </small>
        </div>
      </div>
      <section className="section-tight">
        <div className="section-heading">
          <h2>영업환경 6축</h2>
          <span className="trust-chip">
            표본 {company.reviewCount} · 최근 12개월
          </span>
        </div>
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
      </section>
      <section className="section-tight">
        <div className="section-heading">
          <h2>익명 경험 리뷰</h2>
          <Link className="text-link" href="/trust">
            익명성 보호 방식 →
          </Link>
        </div>
        <div className="review-list">
          {reviews.map((review) => (
            <article key={review.id}>
              <div>
                <span className="trust-chip">
                  {review.verified ? "재직 검증" : "일반"}
                </span>
                <span>{review.employment}</span>
                <strong>{review.score.toFixed(1)}</strong>
              </div>
              <h3>{review.title}</h3>
              <p>{review.body}</p>
              <small>작성자 정보는 별도 암호화 영역에 격리됩니다.</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ReviewForm({
  state,
  setState,
  notify,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const router = useRouter();
  const [companySlug, setCompanySlug] = useState(companies[0].slug);
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
    notify("익명 리뷰가 반영되고 회사 통계가 갱신됐습니다.");
    router.push(`/companies/${companySlug}`);
  };
  return (
    <main className="page-shell page narrow">
      <PageTitle
        eyebrow="Anonymous review"
        title="다음 영업인을 위한 솔직한 기록"
        description="개인을 특정할 수 있는 정보는 쓰지 말아주세요. 공개 전 자동 안전 검사를 거칩니다."
      />
      <form className="form-panel" onSubmit={submit}>
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
          <label>
            종합 점수 <b>{score.toFixed(1)}</b>
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
            공개 프로필과 리뷰 작성자 식별키를 분리합니다. 운영자도 승인된 분쟁
            절차와 감사기록 없이 작성자를 볼 수 없습니다.
          </p>
        </div>
        <button className="button primary" type="submit">
          리뷰 등록하고 통계 보기
        </button>
      </form>
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
  const posts = state.posts.filter(
    (post) =>
      !state.hiddenPostIds.includes(post.id) &&
      (board === "전체" || post.board === board),
  );
  const toggleSave = (id: string) => {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === id ? { ...post, saved: !post.saved } : post,
      ),
    }));
    notify("스크랩 상태가 변경됐습니다.");
  };
  return (
    <main className="page-shell page">
      <PageTitle
        eyebrow="Sales community"
        title="현장에서 바로 쓰이는 답"
        description="질문, 실적, 실패와 노하우가 검증 수준과 함께 쌓입니다."
      />
      <div className="board-tabs">
        {["전체", "자유", "Q&A", "실적", "노하우"].map((value) => (
          <button
            className={board === value ? "active" : ""}
            onClick={() => setBoard(value)}
            key={value}
          >
            {value}
          </button>
        ))}
        <div className="board-create-actions">
          <Link className="button secondary" href="/posts/new">
            게시글 작성
          </Link>
          <Link className="button primary" href="/questions/new">
            질문 작성
          </Link>
        </div>
      </div>
      <div className="feed">
        {posts.map((post) => (
          <article key={post.id}>
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
              <span>댓글 {post.comments.length}</span>
              {post.ai ? (
                <span className="ai-label">AI 첫 답변 완료</span>
              ) : null}
              <button onClick={() => toggleSave(post.id)}>
                {post.saved ? "스크랩됨" : "스크랩"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function PostForm({
  state,
  setState,
  notify,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const router = useRouter();
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
      author: roleNames[state.role],
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
    notify("게시글과 이미지 메타데이터가 등록됐습니다.");
    router.push(`/posts/${id}`);
  };
  return (
    <main className="page-shell page narrow">
      <PageTitle
        eyebrow="Publish a field note"
        title="성과와 실패를 재사용 가능한 기록으로"
        description="데모에서는 이미지 파일명만 보관하며 실제 파일은 외부로 전송하지 않습니다."
      />
      <form className="form-panel" onSubmit={submit}>
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
            {["굵게", "링크", "목록", "인용"].map((tool) => (
              <button
                type="button"
                key={tool}
                onClick={() => notify(`${tool} 서식 도구를 선택했습니다.`)}
              >
                {tool}
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
        <label>
          이미지 첨부
          <input name="images" type="file" accept="image/*" multiple />
          <small>JPG·PNG·WebP · 실서비스는 private Storage를 사용합니다.</small>
        </label>
        <button className="button primary">게시글 등록</button>
      </form>
    </main>
  );
}

function PostDetail({
  id,
  state,
  setState,
  notify,
}: {
  id: string;
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const post = state.posts.find((item) => item.id === id) ?? state.posts[0];
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const addComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const rawBody = String(new FormData(form).get("comment"));
    const body = replyingTo === null ? rawBody : `↳ 답글 · ${rawBody}`;
    if (!body.trim()) return;
    setState((current) => ({
      ...current,
      posts: current.posts.map((item) =>
        item.id === post.id
          ? { ...item, comments: [...item.comments, body] }
          : item,
      ),
    }));
    form.reset();
    setReplyingTo(null);
    notify(
      replyingTo === null ? "댓글이 등록됐습니다." : "답글이 등록됐습니다.",
    );
  };
  return (
    <main className="page-shell page narrow">
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
        {post.ai === "posted" ? (
          <aside className="ai-answer">
            <span>AI FIRST TAKE · 안전 검토 완료</span>
            <h3>
              첫 미팅의 목표를 ‘다음 의사결정이 가능한 상태’로 잡아보세요.
            </h3>
            <p>
              경제적 구매자, 문제의 비용, 내부 의사결정 이벤트를 확인하고 다음
              회의의 참석자와 산출물을 합의하면 좋습니다. 실제 조직별 경험은
              아래 현장 답변을 함께 참고하세요.
            </p>
          </aside>
        ) : null}
        <div className="post-actions">
          <button
            onClick={() => {
              setState((current) => ({
                ...current,
                posts: current.posts.map((item) =>
                  item.id === post.id
                    ? { ...item, likes: item.likes + 1 }
                    : item,
                ),
              }));
              notify("도움됐어요를 남겼습니다.");
            }}
          >
            도움됐어요 {post.likes}
          </button>
          <button onClick={() => notify("신고가 운영 큐에 접수됐습니다.")}>
            신고
          </button>
        </div>
      </article>
      <section className="comments">
        <h2>
          현장 답변 <span>{post.comments.length}</span>
        </h2>
        {post.comments.map((comment, index) => (
          <article key={`${comment}-${index}`}>
            <strong>{index === 0 ? "검증 영업인" : "커뮤니티 멤버"}</strong>
            <p>{comment}</p>
            <button
              onClick={() => {
                setReplyingTo(index);
                notify("답글 입력창이 열렸습니다.");
              }}
            >
              답글
            </button>
          </article>
        ))}
        {state.role === "guest" ? (
          <div className="login-prompt">
            <p>역할을 일반 영업인으로 전환하면 바로 답변할 수 있습니다.</p>
          </div>
        ) : (
          <form className="comment-form" onSubmit={addComment}>
            <label>
              {replyingTo === null
                ? "경험으로 답변하기"
                : `${replyingTo + 1}번 답변에 답글 쓰기`}
              <textarea name="comment" rows={4} required />
            </label>
            {replyingTo !== null ? (
              <button type="button" onClick={() => setReplyingTo(null)}>
                답글 취소
              </button>
            ) : null}
            <button className="button primary">답변 등록</button>
          </form>
        )}
      </section>
    </main>
  );
}

function QuestionForm({
  state,
  setState,
  notify,
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const [status, setStatus] = useState<
    "idle" | "queued" | "thinking" | "posted"
  >("idle");
  const [title, setTitle] = useState("");
  const ask = (event: FormEvent) => {
    event.preventDefault();
    setStatus("queued");
    notify("질문이 등록됐습니다. AI 마중물을 준비합니다.");
    window.setTimeout(() => setStatus("thinking"), 1200);
    window.setTimeout(() => {
      setStatus("posted");
      const post: Post = {
        id: `p-${Date.now()}`,
        board: "Q&A",
        title,
        body: "평가자가 직접 등록한 데모 질문입니다.",
        author: roleNames[state.role],
        badge: state.role === "verified" ? "검증 영업인 L2" : undefined,
        likes: 0,
        saved: false,
        comments: [],
        ai: "posted",
      };
      setState((current) => ({ ...current, posts: [post, ...current.posts] }));
    }, 4200);
  };
  return (
    <main className="page-shell page narrow">
      <PageTitle
        eyebrow="Ask the field"
        title="질문을 구체화하면, 답도 빨라집니다"
        description="AI는 6–10초 데모로 압축되며 실서비스에서는 60–120초 내 첫 답변을 목표로 합니다."
      />
      {status === "idle" ? (
        <form className="form-panel" onSubmit={ask}>
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
              defaultValue="고객이 문제에는 공감하지만 예산 이야기를 미루고 있습니다. 관계를 해치지 않고 의사결정 조건을 확인하고 싶습니다."
            />
          </label>
          <div className="similar-box">
            <span>작성 전 유사 질문</span>
            <Link href="/posts/p1">
              엔터프라이즈 첫 미팅에서 꼭 확인하는 세 가지는? →
            </Link>
          </div>
          <button className="button primary">질문 등록</button>
        </form>
      ) : (
        <div className="ai-progress">
          <div
            className={`progress-step ${status !== "queued" ? "done" : "active"}`}
          >
            <b>01</b>
            <span>질문 안전 검사</span>
          </div>
          <div
            className={`progress-step ${status === "thinking" ? "active" : status === "posted" ? "done" : ""}`}
          >
            <b>02</b>
            <span>AI 첫 관점 생성</span>
          </div>
          <div
            className={`progress-step ${status === "posted" ? "active" : ""}`}
          >
            <b>03</b>
            <span>커뮤니티 답변 대기</span>
          </div>
          {status === "posted" ? (
            <div className="ai-result">
              <span>AI FIRST TAKE</span>
              <h2>예산이 아니라 ‘결정 조건’을 먼저 물어보세요.</h2>
              <p>
                “이 문제가 해결됐다고 판단하려면 어떤 지표와 내부 합의가
                필요할까요?”로 시작해 경제적 영향과 승인 주체를 함께 확인해
                보세요.
              </p>
              <Link className="button primary" href="/community">
                커뮤니티에서 보기
              </Link>
            </div>
          ) : (
            <p className="thinking">
              답변을 준비하는 동안 관련 노하우를 추천하고 있습니다…
            </p>
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
}: {
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  const mine = state.posts.filter(
    (post) => post.author === roleNames[state.role],
  );
  return (
    <main className="page-shell page">
      <PageTitle
        eyebrow="My fieldnote"
        title="경험이 쌓일수록 신뢰도 함께 쌓입니다"
        description="활동, 스크랩, 검증 상태를 한곳에서 관리합니다."
      />
      <div className="account-grid">
        <aside className="profile-panel">
          <div className="avatar">YS</div>
          <h2>{state.role === "guest" ? "체험 방문자" : state.profile.name}</h2>
          <p>{state.profile.headline}</p>
          <span className="trust-chip">현재 역할 {roleNames[state.role]}</span>
          <dl>
            <div>
              <dt>도움 받은 수</dt>
              <dd>428</dd>
            </div>
            <div>
              <dt>작성 콘텐츠</dt>
              <dd>{mine.length + 12}</dd>
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
              <h2>검증 배지</h2>
              <span>{state.badgeStatus}</span>
            </div>
            <div className="badge-box">
              <div>
                <strong>L2</strong>
                <span>재직·실적 검증</span>
              </div>
              <p>
                회사 이메일과 최근 실적을 분리된 비공개 금고에 제출합니다. 공개
                화면에는 검증 결과만 표시됩니다.
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    badgeStatus: "검토중",
                  }));
                  notify("합성 증빙이 업로드되어 검토중으로 전환됐습니다.");
                }}
              >
                합성 증빙으로 신청 체험
              </button>
            </div>
          </section>
          <section>
            <h2>최근 활동</h2>
            <div className="activity-list">
              {state.posts
                .filter((post) => post.saved)
                .map((post) => (
                  <Link href={`/posts/${post.id}`} key={post.id}>
                    <span>스크랩</span>
                    <strong>{post.title}</strong>
                  </Link>
                ))}
              <Link href="/posts/p2">
                <span>댓글</span>
                <strong>ROI 문서 구조에 경험을 덧붙였습니다.</strong>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Compare({ state }: { state: DemoState }) {
  const [a, setA] = useState(companies[0].slug);
  const [b, setB] = useState(companies[1].slug);
  const selected = [
    companies.find((c) => c.slug === a)!,
    companies.find((c) => c.slug === b)!,
  ];
  return (
    <main className="page-shell page">
      <PageTitle
        eyebrow="Side by side"
        title="두 회사를 같은 질문으로 비교하세요"
        description="평균 점수보다 나에게 중요한 영업 조건의 차이를 봅니다."
      />
      <div className="compare-select">
        <select value={a} onChange={(e) => setA(e.target.value)}>
          {companies.map((c) => (
            <option value={c.slug} key={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <span>VS</span>
        <select value={b} onChange={(e) => setB(e.target.value)}>
          {companies.map((c) => (
            <option value={c.slug} key={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="compare-grid">
        {selected.map((company) => (
          <article key={company.slug}>
            <p>{company.industry}</p>
            <h2>{company.name}</h2>
            <strong>
              {companyScore(state.reviews, company.slug, company.score).toFixed(
                1,
              )}
            </strong>
            {Object.entries(company.scores).map(([label, value]) => (
              <div className="compare-row" key={label}>
                <span>{label}</span>
                <b>{value.toFixed(1)}</b>
              </div>
            ))}
            <Link className="text-link" href={`/companies/${company.slug}`}>
              리뷰 자세히 보기 →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}

function Admin({
  path,
  state,
  setState,
  notify,
}: {
  path: string;
  state: DemoState;
  setState: (fn: (s: DemoState) => DemoState) => void;
  notify: (m: string) => void;
}) {
  if (state.role !== "admin")
    return (
      <main className="page-shell page narrow">
        <PageTitle
          eyebrow="Permission required"
          title="운영 관리자 역할이 필요합니다"
          description="아래 데모 도크에서 운영 관리자 역할로 전환하세요."
        />
      </main>
    );
  const nav = (
    <nav className="admin-nav">
      <Link href="/admin">대시보드</Link>
      <Link href="/admin/reviews">리뷰 운영</Link>
      <Link href="/admin/companies">회사·XLSX</Link>
      <Link href="/admin/placements">홈 배치</Link>
      <Link href="/admin/members">회원</Link>
      <Link href="/admin/content">콘텐츠</Link>
    </nav>
  );
  let panel;
  if (path === "/admin/reviews")
    panel = (
      <>
        <AdminTitle title="리뷰 신고·분쟁 큐" count="03" />
        {state.reviews.slice(0, 3).map((review) => (
          <div className="admin-row" key={review.id}>
            <div>
              <span>
                {companies.find((c) => c.slug === review.companySlug)?.name}
              </span>
              <strong>{review.title}</strong>
              <small>
                {review.status === "hidden" ? "블라인드됨" : "공개중"}
              </small>
            </div>
            <button
              onClick={() => {
                setState((current) => ({
                  ...current,
                  reviews: current.reviews.map((item) =>
                    item.id === review.id
                      ? {
                          ...item,
                          status:
                            item.status === "hidden" ? "published" : "hidden",
                        }
                      : item,
                  ),
                }));
                notify("상태 변경과 사유가 감사로그에 기록됐습니다.");
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
        />
        <form
          className="admin-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const name = String(new FormData(form).get("companyName")).trim();
            if (!name) return;
            setState((current) => ({
              ...current,
              manualCompanies: [name, ...current.manualCompanies],
            }));
            form.reset();
            notify("회사 기초정보가 수기 등록됐습니다.");
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
        {state.manualCompanies.map((name) => (
          <div className="admin-row" key={name}>
            <div>
              <span>수기 등록</span>
              <strong>{name}</strong>
              <small>검색 인덱스 반영 대기</small>
            </div>
            <button onClick={() => notify("회사 수정 패널을 열었습니다.")}>
              수정
            </button>
          </div>
        ))}
        <div className="import-box">
          <span>XLSX DRY-RUN</span>
          <h2>회사 1,240행 일괄 등록</h2>
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
              notify(
                "dry-run이 완료됐습니다. 아직 DB에는 반영되지 않았습니다.",
              );
            }}
          >
            샘플 XLSX dry-run
          </button>
        </div>
        <div className="crawler-box">
          <span>CRAWLER CANDIDATE PREVIEW</span>
          <h2>외부 회사 후보 수집</h2>
          <p>
            robots 정책·출처·수집시각을 보존하고 자동 게시 없이 병합 후보만
            생성합니다.
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
              notify("크롤러 후보 미리보기가 생성됐습니다.");
            }}
          >
            후보 수집 dry-run
          </button>
        </div>
      </>
    );
  else if (path === "/admin/placements")
    panel = (
      <>
        <AdminTitle title="홈 콘텐츠 배치" count="08" />
        <div className="placement-preview">
          <span>
            {state.placementsPublished ? "PUBLISHED" : "DRAFT PREVIEW"}
          </span>
          <h2>영업환경이 좋은 조직, 이번 주의 세 곳</h2>
          <p>노스스타 클라우드 · 오빗 바이오웍스 · 모자이크 러닝</p>
          <button
            className="button primary"
            onClick={() => {
              setState((current) => ({
                ...current,
                placementsPublished: !current.placementsPublished,
              }));
              notify(
                state.placementsPublished
                  ? "배치를 draft로 되돌렸습니다."
                  : "홈 배치가 게시됐습니다.",
              );
            }}
          >
            {state.placementsPublished ? "게시 취소" : "지금 게시"}
          </button>
        </div>
      </>
    );
  else if (path === "/admin/members")
    panel = (
      <>
        <AdminTitle title="회원·검증 신청" count="20" />
        {["윤서진 · L2 신청", "한도윤 · 실적 인증"].map((name) => (
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
                  notify("승인 처리와 사유가 감사로그에 기록됐습니다.");
                }}
              >
                승인
              </button>
              <button
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    badgeStatus: "반려",
                  }));
                  notify("반려 처리와 사유가 감사로그에 기록됐습니다.");
                }}
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
        <AdminTitle title="게시글·댓글 모니터링" count="04" />
        {state.posts.slice(0, 4).map((post) => (
          <div className="admin-row" key={post.id}>
            <div>
              <span>{post.board}</span>
              <strong>{post.title}</strong>
              <small>
                신고 {post.id === "p4" ? 2 : 0} · 도움 {post.likes}
              </small>
            </div>
            <button
              onClick={() => {
                setState((current) => ({
                  ...current,
                  hiddenPostIds: current.hiddenPostIds.includes(post.id)
                    ? current.hiddenPostIds.filter((id) => id !== post.id)
                    : [...current.hiddenPostIds, post.id],
                }));
                notify("콘텐츠 공개 상태와 사유가 감사로그에 기록됐습니다.");
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
        <AdminTitle title="오늘의 운영 우선순위" count="07" />
        <div className="admin-metrics">
          <article>
            <span>검증 대기</span>
            <strong>8</strong>
            <small>24시간 내 처리 92%</small>
          </article>
          <article>
            <span>신고 리뷰</span>
            <strong>3</strong>
            <small>고위험 1건</small>
          </article>
          <article>
            <span>AI 실패</span>
            <strong>0</strong>
            <small>재시도 큐 정상</small>
          </article>
        </div>
        <div className="audit-feed">
          <h2>최근 운영 로그</h2>
          {[
            "홈 placement 미리보기 생성",
            "회사 중복 후보 4건 병합 제안",
            "리뷰 개인정보 탐지로 자동 보류",
          ].map((item) => (
            <p key={item}>
              <span>방금 전</span>
              {item}
              <b>trace 확인 →</b>
            </p>
          ))}
        </div>
      </>
    );
  return (
    <main className="admin-shell">
      {nav}
      <section className="admin-panel">{panel}</section>
    </main>
  );
}

function Trust() {
  return (
    <main className="page-shell page">
      <PageTitle
        eyebrow="Trust by design"
        title="익명은 숨김이 아니라, 분리된 책임입니다"
        description="리뷰 신뢰와 작성자 보호를 동시에 지키는 운영 원칙입니다."
      />
      <div className="trust-grid">
        <article>
          <b>01</b>
          <h2>작성자 식별 분리</h2>
          <p>
            공개 리뷰와 식별키를 다른 권한 영역에 저장합니다. 일반 운영자는
            연결할 수 없습니다.
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
          <h2>AI는 보조자</h2>
          <p>
            개인정보·공격 표현을 차단하고 출처 없는 단정은 피합니다. 모든 AI
            답변에 라벨을 붙입니다.
          </p>
        </article>
        <article>
          <b>04</b>
          <h2>모든 운영은 감사 가능</h2>
          <p>
            블라인드, 복구, 승인과 반려는 사유·담당자·trace와 함께 남고 멱등하게
            처리됩니다.
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
function AdminTitle({ title, count }: { title: string; count: string }) {
  return (
    <header className="admin-title">
      <div>
        <p>OPERATIONS CONSOLE</p>
        <h1>{title}</h1>
      </div>
      <strong>{count}</strong>
    </header>
  );
}
function NotFound() {
  return (
    <main className="page-shell page narrow">
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

function DemoDock({
  role,
  setRole,
  reset,
}: {
  role: Role;
  setRole: (role: Role) => void;
  reset: () => void;
}) {
  return (
    <aside className="demo-dock" aria-label="데모 역할 선택">
      <div>
        <span>LIVE DEMO</span>
        <strong>역할을 바꿔 전 기능 체험</strong>
      </div>
      <select
        data-testid="role-switch"
        aria-label="체험 역할"
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
      >
        {(Object.keys(roleNames) as Role[]).map((key) => (
          <option value={key} key={key}>
            {roleNames[key]}
          </option>
        ))}
      </select>
      <button onClick={reset}>초기화</button>
    </aside>
  );
}
