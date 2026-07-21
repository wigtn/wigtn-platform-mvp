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
      {!initialPath.startsWith("/admin") ? <Footer /> : null}
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
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="FIELDNOTE 홈">
          FIELD<span>NOTE</span>
        </Link>
        <nav aria-label="주요 메뉴">
          <Link href="/companies">회사 리뷰</Link>
          <Link href="/community">영업 Q&amp;A</Link>
          <Link href="/compare">회사 비교</Link>
          <Link href="/trust">검증 정책</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-write" href="/reviews/new">
            리뷰 작성
          </Link>
          <Link
            className="header-role"
            href={role === "admin" ? "/admin" : "/account"}
          >
            {role === "guest" ? "로그인 · 내 활동" : roleNames[role]}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Home({ state }: { state: DemoState }) {
  const top = companies.slice(0, 4);
  const [query, setQuery] = useState("");
  const router = useRouter();
  return (
    <main>
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
              현직자 리뷰로 회사별 영업 방식과 지원 체계를 비교할 수 있습니다.
            </p>
            <form
              className="hero-search"
              onSubmit={(event) => {
                event.preventDefault();
                router.push(`/companies?q=${encodeURIComponent(query)}`);
              }}
            >
              <span aria-hidden="true">⌕</span>
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
                <span>이번 주 많이 본 회사</span>
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
                <b>{company.score.toFixed(1)}</b>
              </Link>
            ))}
            <div className="preview-proof">
              <span>
                <b>4,812</b> 재직 확인 회원
              </span>
              <span>
                <b>1,260</b> 누적 회사 리뷰
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
          <Link href="/trust">검증 정책 보기 →</Link>
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
                  {companyScore(
                    state.reviews,
                    top[0].slug,
                    top[0].score,
                  ).toFixed(1)}
                </dd>
              </div>
              <div>
                <dt>가장 높은 항목</dt>
                <dd>세일즈 툴 4.7</dd>
              </div>
              <div>
                <dt>재직 확인 리뷰</dt>
                <dd>{top[0].reviewCount}건</dd>
              </div>
            </dl>
            <div className="featured-company-actions">
              <Link
                className="button primary"
                href={`/companies/${top[0].slug}`}
              >
                회사 리포트 보기
              </Link>
              <Link className="text-link" href="/compare">
                비교 목록에 담기
              </Link>
            </div>
          </article>
          <div className="ranked-companies">
            <div className="ranked-heading">
              <span>순위</span>
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
                  <small>
                    {index === 0
                      ? "매니저 코칭 4.5"
                      : index === 1
                        ? "세일즈 툴 4.4"
                        : "계정 배분 4.3"}
                  </small>
                </span>
                <span className="ranked-company-score">
                  {companyScore(
                    state.reviews,
                    company.slug,
                    company.score,
                  ).toFixed(1)}
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
              <Link href="/trust">산정 방식 확인 →</Link>
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
            {state.posts.slice(1, 4).map((post) => (
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
          <span>01</span>
          <div>
            <p className="kicker">회사 비교</p>
            <h2>
              회사 두 곳의 점수를
              <br />
              항목별로 비교합니다.
            </h2>
            <p>목표, 인센티브, 리드 품질 등 6개 항목을 비교합니다.</p>
          </div>
          <Link className="button primary" href="/compare">
            회사 비교하기
          </Link>
        </div>
        <div className="decision-card question-card">
          <span>02</span>
          <div>
            <p className="kicker">영업 Q&amp;A</p>
            <h2>
              실무 질문을 남기고
              <br />
              현직자 답변을 받으세요.
            </h2>
            <p>질문이 등록되면 관련 경험이 있는 회원에게 노출됩니다.</p>
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
  index,
}: {
  company: (typeof companies)[number];
  score: number;
  index: number;
}) {
  return (
    <article className="company-card">
      <div className="company-card-head">
        <span className={`company-logo logo-${company.slug}`}>
          {company.name.slice(0, 1)}
        </span>
        <span className="company-index">추천 {index}</span>
      </div>
      <p className="caption">
        {company.industry} · {company.type}
      </p>
      <h3>
        <Link href={`/companies/${company.slug}`}>{company.name}</Link>
      </h3>
      <p>{company.summary}</p>
      <div className="score-line">
        <span className="star">★</span>
        <strong>{score.toFixed(1)}</strong>
        <span>리뷰 {company.reviewCount}</span>
        <b className={company.trend >= 0 ? "up" : "down"}>
          관심도 {company.trend >= 0 ? "+" : ""}
          {company.trend}%
        </b>
      </div>
    </article>
  );
}

function Companies({ state }: { state: DemoState }) {
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
    <main className="page-shell page">
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
  const rankedDimensions = Object.entries(dimensionScores).sort(
    ([, a], [, b]) => b - a,
  );
  const strongest = rankedDimensions[0];
  const weakest = rankedDimensions[rankedDimensions.length - 1];
  return (
    <main className="page-shell page company-detail-page">
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
            <div className="company-facts">
              <span>리뷰 {company.reviewCount}건</span>
              <span>최근 업데이트 3일 전</span>
              <span>최근 12개월 리뷰 반영</span>
            </div>
          </div>
        </div>
        <div className="company-decision-box">
          <div className="score-monument">
            <span>영업환경 종합</span>
            <strong>{score.toFixed(1)}</strong>
            <small>
              재직 확인 리뷰{" "}
              {reviews.filter((review) => review.verified).length}건 포함
            </small>
          </div>
          <div className="company-decision-actions">
            <Link className="button primary" href="/reviews/new">
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
            <li>분기 초 계정 배분 기준을 공유합니다.</li>
            <li>큰 딜에는 세일즈 엔지니어가 초반부터 참여합니다.</li>
            <li>툴과 프로세스가 자주 바뀐다는 의견이 있습니다.</li>
          </ul>
          <Link href="/questions/new">현직자에게 확인 질문하기 →</Link>
        </aside>
      </section>
      <section className="section-tight" id="environment">
        <div className="section-heading">
          <div>
            <p className="kicker">항목별 점수</p>
            <h2>영업환경 6축</h2>
          </div>
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
            {reviews.map((review) => (
              <article key={review.id}>
                <div>
                  <span className="trust-chip">
                    {review.verified ? "재직 검증" : "일반"}
                  </span>
                  <span>{review.employment}</span>
                  <strong>★ {review.score.toFixed(1)}</strong>
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
        eyebrow="회사 리뷰"
        title="익명 리뷰 작성"
        description="개인이나 고객을 특정할 수 있는 정보는 제외해 주세요. 등록 전에 개인정보 포함 여부를 확인합니다."
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
  const [search, setSearch] = useState("");
  const posts = state.posts.filter(
    (post) =>
      !state.hiddenPostIds.includes(post.id) &&
      (board === "전체" || post.board === board) &&
      `${post.title}${post.body}${post.author}`.includes(search),
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
    <main className="page community-page">
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
          <dl className="community-stats">
            <div>
              <dt>답변 완료율</dt>
              <dd>94%</dd>
            </div>
            <div>
              <dt>첫 답변까지</dt>
              <dd>평균 18분</dd>
            </div>
            <div>
              <dt>검증 영업인</dt>
              <dd>4,812명</dd>
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
                <b>
                  {value === "전체"
                    ? state.posts.length
                    : state.posts.filter((post) => post.board === value).length}
                </b>
              </button>
            ))}
          </nav>
          <div className="channel-guide">
            <strong>좋은 질문의 조건</strong>
            <p>
              상황, 시도한 방법, 원하는 결과를 함께 적으면 더 구체적인 답을 받을
              수 있습니다.
            </p>
            <Link href="/questions/new">질문 가이드 보기 →</Link>
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
            <span>{posts.length}개 결과 · 최신순</span>
          </div>
          <div className="feed">
            {posts.map((post) => (
              <article
                key={post.id}
                className={post.board === "Q&A" ? "question-post" : ""}
              >
                <div className="post-index">
                  {post.board === "Q&A"
                    ? "Q"
                    : post.board === "노하우"
                      ? "N"
                      : post.board === "실적"
                        ? "R"
                        : "F"}
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
                    {post.ai ? (
                      <span className="ai-label">첫 답변 완료</span>
                    ) : null}
                    <button onClick={() => toggleSave(post.id)}>
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
            <ol>
              <li>
                <Link href="/community">엔터프라이즈 첫 미팅</Link>
                <span>42</span>
              </li>
              <li>
                <Link href="/community">인센티브 협상</Link>
                <span>31</span>
              </li>
              <li>
                <Link href="/community">영업 리더 이직</Link>
                <span>28</span>
              </li>
              <li>
                <Link href="/community">ROI 제안서</Link>
                <span>19</span>
              </li>
            </ol>
          </section>
          <section className="answer-standard">
            <span>답변자 확인 정보</span>
            <strong>경력·재직·실적 확인 여부를 표시합니다.</strong>
            <p>답변자 이름 옆의 확인 배지를 참고하세요.</p>
            <Link href="/trust">검증 정책 →</Link>
          </section>
        </aside>
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
        eyebrow="커뮤니티"
        title="게시글 작성"
        description="영업 경험이나 업무 자료를 공유할 수 있습니다. 데모에서는 첨부 파일의 이름만 저장합니다."
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
          <small>JPG·PNG·WebP · 데모에서는 파일 이름만 저장합니다.</small>
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
            <span>AI 초안 · 개인정보 검사 완료</span>
            <h3>첫 미팅에서 승인자와 다음 일정을 확인하세요.</h3>
            <p>
              예산 승인자, 현재 문제로 발생하는 비용, 구매 일정을 확인하세요.
              미팅이 끝나기 전에 다음 회의 참석자와 준비 자료도 정해두는 것이
              좋습니다.
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
          회원 답변 <span>{post.comments.length}</span>
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
                ? "답변 작성"
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
    notify("질문을 등록했습니다. AI 초안을 작성 중입니다.");
    window.setTimeout(() => setStatus("thinking"), 1200);
    window.setTimeout(() => {
      setStatus("posted");
      const post: Post = {
        id: `p-${Date.now()}`,
        board: "Q&A",
        title,
        body: "질문 등록 시 입력한 상황 설명입니다.",
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
        eyebrow="영업 Q&A"
        title="커뮤니티에 질문하기"
        description="질문 등록 후 AI 초안이 먼저 표시되고, 이후 회원 답변을 받을 수 있습니다."
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
              defaultValue="고객이 제품 필요성은 인정하지만 예산 이야기는 계속 미룹니다. 첫 미팅에서 어떤 순서로 물어봐야 할까요?"
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
            <span>질문 내용 검사</span>
          </div>
          <div
            className={`progress-step ${status === "thinking" ? "active" : status === "posted" ? "done" : ""}`}
          >
            <b>02</b>
            <span>AI 초안 작성</span>
          </div>
          <div
            className={`progress-step ${status === "posted" ? "active" : ""}`}
          >
            <b>03</b>
            <span>커뮤니티 답변 대기</span>
          </div>
          {status === "posted" ? (
            <div className="ai-result">
              <span>AI 초안</span>
              <h2>예산 승인 절차와 결정 기준을 먼저 확인하세요.</h2>
              <p>
                먼저 예산을 승인하는 사람과 검토 순서를 물어보세요. 이어서 도입
                여부를 결정할 지표와 내부 일정을 확인하면 됩니다.
              </p>
              <Link className="button primary" href="/community">
                커뮤니티에서 보기
              </Link>
            </div>
          ) : (
            <p className="thinking">
              질문 내용을 확인하고 AI 초안을 작성하고 있습니다.
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
        eyebrow="마이페이지"
        title="내 활동 관리"
        description="프로필, 작성 글, 스크랩, 확인 배지를 관리합니다."
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
              <h2>확인 배지</h2>
              <span>{state.badgeStatus}</span>
            </div>
            <div className="badge-box">
              <div>
                <strong>L2</strong>
                <span>재직·실적 검증</span>
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
                  notify("샘플 확인 자료를 제출했습니다.");
                }}
              >
                샘플 자료로 신청
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
                <strong>ROI 문서 글에 댓글을 작성했습니다.</strong>
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
        eyebrow="회사 비교"
        title="회사 두 곳 비교"
        description="영업환경 6개 항목의 점수와 리뷰를 나란히 확인합니다."
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
  const [reviewFilter, setReviewFilter] = useState<
    "all" | "privacy" | "report"
  >("all");
  const reviewQueue = state.reviews.slice(0, 3).filter((review) => {
    if (reviewFilter === "privacy") return review.id === "r1";
    if (reviewFilter === "report") return review.id !== "r1";
    return true;
  });
  if (state.role !== "admin")
    return (
      <main className="page-shell page narrow">
        <PageTitle
          eyebrow="접근 권한"
          title="운영 관리자 역할이 필요합니다"
          description="아래 데모 도크에서 운영 관리자 역할로 전환하세요."
        />
      </main>
    );
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
        리뷰 운영 <b>3</b>
      </Link>
      <Link
        className={path === "/admin/members" ? "active" : ""}
        href="/admin/members"
      >
        회원 <b>8</b>
      </Link>
      <Link
        className={path === "/admin/content" ? "active" : ""}
        href="/admin/content"
      >
        콘텐츠 <b>4</b>
      </Link>
      <span className="admin-nav-label">데이터 관리</span>
      <Link
        className={path === "/admin/companies" ? "active" : ""}
        href="/admin/companies"
      >
        회사·XLSX
      </Link>
      <Link
        className={path === "/admin/placements" ? "active" : ""}
        href="/admin/placements"
      >
        홈 배치
      </Link>
      <div className="admin-nav-status">
        <i />
        <span>모든 시스템 정상</span>
      </div>
    </nav>
  );
  let panel;
  if (path === "/admin/reviews")
    panel = (
      <>
        <AdminTitle title="검토할 리뷰" count="03" />
        <div className="admin-queue-toolbar">
          <div>
            <button
              className={reviewFilter === "all" ? "active" : ""}
              aria-pressed={reviewFilter === "all"}
              onClick={() => setReviewFilter("all")}
            >
              전체 3
            </button>
            <button
              className={reviewFilter === "privacy" ? "active" : ""}
              aria-pressed={reviewFilter === "privacy"}
              onClick={() => setReviewFilter("privacy")}
            >
              개인정보 1
            </button>
            <button
              className={reviewFilter === "report" ? "active" : ""}
              aria-pressed={reviewFilter === "report"}
              onClick={() => setReviewFilter("report")}
            >
              신고 2
            </button>
          </div>
          <span>목표 처리시간 2시간 · 현재 SLA 정상</span>
        </div>
        <div className="admin-list-head" aria-hidden="true">
          <span>리뷰</span>
          <span>상태</span>
          <span>처리</span>
        </div>
        {reviewQueue.map((review) => (
          <div className="admin-row admin-review-row" key={review.id}>
            <div>
              <span>
                {companies.find((c) => c.slug === review.companySlug)?.name}
              </span>
              <strong>{review.title}</strong>
              <small>
                {review.employment} · 평점 {review.score.toFixed(1)}
              </small>
            </div>
            <span className={`admin-row-status ${review.status}`}>
              {review.status === "hidden" ? "비공개" : "공개"}
            </span>
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
                notify("리뷰 공개 상태를 변경했습니다.");
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
        <AdminTitle title="홈 콘텐츠 배치" count="08" />
        <div className="placement-preview">
          <span>{state.placementsPublished ? "게시 중" : "미리보기"}</span>
          <h2>이번 주 추천 회사 3곳</h2>
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
                  ? "추천 영역을 미리보기 상태로 변경했습니다."
                  : "추천 영역을 게시했습니다.",
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
                  notify("확인 배지 신청을 승인했습니다.");
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
                  notify("확인 배지 신청을 반려했습니다.");
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
                notify("게시글 공개 상태를 변경했습니다.");
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
        <section className="priority-brief">
          <div>
            <span>가장 먼저 처리할 작업</span>
            <h2>개인정보 탐지로 보류된 리뷰 1건</h2>
            <p>게시 기한까지 38분 남았습니다. 원문과 탐지 구간을 확인하세요.</p>
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
            <strong>8</strong>
            <small>24시간 내 처리율 92% · 가장 오래된 건 3시간</small>
            <Link href="/admin/members">대기열 열기 →</Link>
          </article>
          <article>
            <div>
              <span>신고 리뷰</span>
              <b className="urgent">주의</b>
            </div>
            <strong>3</strong>
            <small>고위험 1건 · 오늘 신규 2건</small>
            <Link href="/admin/reviews">분쟁 큐 열기 →</Link>
          </article>
          <article>
            <div>
              <span>AI 답변 오류</span>
              <b>정상</b>
            </div>
            <strong>0</strong>
            <small>재시도 대기 없음 · 마지막 점검 2분 전</small>
            <Link href="/admin/content">상태 확인 →</Link>
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
            {[
              ["P1", "리뷰", "개인정보 탐지 구간 확인", "38분 남음"],
              ["P2", "회원", "재직 증빙 8건 검토", "오늘 18:00"],
              ["P3", "회사", "중복 후보 4건 병합", "내일"],
            ].map(([priority, type, title, due]) => (
              <Link
                href={
                  type === "리뷰"
                    ? "/admin/reviews"
                    : type === "회원"
                      ? "/admin/members"
                      : "/admin/companies"
                }
                className="work-queue-row"
                key={title}
              >
                <span className={`priority priority-${priority.toLowerCase()}`}>
                  {priority}
                </span>
                <span>{type}</span>
                <strong>{title}</strong>
                <small>{due}</small>
              </Link>
            ))}
          </section>
          <section className="audit-feed">
            <div className="admin-section-head">
              <div>
                <span>처리 기록</span>
                <h2>최근 운영 로그</h2>
              </div>
            </div>
            {[
              "홈 추천 영역 미리보기 생성",
              "회사 중복 후보 4건 확인 요청",
              "리뷰 개인정보 탐지로 자동 보류",
            ].map((item, index) => (
              <p key={item}>
                <span>{index === 0 ? "방금 전" : `${index * 7}분 전`}</span>
                {item}
                <b>기록 보기 →</b>
              </p>
            ))}
          </section>
        </div>
      </>
    );
  return (
    <main className="admin-shell">
      {nav}
      <section className="admin-panel">
        <div className="admin-contextbar">
          <span>2026년 7월 21일 · 운영 관리자</span>
          <div>
            <i />
            실시간 동기화
          </div>
        </div>
        {panel}
      </section>
    </main>
  );
}

function Trust() {
  return (
    <main className="page-shell page">
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
function AdminTitle({ title, count }: { title: string; count: string }) {
  return (
    <header className="admin-title">
      <div>
        <p>관리자 도구</p>
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
        <span>공개 데모</span>
        <strong>역할 변경</strong>
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
