# notification-file module contract v0

> CMD-2 scope: Tier1 reusable core module contract + mock/port implementation.
> Source of truth: `module/notification-file/`. Generated projects vendor this module into `packages/notification-file` via `project-scaffold-deploy`.

## 1. Purpose

`notification-file` owns the reusable notification and upload boundary for WIGTN 외주 코어 projects.

It provides:

- transactional mail port for non-auth emails;
- in-app notification port;
- recipient resolution rules for domain events;
- upload validation and object-key policy;
- Supabase Storage signed-upload adapter interface;
- dependency-free mock adapters for tests and internal preview.

It does **not** own:

- Supabase Auth signup/password-reset emails;
- domain-specific DB ownership of posts, comments, grade applications, or badge applications;
- virus scanning, image resizing, or heavy media pipeline;
- push notification provider integration.

## 2. Tier1 acceptance contract

Tier1 is complete when a generated project can consume the package without modifying module internals.

Required exports:

| Export                      | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `MailerPort`                | transactional email abstraction                             |
| `NotifierPort`              | in-app notification abstraction                             |
| `UploadsPort`               | presigned upload + completion abstraction                   |
| `DEFAULT_ATTACHMENT_POLICY` | private evidence/attachment upload policy                   |
| `DEFAULT_IMAGE_POLICY`      | public image upload policy                                  |
| `validateUpload`            | size/mime/filename validation before presign and completion |
| `buildObjectKey`            | stable `<bucket>/<ownerId>/<id>-<safe filename>` object key |
| `DEFAULT_RECIPIENT_RULES`   | reusable event-to-recipient rules                           |
| `findRecipientRule`         | event type lookup                                           |
| `resolveRecipients`         | event + rule + optional lookup → recipient IDs              |
| `MockMailer`                | idempotent test mailer                                      |
| `InMemoryNotifier`          | test/internal-preview notifier                              |
| `SupabaseUploadsAdapter`    | Supabase Storage signed upload adapter                      |

## 3. Event boundary

The module consumes domain events using the shared envelope style from `docs/UNIFIED-PRD.md` C1.

Required event fields:

```ts
{
  specVersion: "1";
  id: string;
  type: string;
  occurredAt: string;
  traceId: string;
  actor: {
    type: "user" | "admin" | "service" | "system";
    id: string;
  }
  subject: {
    type: string;
    id: string;
  }
  data: Record<string, unknown>;
}
```

Rules:

- Event payloads must remain reference-minimal; no mail body or large file content is stored in events.
- `event.id` should be reused as an idempotency key when sending mail or processing notification jobs.
- Unknown event types are ignored by default (`findRecipientRule` returns `undefined`).
- Recipient lookup is injected; this module does not query auth/content tables directly.

## 4. Upload policy

Tier1 upload support is deliberately narrow.

### Attachments

- bucket: `attachments`
- private: `true`
- max size: 10MB
- allowed MIME: `image/jpeg`, `image/png`, `application/pdf`

### Images

- bucket: `images`
- private: `false`
- max size: 10MB
- allowed MIME: `image/jpeg`, `image/png`, `image/webp`

Validation failures use stable reason strings:

- `empty`
- `too_large`
- `mime_not_allowed`
- `bad_filename`

## 5. Adapters and secrets

`SupabaseUploadsAdapter` receives all runtime secrets through constructor config:

```ts
new SupabaseUploadsAdapter({
  supabaseUrl,
  serviceKey,
  newId,
  clock,
});
```

Rules:

- No API keys or service-role secrets are committed in code.
- `serviceKey` may be a string or async provider function to support env/secret-manager injection.
- The adapter only signs upload URLs and confirms uploaded object metadata.

## 6. Generated project behavior

When `project-scaffold-deploy` generates a project:

- `module/notification-file/src` is copied into `packages/notification-file/src`;
- package metadata is merged while preserving generated package names such as `@sales-community/notification-file`;
- module tests are not copied into generated `src`;
- generated project test/build gates must pass without editing module internals.

## 7. Review points

- Hyunwoo/PM: recipient rules and handoff shape cover in-app/mail/upload fast-follow needs.
- Hyeonsang/backoffice-auth: role/subject-owner lookup boundary is sufficient without coupling DB ownership.
- Sangwoo/AI: outbox event envelope and idempotency rules are compatible with AI subscriptions.
- Harrison/contracts: scope is explainable as Tier1 core — real push/media pipeline remains separate estimate.
