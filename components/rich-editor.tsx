"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import { IconBold, IconLink, IconList, IconQuote } from "./icons";

/**
 * 글 본문 편집기.
 *
 * ## 왜 바꿨나
 *
 * 전에는 그냥 textarea 였고, 서식 버튼이 고른 글자를 `**굵게**` 처럼
 * 마크다운 기호로 감쌌다. 누르면 글 안에 별표가 그대로 보인다. 쓰는 사람이
 * 문법을 알아야 하고, 굵게 하려고 눌렀는데 굵어지지도 않는다.
 *
 * 서식은 눌렀을 때 **그 자리에서 그렇게 보여야** 한다. 직접 만들면
 * 선택 영역·되돌리기·붙여넣기·한글 조합 중 입력까지 전부 다시 만들어야
 * 해서, 편집기 라이브러리(TipTap)를 쓴다.
 *
 * ## 무엇을 켜 두나
 *
 * 서식 도구에 있는 네 가지 - 굵게·링크·목록·인용 - 만 켠다. 도구에 없는
 * 서식이 붙여넣기로 들어오면 그건 화면에 없는 기능이라, 나중에 고칠 방법도
 * 없다. StarterKit 에서 안 쓰는 것들을 끈다.
 */

const TOOLS = [
  { key: "bold", label: "굵게", Icon: IconBold },
  { key: "link", label: "링크", Icon: IconLink },
  { key: "bulletList", label: "목록", Icon: IconList },
  { key: "blockquote", label: "인용", Icon: IconQuote },
] as const;

export function RichEditor({
  value,
  onChange,
  ariaLabel = "내용",
}: {
  value: string;
  onChange: (html: string) => void;
  ariaLabel?: string;
}) {
  const editor = useEditor({
    // 서버에서 미리 그리지 않는다. 켜 두면 브라우저가 그린 결과와 달라져
    // React 가 경고를 낸다(hydration mismatch).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // 도구에 없는 서식은 끈다. 붙여넣기로 들어와도 남지 않는다.
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // 쓰는 사람이 주소창에서 복사해 붙이는 것만 링크로 만든다.
        protocols: ["http", "https"],
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rich-editor-surface",
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      // 아무것도 안 쓴 상태의 `<p></p>` 는 빈 값으로 넘긴다. 안 그러면
      // required 검사를 통과해 버려서 빈 글이 등록된다.
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  // 폼을 비우면(등록 후) 편집기도 같이 비운다.
  useEffect(() => {
    if (editor && value === "" && !editor.isEmpty) {
      editor.commands.clearContent();
    }
  }, [editor, value]);

  /*
    지금 걸려 있는 서식.

    TipTap 3 은 글자를 칠 때마다 React 를 다시 그리지 않는다(그게 빠르다).
    그래서 `editor.isActive(...)` 를 그냥 읽으면 버튼의 눌림 표시가 처음
    값에서 안 움직인다. 바뀔 때만 다시 그리도록 따로 구독한다.
  */
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      link: editor?.isActive("link") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      blockquote: editor?.isActive("blockquote") ?? false,
    }),
  });

  if (!editor) {
    // 편집기가 준비되기 전 한 프레임. 자리를 비워 두면 화면이 튄다.
    return <div className="rich-editor" aria-busy="true" />;
  }

  const run = (key: (typeof TOOLS)[number]["key"]) => {
    const chain = editor.chain().focus();
    if (key === "bold") return chain.toggleBold().run();
    if (key === "bulletList") return chain.toggleBulletList().run();
    if (key === "blockquote") return chain.toggleBlockquote().run();

    // 링크. 이미 링크 위라면 푼다.
    if (editor.isActive("link")) return chain.unsetLink().run();
    const input = window.prompt("링크 주소를 입력하세요", "https://");
    if (!input) return false;
    const href = input.trim();
    if (!/^https?:\/\//i.test(href)) {
      window.alert(
        "http:// 또는 https:// 로 시작하는 주소만 넣을 수 있습니다.",
      );
      return false;
    }
    return chain.extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="서식 도구">
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.key}
            title={tool.label}
            aria-label={tool.label}
            // 지금 이 서식이 걸려 있는지 알려 준다. 전에는 눌러도 아무
            // 표시가 없어서 켜졌는지 꺼졌는지 알 수 없었다.
            aria-pressed={active?.[tool.key] ?? false}
            className={active?.[tool.key] ? "is-on" : undefined}
            /*
              누르는 순간 편집기에서 초점이 빠지면서 고른 영역이 풀린다.
              그러면 서식이 "지금 커서 자리"에만 걸려서, 글자를 골라 두고
              굵게를 눌러도 아무 일도 안 일어난다. 기본 동작을 막아 고른
              영역을 그대로 둔다.
            */
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(tool.key)}
          >
            <tool.Icon />
            <span>{tool.label}</span>
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
