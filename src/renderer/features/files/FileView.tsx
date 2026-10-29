import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from "@codemirror/view";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { FileContent, FileViewState } from "../../../shared/models";
import { errorMessage } from "../../core/errors";
import type { ViewComponentProps } from "../../core/view-registry";
import { watchWorkspace } from "../../core/workspace-watch";
import { codeTheme } from "./code-theme";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A read-only file view. Views like this have no session: they are only persisted UI state. */
export function FileView({ view }: ViewComponentProps) {
  const { root, path } = (view.state ?? {}) as FileViewState;
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const [file, setFile] = useState<FileContent>();
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    window.workbench.files.read(root, path).then((content) => { if (active) { setFile(content); setError(""); } })
      .catch((e: unknown) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [root, path, revision]);

  useEffect(() => watchWorkspace(root, (event) => {
    if (event.paths.some((changed) => changed === path || changed === "")) setRevision((value) => value + 1);
  }), [root, path]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !file || file.binary) return;
    const editor = new EditorView({
      parent: host,
      state: EditorState.create({ doc: file.content, extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), EditorState.readOnly.of(true),
        codeTheme, language.current.of([]),
        EditorView.updateListener.of((update) => {
          if (!update.selectionSet) return;
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          setCursor({ line: line.number, column: head - line.from + 1 });
        }),
      ] }),
    });
    editorRef.current = editor;
    const description = LanguageDescription.matchFilename(languages, path.split("/").at(-1) ?? path);
    let active = true;
    void description?.load().then((support) => { if (active) editor.dispatch({ effects: language.current.reconfigure(support) }); });
    return () => { active = false; editor.destroy(); editorRef.current = null; };
  }, [file, path]);

  const segments = path.split("/");
  return <section className="file-view" aria-label={`File ${path}`}>
    <div className="code-card">
      <div className="code-breadcrumbs">
        <nav aria-label="File path">{segments.map((segment, index) => <span key={`${segment}-${index}`} className={index === segments.length - 1 ? "is-current" : ""}>{segment}</span>)}</nav>
        <span className="code-badge">Read-only</span>
      </div>
      {error ? <div className="code-message" role="alert">{error}</div>
        : file?.binary ? <div className="code-message">This file looks binary, so it is not shown.</div>
          : <div className="code-editor" ref={hostRef} />}
      <div className="code-footer">
        <span>Ln {cursor.line}, Col {cursor.column} · LF · UTF-8</span>
        <span>{file ? `${formatSize(file.size)}${file.truncated ? " · showing the first 2 MB" : ""}` : "Loading…"}</span>
      </div>
    </div>
  </section>;
}
