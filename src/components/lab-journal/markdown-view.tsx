import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-pre:bg-muted prose-pre:text-foreground prose-code:before:hidden prose-code:after:hidden">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}