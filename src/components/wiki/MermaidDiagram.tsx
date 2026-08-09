"use client";

import { useEffect, useId, useState } from "react";

let mermaidInitialized = false;

type MermaidDiagramProps = {
  chart: string;
};

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import("mermaid");
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: "dark",
            flowchart: { htmlLabels: false },
          });
          mermaidInitialized = true;
        }

        const diagramId = `wiki-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const rendered = await mermaid.render(diagramId, chart);
        if (!cancelled) {
          setSvg(rendered.svg);
          setError("");
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg("");
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Не удалось построить диаграмму"
          );
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <div className="wiki-mermaid wiki-mermaid--error">
        <p>Ошибка Mermaid: {error}</p>
        <pre>
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="wiki-mermaid wiki-mermaid--loading">
        Строим диаграмму…
      </div>
    );
  }

  return (
    <div
      className="wiki-mermaid"
      role="img"
      aria-label="Диаграмма Mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
