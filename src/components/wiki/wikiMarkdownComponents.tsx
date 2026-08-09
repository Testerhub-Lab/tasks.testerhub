import { Children, isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { uniqueWikiHeadingId } from "@/server/knowledge/headings";
import MermaidDiagram from "./MermaidDiagram";

function mermaidSource(children: ReactNode) {
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  if (
    !isValidElement<{
      className?: string;
      children?: ReactNode;
    }>(child) ||
    !child.props.className?.split(" ").includes("language-mermaid")
  ) {
    return null;
  }

  return String(child.props.children ?? "").replace(/\n$/, "");
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

export function createWikiMarkdownComponents(): Components {
  const headingCounts = new Map<string, number>();
  const heading = (Tag: "h1" | "h2" | "h3" | "h4") =>
    function WikiHeading({ children, ...props }: { children?: ReactNode }) {
      const id = uniqueWikiHeadingId(nodeText(children), headingCounts);
      return (
        <Tag {...props} id={id} className="group scroll-mt-24">
          {children}
          <a
            href={`#${id}`}
            className="ml-2 opacity-0 no-underline transition-opacity group-hover:opacity-60 focus:opacity-60"
            aria-label="Скопировать ссылку на раздел"
          >
            #
          </a>
        </Tag>
      );
    };

  return {
    a: ({ children, href, ...props }) => (
      <a
        {...props}
        href={href}
        {...(href?.startsWith("#")
          ? {}
          : { target: "_blank", rel: "noreferrer" })}
      >
        {children}
      </a>
    ),
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    pre: ({ children, ...props }) => {
      const chart = mermaidSource(children);
      if (chart !== null) return <MermaidDiagram chart={chart} />;
      return <pre {...props}>{children}</pre>;
    },
  };
}
