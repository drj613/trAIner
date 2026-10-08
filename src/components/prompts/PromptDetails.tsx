import { createElement, type ElementType, type ReactNode } from "react";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function PromptDetails({ text, paragraphLabels = [] }: { text: string; paragraphLabels?: readonly string[] }) {
  const xml = parseXmlFragment(text);
  const content = xml ? renderXmlNodes(xml) : renderTextBlocks(text, paragraphLabels);
  return <div className="stack min-w-0" style={{ gap: 12, minWidth: 0, overflowWrap: "anywhere" }}>{content}</div>;
}

function renderTextBlocks(text: string, paragraphLabels: readonly string[]): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listTitle: string | undefined;
  let listOrdered = false;
  let omittedFirstSectionHeading = false;
  let paragraphIndex = 0;

  const flushParagraph = () => {
    const value = paragraph.join(" ").trim();
    if (value) {
      const label = paragraphLabels[paragraphIndex++];
      blocks.push(label
        ? <section key={`p-${blocks.length}`} className="stack min-w-0" style={{ gap: 4, minWidth: 0 }}>
            <h3 style={subheadingStyle}>{inlineText(label)}</h3>
            <p style={paragraphStyle}>{inlineText(value)}</p>
          </section>
        : <p key={`p-${blocks.length}`} style={paragraphStyle}>{inlineText(value)}</p>);
    }
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) {
      const Tag = listOrdered ? "ol" : "ul";
      blocks.push(
        <section key={`list-${blocks.length}`} className="stack min-w-0" style={{ gap: 4, minWidth: 0 }}>
          {listTitle && <h3 style={subheadingStyle}>{inlineText(listTitle)}</h3>}
          <Tag style={listStyle} aria-label={listTitle || undefined}>
            {listItems.map((item, index) => <li key={index}>{inlineText(item)}</li>)}
          </Tag>
        </section>,
      );
    }
    listItems = [];
    listTitle = undefined;
    listOrdered = false;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) { flushParagraph(); flushList(); continue; }

    const fence = line.match(/^```(json)?\s*$/i);
    if (fence) {
      flushParagraph(); flushList();
      const source: string[] = [];
      while (lineIndex + 1 < lines.length && !/^```\s*$/.test(lines[lineIndex + 1].trim())) {
        source.push(lines[++lineIndex]);
      }
      if (lineIndex + 1 < lines.length) lineIndex += 1;
      if (fence[1]) {
        try {
          const value = JSON.parse(source.join("\n")) as JsonValue;
          blocks.push(renderExample(value, `example-${blocks.length}`));
        } catch {
          blocks.push(<p key={`example-${blocks.length}`} style={paragraphStyle}>{inlineText(source.join(" "))}</p>);
        }
      } else {
        blocks.push(<p key={`example-${blocks.length}`} style={paragraphStyle}>{inlineText(source.join(" "))}</p>);
      }
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      if (heading[1].length === 2 && !omittedFirstSectionHeading) {
        omittedFirstSectionHeading = true;
        continue;
      }
      const depth = Math.min(heading[1].length, 4) + 1;
      blocks.push(renderHeading(depth, heading[2], `h-${blocks.length}`));
      continue;
    }

    const bullet = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (bullet) {
      flushParagraph();
      const ordered = /^\d+[.)]\s+/.test(line);
      if (listItems.length && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      listItems.push(bullet[1]);
      continue;
    }

    if (line.startsWith("{") || line.startsWith("[")) {
      try {
        const value = JSON.parse(line) as JsonValue;
        flushParagraph(); flushList();
        blocks.push(renderExample(value, `example-${blocks.length}`));
        continue;
      } catch {
        // Incomplete JSON-like prose is rendered as ordinary text below.
      }
    }

    const field = line.match(/^([^:]{1,100}):\s*(.*)$/);
    if (field) {
      flushParagraph(); flushList();
      if (!field[2]) {
        listTitle = field[1];
        continue;
      }
      blocks.push(
        <dl key={`field-${blocks.length}`} style={fieldStyle}>
          <dt style={fieldLabelStyle}>{inlineText(field[1])}</dt>
          <dd style={fieldValueStyle}>{inlineText(field[2])}</dd>
        </dl>,
      );
      continue;
    }

    if (listTitle && listItems.length === 0 && /^[-*+]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*+]\s+/, ""));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderExample(value: JsonValue, key: string) {
  return (
    <section key={key} className="stack min-w-0 panel" aria-label="Structured example" style={{ gap: 8, minWidth: 0, padding: 10, overflowWrap: "anywhere" }}>
      <details>
        <summary style={{ ...subheadingStyle, cursor: "pointer" }}>Example routine structure</summary>
        <div className="stack min-w-0" style={{ gap: 8, minWidth: 0, paddingTop: 8 }}>{renderValue(value)}</div>
      </details>
    </section>
  );
}

