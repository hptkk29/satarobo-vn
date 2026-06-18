import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import Image from 'next/image'
import type { Components } from 'react-markdown'

const mdComponents: Components = {
  // H1 ẩn — title đã render ở page level
  h1: () => null,
  img: ({ src, alt }) => {
    if (!src || typeof src !== 'string') return null
    return (
      <span className="block my-6">
        <Image
          src={src}
          alt={alt ?? ''}
          width={800}
          height={450}
          sizes="(max-width: 768px) 100vw, 768px"
          className="h-auto w-full rounded-2xl object-contain"
        />
      </span>
    )
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-primary-orange underline underline-offset-2 hover:text-primary-orange-dark"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 overflow-x-auto text-sm my-6">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) return <code className={className} {...props}>{children}</code>
    return (
      <code className="bg-orange-50 text-primary-orange px-1.5 py-0.5 rounded text-[0.875em] font-mono" {...props}>
        {children}
      </code>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary-orange pl-5 py-2 bg-soft-cream rounded-r-xl my-6 not-italic">
      {children}
    </blockquote>
  ),
}

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <article className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:text-text-dark prose-p:text-text-muted prose-p:leading-relaxed prose-img:mx-auto prose-img:my-5 prose-img:h-auto prose-img:max-w-full prose-img:rounded-2xl prose-a:no-underline prose-pre:bg-transparent prose-pre:p-0 prose-blockquote:not-italic">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={mdComponents}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
