import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createWikiMarkdownComponents } from "./wikiMarkdownComponents";

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
  const components = createWikiMarkdownComponents();

  return (
    <div className="wiki-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
