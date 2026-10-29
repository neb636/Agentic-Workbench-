import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Code surfaces stay dark inside the light chrome; every color is a theme token. */
export const codeTheme = [
  EditorView.theme({
    "&": { color: "var(--wb-code-fg)", backgroundColor: "var(--wb-code-bg)", height: "100%", fontSize: "12.5px" },
    ".cm-scroller": { fontFamily: "var(--wb-font-mono)", lineHeight: "1.65" },
    ".cm-content": { caretColor: "var(--wb-code-cursor)", padding: "10px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--wb-code-cursor)" },
    ".cm-gutters": { backgroundColor: "var(--wb-code-bg)", color: "var(--wb-code-gutter)", border: "none", paddingLeft: "8px" },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px", paddingRight: "14px" },
    ".cm-activeLine": { backgroundColor: "var(--wb-code-active-line)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--wb-code-fg)" },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--wb-code-selection)" },
  }, { dark: true }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: "var(--wb-code-keyword)" },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--wb-code-string)" },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--wb-code-comment)", fontStyle: "italic" },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--wb-code-number)" },
    { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--wb-code-type)" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: "var(--wb-code-function)" },
    { tag: [tags.propertyName, tags.attributeName], color: "var(--wb-code-property)" },
    { tag: [tags.meta, tags.annotation, tags.processingInstruction], color: "var(--wb-code-meta)" },
    { tag: [tags.heading, tags.strong], color: "var(--wb-code-keyword)", fontWeight: "600" },
    { tag: tags.link, color: "var(--wb-code-function)", textDecoration: "underline" },
  ])),
];
