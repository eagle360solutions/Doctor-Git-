import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif'
});

export function MermaidChart({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && chart) {
      mermaid.render(`mermaid-${Math.random().toString(36).substr(2, 9)}`, chart)
        .then(({ svg }) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch((error) => {
          console.error("Mermaid parsing error:", error);
          if (containerRef.current) {
            containerRef.current.innerHTML = `<p class="text-red-500 text-sm">Error rendering chart: ${error.message}</p>`;
          }
        });
    }
  }, [chart]);

  return <div ref={containerRef} className="flex justify-center w-full overflow-x-auto py-6" />;
}