function parseXmlFragment(text: string): Node[] | null {
  if (typeof DOMParser === "undefined" || !/<[A-Za-z][\w:.-]*(?:\s[^>]*)?>/.test(text)) return null;
  const xmlText = text.replace(/&(?!#\d+;|#x[\da-f]+;|amp;|lt;|gt;|quot;|apos;)/gi, "&amp;");
  const parsed = new DOMParser().parseFromString(`<promptRoot>${xmlText}</promptRoot>`, "application/xml");
  if (parsed.querySelector("parsererror")) return null;
  return Array.from(parsed.documentElement.childNodes)
    .filter((node) => node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())));
}

function renderXmlNodes(nodes: Node[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return <p key={`text-${index}`} style={paragraphStyle}>{node.textContent?.trim()}</p>;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as Element;
    const label = humanize(element.tagName);
    const children = Array.from(element.childNodes)
      .filter((child) => child.nodeType === Node.ELEMENT_NODE || (child.nodeType === Node.TEXT_NODE && Boolean(child.textContent?.trim())));
    const value = element.textContent?.trim() ?? "";
    return children.length
      ? <section className="stack min-w-0" key={`${element.tagName}-${index}`} style={{ gap: 5, minWidth: 0 }}>
          <h3 style={subheadingStyle}>{label}</h3>
          {renderXmlNodes(children)}
        </section>
      : <dl key={`${element.tagName}-${index}`} style={fieldStyle}>
          <dt style={fieldLabelStyle}>{label}</dt>
          <dd style={fieldValueStyle}>{value}</dd>
        </dl>;
  });
}

function renderValue(value: JsonValue): ReactNode {
  if (value === null || typeof value !== "object") return String(value ?? "None");
  if (Array.isArray(value)) return <ul style={nestedListStyle}>{value.map((item, index) => <li key={index}>{renderValue(item)}</li>)}</ul>;
  return <dl className="stack min-w-0" style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, minWidth: 0 }}>{Object.entries(value).map(([key, item]) => (
    <div key={key} className="stack min-w-0" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, minWidth: 0 }}>
      <dt style={fieldLabelStyle}>{humanize(key)}</dt>
      <dd style={fieldValueStyle}>{renderValue(item)}</dd>
    </div>
  ))}</dl>;
}

function renderHeading(depth: number, text: string, key: string) {
  const Tag = `h${depth}` as ElementType;
  return createElement(Tag, { key, style: headingStyle }, inlineText(text));
}

function inlineText(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*(.*?)\*/g, "$1");
}

function humanize(text: string) {
  return text.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase());
}

const headingStyle = { margin: 0, fontSize: 14, fontWeight: 650, color: "var(--fg)" } as const;
const subheadingStyle = { margin: 0, fontSize: 12, fontWeight: 600, color: "var(--fg-2)" } as const;
const paragraphStyle = { margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg-2)", overflowWrap: "anywhere" as const };
const listStyle = { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.5, color: "var(--fg-2)", overflowWrap: "anywhere" as const };
const fieldStyle = { margin: 0, display: "grid", gridTemplateColumns: "minmax(0, 0.4fr) minmax(0, 1fr)", gap: "4px 8px", fontSize: 13, minWidth: 0 } as const;
const nestedListStyle = { margin: 0, paddingLeft: 12, fontSize: 13, lineHeight: 1.5, color: "var(--fg-2)", overflowWrap: "anywhere" as const };
const fieldLabelStyle = { fontWeight: 600, color: "var(--fg-3)", overflowWrap: "anywhere" as const };
const fieldValueStyle = { margin: 0, color: "var(--fg-2)", minWidth: 0, overflowWrap: "anywhere" as const };
