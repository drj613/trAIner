import { useLayoutEffect, useRef, useState } from "react";
import { PromptDetails } from "./PromptDetails";

type Field = { label: string; value: string; start: number; end: number };

function personaFields(text: string): Field[] | null {
  if (!/^\s*<coach_persona>[\s\S]*<\/coach_persona>\s*$/.test(text)) return null;
  const fields: Field[] = [];
  let principle = 0;
  for (const match of text.matchAll(/<(philosophy|methodology|principle)>([\s\S]*?)<\/\1>/g)) {
    const label = match[1] === "principle" ? `Principle ${++principle}` : match[1] === "philosophy" ? "Philosophy" : "Methodology";
    const start = match.index + match[1].length + 2;
    fields.push({ label, value: match[2].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"), start, end: start + match[2].length });
  }
  const remainder = text.replace(/<(philosophy|methodology|principle)>[\s\S]*?<\/\1>/g, "").replace(/<\/?(?:coach_persona|programming_principles)>/g, "").trim();
  return fields.length && !remainder ? fields : null;
}

function GrowingInput({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const grow = () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    };
    grow();
    if (typeof ResizeObserver === "undefined") return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      grow();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value]);
  return <label className="block min-w-0 text-sm"><span className="font-semibold">{label}</span><textarea ref={ref} aria-label={label} rows={3} className="input mt-2 w-full min-w-0 text-sm leading-relaxed" style={{ overflow: "hidden", resize: "none", overflowWrap: "anywhere" }} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function PersonaInstructions({ name, text, onChange }: { name: string; text: string; onChange: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState(false);
  const fields = personaFields(text);
  const updateField = (field: Field, value: string) => {
    const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    onChange(text.slice(0, field.start) + escaped + text.slice(field.end));
  };
  return <div className="stack min-w-0 mt-3" style={{ overflowWrap: "anywhere" }}>
    {editing ? fields && !custom ? fields.map((field) => <GrowingInput key={field.label} label={field.label} value={field.value} onChange={(value) => updateField(field, value)} />) : <GrowingInput label={name} value={fields ? "" : text} onChange={onChange} /> : fields ? <>
      {fields.filter((field) => !field.label.startsWith("Principle ")).map((field) => <section key={field.label}><h3 className="text-sm font-semibold">{field.label}</h3><p className="text-sm leading-relaxed muted mt-2 whitespace-pre-wrap">{field.value}</p></section>)}
      <section><h3 className="text-sm font-semibold">Programming principles</h3><ul className="list-disc pl-5 space-y-2 mt-2 text-sm leading-relaxed muted">{fields.filter((field) => field.label.startsWith("Principle ")).map((field) => <li key={field.label} className="whitespace-pre-wrap">{field.value}</li>)}</ul></section>
    </> : <PromptDetails text={text} />}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button text-xs" onClick={() => { setEditing(!editing); setCustom(false); }}>{editing ? "Done editing" : "Edit coach details"}</button>
      {fields && <button type="button" className="button text-xs" onClick={() => { setEditing(true); setCustom(true); }}>Write custom instructions</button>}
    </div>
  </div>;
}
