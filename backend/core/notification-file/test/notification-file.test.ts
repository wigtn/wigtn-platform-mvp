import { afterEach, describe, expect, it, vi } from "vitest";

import {
  moduleName,
  validateUpload,
  buildObjectKey,
  extensionAllowed,
  DEFAULT_ATTACHMENT_POLICY,
  resolveRecipients,
  findRecipientRule,
  DEFAULT_RECIPIENT_RULES,
  SupabaseUploadsAdapter,
  MockMailer,
  InMemoryNotifier,
  type DomainEvent,
  type RecipientLookup,
  type UploadRequest,
} from "../src/index";

const req = (over: Partial<UploadRequest> = {}): UploadRequest => ({
  filename: "evidence.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  ownerId: "u1",
  ...over,
});

describe("notification-file 모듈", () => {
  it("moduleName", () => expect(moduleName).toBe("notification-file"));

  describe("업로드 검증 (§3.5)", () => {
    it("정책 통과", () =>
      expect(validateUpload(req(), DEFAULT_ATTACHMENT_POLICY).ok).toBe(true));
    it("용량 초과 거부", () =>
      expect(
        validateUpload(
          req({ sizeBytes: 20 * 1024 * 1024 }),
          DEFAULT_ATTACHMENT_POLICY,
        ).reason,
      ).toBe("too_large"));
    it("MIME 미허용 거부", () =>
      expect(
        validateUpload(
          req({ mimeType: "application/zip" }),
          DEFAULT_ATTACHMENT_POLICY,
        ).reason,
      ).toBe("mime_not_allowed"));
    it("경로 조작 파일명 거부", () =>
      expect(
        validateUpload(
          req({ filename: "../etc/passwd" }),
          DEFAULT_ATTACHMENT_POLICY,
        ).reason,
      ).toBe("bad_filename"));
    it("object key는 owner·id 포함, 경로 문자 제거", () => {
      const key = buildObjectKey(
        DEFAULT_ATTACHMENT_POLICY,
        req({ filename: "a/b c.pdf" }),
        "x1",
      );
      expect(key).toContain("attachments/u1/x1-");
      expect(key).not.toContain("a/b");
    });
    it("object key owner/id 경로 세그먼트 조작은 거부", () => {
      expect(() =>
        buildObjectKey(
          DEFAULT_ATTACHMENT_POLICY,
          req({ ownerId: "../u1" }),
          "x1",
        ),
      ).toThrow("bad path segment");
      expect(() =>
        buildObjectKey(DEFAULT_ATTACHMENT_POLICY, req(), "x/1"),
      ).toThrow("bad path segment");
    });
    it("확장자 화이트리스트", () => {
      expect(extensionAllowed("x.pdf", DEFAULT_ATTACHMENT_POLICY)).toBe(true);
      expect(extensionAllowed("x.exe", DEFAULT_ATTACHMENT_POLICY)).toBe(false);
    });
  });

  describe("수신자 결정 (§9.2)", () => {
    const ev = (
      type: string,
      data: Record<string, unknown> = {},
      subjectId = "s1",
    ): DomainEvent => ({
      specVersion: "1",
      id: "e1",
      type,
      occurredAt: "x",
      traceId: "t",
      actor: { type: "admin", id: "admin1" },
      subject: { type: "grade_application", id: subjectId },
      data,
    });
    const lookup: RecipientLookup = {
      async subjectOwner() {
        return "owner-9";
      },
      async usersByRole() {
        return ["r1", "r2"];
      },
    };

    it("subject-owner는 lookup 역조회", async () => {
      const rule = findRecipientRule("identity.grade.application.approved.v1")!;
      expect(await resolveRecipients(ev(rule.eventType), rule, lookup)).toEqual(
        ["owner-9"],
      );
    });
    it("payload 힌트는 이벤트 data에서", async () => {
      const rule = findRecipientRule("community.comment.created.v1")!;
      expect(
        await resolveRecipients(
          ev(rule.eventType, { postAuthorId: "author-3" }),
          rule,
        ),
      ).toEqual(["author-3"]);
    });
    it("lookup 없으면 subject-owner는 빈 배열(안전)", async () => {
      const rule = DEFAULT_RECIPIENT_RULES[0];
      expect(await resolveRecipients(ev(rule.eventType), rule)).toEqual([]);
    });
  });

  describe("Supabase 업로드 어댑터", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("signed upload URL 요청은 안전한 objectKey로만 만든다", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "/signed/path", token: "tok" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new SupabaseUploadsAdapter({
        supabaseUrl: "https://example.supabase.co",
        serviceKey: "svc",
        newId: () => "id-1",
      });

      const ticket = await adapter.createUpload(
        req(),
        DEFAULT_ATTACHMENT_POLICY,
      );

      expect(ticket.objectKey).toBe("attachments/u1/id-1-evidence.pdf");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://example.supabase.co/storage/v1/object/upload/sign/attachments/u1/id-1-evidence.pdf",
      );
    });

    it("signed upload URL 응답이 깨졌으면 ticket을 만들지 않는다", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ token: "tok" }),
        }),
      );
      const adapter = new SupabaseUploadsAdapter({
        supabaseUrl: "https://example.supabase.co",
        serviceKey: "svc",
        newId: () => "id-1",
      });

      await expect(
        adapter.createUpload(req(), DEFAULT_ATTACHMENT_POLICY),
      ).rejects.toThrow("missing signed upload url");
    });

    it("completeUpload은 objectKey 조작·bucket 불일치·정책 초과 메타를 거부", async () => {
      const adapter = new SupabaseUploadsAdapter({
        supabaseUrl: "https://example.supabase.co",
        serviceKey: "svc",
        newId: () => "id-1",
      });
      await expect(
        adapter.completeUpload("attachments/../x", DEFAULT_ATTACHMENT_POLICY),
      ).resolves.toEqual({ ok: false });
      await expect(
        adapter.completeUpload(
          "other/u1/id-1-evidence.pdf",
          DEFAULT_ATTACHMENT_POLICY,
        ),
      ).resolves.toEqual({ ok: false });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            size: 20 * 1024 * 1024,
            mimetype: "application/pdf",
          }),
        }),
      );
      await expect(
        adapter.completeUpload(
          "attachments/u1/id-1-evidence.pdf",
          DEFAULT_ATTACHMENT_POLICY,
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "too_large",
        sizeBytes: 20 * 1024 * 1024,
        mimeType: "application/pdf",
      });
    });
  });

  describe("mailer 멱등 + 인앱 알림", () => {
    it("MockMailer는 idempotencyKey 중복 발송 안 함", async () => {
      const m = new MockMailer();
      await m.send({
        to: "a@b.com",
        subject: "s",
        html: "h",
        idempotencyKey: "k1",
      });
      const dup = await m.send({
        to: "a@b.com",
        subject: "s",
        html: "h",
        idempotencyKey: "k1",
      });
      expect(dup.delivered).toBe(false);
      expect(m.sent).toHaveLength(1);
    });
    it("인앱 알림 저장·미읽음 조회·읽음 처리", async () => {
      const n = new InMemoryNotifier(() => new Date("2026-07-19T00:00:00Z"));
      const created = await n.notify({
        recipientId: "u1",
        type: "grade_approved",
        title: "승인",
        body: "축하합니다",
      });
      expect(
        (await n.listForRecipient("u1", { unreadOnly: true })).length,
      ).toBe(1);
      expect(await n.markRead(created.id, "u1")).toBe(true);
      expect(
        (await n.listForRecipient("u1", { unreadOnly: true })).length,
      ).toBe(0);
    });
  });
});
