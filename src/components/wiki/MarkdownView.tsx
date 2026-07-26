import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownViewProps = {
  markdown: string;
};

export default function MarkdownView({ markdown }: MarkdownViewProps) {
  if (!markdown.trim()) {
    return (
      <p className="text-sm text-white/45">
        Страница пока пустая. Откройте редактор, чтобы добавить содержимое.
      </p>
    );
  }

  return (
    <div className="wiki-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
