import "server-only";

import sanitizeHtml from "sanitize-html";
import { normalizeDocumentText } from "@/features/documents/document-editor";

const allowedTags = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "div",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

export function sanitizeDocumentContent(value: string) {
  const normalized = normalizeDocumentText(value);
  const source = /<\/?[a-z][\s\S]*>/i.test(normalized) ? normalized : plainTextToHtml(normalized);
  return sanitizeHtml(source, {
    allowedTags,
    allowedAttributes: {
      "*": ["style", "align"],
      td: ["colspan", "rowspan", "style", "align"],
      th: ["colspan", "rowspan", "style", "align"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
        "padding-left": [/^\d+(\.\d+)?(px|em|rem)$/],
      },
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  }).trim();
}

export function documentContentText(value: string) {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}
