import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

export default function App() {
  const [mermaidCode, setMermaidCode] = useState(`
    graph TD
      A-->B
      A-->C
      B-->D
      C-->D
  `);

  return (
    <div style={{ padding: 20 }}>
      <h1>Mermaid Diagram in React</h1>
      <textarea
        rows={8}
        cols={50}
        value={mermaidCode}
        onChange={(e) => setMermaidCode(e.target.value)}
        style={{ marginBottom: 20 }}
      />
      <MermaidChart chart={mermaidCode} />
    </div>
  );
}

const MermaidChart = ({ chart }) => {
  const chartRef = useRef(null);
  // Generate unique id per component instance (on mount)
  const [id] = useState(() => "mermaidChart_" + Math.floor(Math.random() * 10000));

  useEffect(() => {
    if (!chartRef.current) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
    });

    // Parse first to check syntax
    try {
      mermaid.parse(chart);
    } catch (e) {
      chartRef.current.innerHTML = `<pre style="color: red;">${e.str || e.message}</pre>`;
      return;
    }

    // Render Mermaid to SVG string and inject
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        chartRef.current.innerHTML = svg;
      })
      .catch((error) => {
        chartRef.current.innerHTML = `<pre style="color: red;">${error.message}</pre>`;
      });
  }, [chart, id]);

  return <div ref={chartRef} />;
};
