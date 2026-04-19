export function jsonResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

const HTML_TAG = /<[^>]+>/g;
const ENTITY = /&(nbsp|amp|lt|gt|quot|#39);/g;

export function summarizeBody(input: string | null | undefined, max = 4000): string {
  if (!input) return "";
  let text = input.replace(HTML_TAG, " ").replace(ENTITY, (_, e) => {
    switch (e) {
      case "nbsp": return " ";
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return "\"";
      case "#39": return "'";
      default: return " ";
    }
  });
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > max) {
    text = text.slice(0, max) + ` …[truncated ${text.length - max} chars]`;
  }
  return text;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
