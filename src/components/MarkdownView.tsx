import type { Components } from "react-markdown";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Allow http(s) and data:image/* only — blocks javascript: etc. */
function safeUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^pica-mention:/i.test(trimmed)) return trimmed;
  return defaultUrlTransform(url);
}

/** Light @Name → markdown link so we can style without rehype-raw. */
function linkifyMentions(text: string): string {
  // Avoid rewriting inside existing markdown links / images / code fences roughly:
  // only plain @tokens with word chars / . - 
  return text.replace(
    /(^|[\s(])(@[\w][\w.\-]*)/g,
    (_full, lead: string, mention: string) =>
      `${lead}[${mention}](pica-mention:${encodeURIComponent(mention.slice(1))})`,
  );
}

const components: Components = {
  img: ({ src, alt, ...rest }) => {
    if (!src) return null;
    return (
      <img
        {...rest}
        src={src}
        alt={alt || ""}
        className="my-1 max-h-80 max-w-full rounded-xl border border-[var(--color-line)] object-contain"
        loading="lazy"
      />
    );
  },
  a: ({ href, children, ...rest }) => {
    if (href?.startsWith("pica-mention:")) {
      return (
        <span className="mention rounded-md bg-[var(--color-accent)]/12 px-1 py-0.5 font-medium text-[var(--color-accent)]">
          {children}
        </span>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  },
};

export function MarkdownView({
  text,
  typing,
  highlightMentions,
}: {
  text: string;
  typing?: boolean;
  /** Style @Word tokens (group threads). */
  highlightMentions?: boolean;
}) {
  const source = highlightMentions ? linkifyMentions(text || " ") : text || " ";
  return (
    <div className={typing ? "markdown caret" : "markdown"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
