// Renderer markdown cho bộ hướng dẫn site admin — theo idiom admin (nền trắng,
// neutral + nhấn cam, không dark mode). Không dùng components/blog/
// markdown-renderer (token public site).
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const mdComponents: Components = {
  // H1 ẩn — tiêu đề đã render ở header của trang chi tiết.
  h1: () => null,
  h2: ({ children }) => (
    <h2 className="mt-8 border-b border-neutral-200 pb-2 text-lg font-bold text-neutral-900 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-base font-bold text-neutral-900">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-3 text-sm leading-relaxed text-neutral-700">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-700">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-700">
      {children}
    </ol>
  ),
  a: ({ href, children }) => {
    const url = href ?? "#";
    if (url.startsWith("/")) {
      return (
        <Link
          href={url}
          className="font-medium text-primary underline underline-offset-2 hover:text-primary"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2 hover:text-primary"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-900">{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-lg border-l-4 border-primary bg-primary-soft/60 px-4 py-2 text-sm [&_p]:my-1">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-neutral-100 p-4 text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-neutral-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-neutral-200 px-3 py-2 text-left text-xs font-bold text-neutral-500">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-neutral-100 px-3 py-2 align-top text-neutral-700 last:border-b-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-6 border-neutral-200" />,
};

export function GuideMarkdown({ content }: { content: string }) {
  return (
    <article>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
