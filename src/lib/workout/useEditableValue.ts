import { useCallback, useEffect, useState } from "react";

export type EditableValue = {
  draft: string;
  editing: boolean;
  setDraft: (v: string) => void;
  startEditing: () => void;
  commit: () => void;
  revert: () => void;
};

export function useEditableValue(committed: string, onCommit: (v: string) => void): EditableValue {
  const [draft, setDraft] = useState(committed);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(committed);
  }, [committed, editing]);

  const startEditing = useCallback(() => setEditing(true), []);

  const commit = useCallback(() => {
    setEditing(false);
    onCommit(draft);
  }, [draft, onCommit]);

  const revert = useCallback(() => {
    setDraft(committed);
    setEditing(false);
  }, [committed]);

  return { draft, editing, setDraft, startEditing, commit, revert };
}
