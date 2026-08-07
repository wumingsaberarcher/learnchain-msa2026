import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  content: string
  className?: string
}

/** Renders Canal replies with lists, code fences, links, etc. */
export default function ChatMarkdown({ content, className }: Props) {
  if (!content.trim()) return null

  return (
    <div className={className ? `chat-md ${className}` : 'chat-md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Avoid raw HTML; keep code readable.
          code: ({ className: codeClass, children, ...props }) => {
            const text = String(children).replace(/\n$/, '')
            const isBlock = Boolean(codeClass) || text.includes('\n')
            if (!isBlock) {
              return (
                <code className="chat-md-inline-code" {...props}>
                  {children}
                </code>
              )
            }
            const lang = /language-([\w-]+)/.exec(codeClass || '')?.[1]
            return (
              <div className="chat-md-codeblock">
                {lang && <div className="chat-md-code-lang">{lang}</div>}
                <pre>
                  <code className={codeClass} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            )
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** Plain text for typewriter / TTS (strip light markdown noise). */
export function stripMarkdownLite(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[\w-]*\n?/, '').replace(/```$/, '')
      return `\n${inner.trim()}\n`
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
