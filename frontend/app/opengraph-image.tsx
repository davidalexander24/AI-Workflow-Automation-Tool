import { ImageResponse } from "next/og";

export const alt = "AI Workflow Automation Tool: prompt templates run across LLM providers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered at build time into the preview card shown when the site is shared.
// Mirrors the app's terminal look (dark theme tokens from globals.css).
export default function OpengraphImage() {
  const line = (prompt: string, text: string, color = "#a3a3a3") => (
    <div style={{ display: "flex", fontSize: 30, color }}>
      <span style={{ color: "#16a34a", marginRight: 18 }}>{prompt}</span>
      {text}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          padding: "72px 80px",
          fontFamily: "monospace",
          border: "2px solid rgba(245,245,244,0.12)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#525252" }}>
            AI/WFA:~$ workflow runner
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              color: "#f5f5f4",
              lineHeight: 1.1,
            }}
          >
            AI Workflow Automation Tool
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {line(">", "Summarize {{document}} for {{audience}}")}
          {line(">", "run across Gemini, gpt-oss, Qwen, Nemotron, Cohere")}
          {line("[OK]", "retries, provider fallback, every run logged", "#22c55e")}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#525252" }}>
          Next.js · NestJS · Prisma · PostgreSQL · Docker
        </div>
      </div>
    ),
    size,
  );
}
