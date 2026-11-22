import{i as e,n as t,r as n,t as r}from"./export-page-CnpmGWyB.js";import{t as i}from"./index-IuOdAd_d.js";var a=`/*
 * The document sheet.
 *
 * One stylesheet, three users. The preview at /export/:documentId renders
 * with it, \`htmlExporter\` embeds it verbatim in the file it writes, and the
 * print path — the browser's own, whether it is asked for here or with
 * Ctrl+P — reads the \`@media print\` block at the bottom. A formula that
 * looks different on screen than it does in the downloaded file would be a
 * bug in this file rather than in either renderer, because there is only one
 * set of rules.
 *
 * The sheet carries its shape in attributes (\`data-page-size\`,
 * \`data-theme\`, \`data-font\`, \`data-scale\`) — the same four the exporters
 * write — so a settings change is a re-attribute, not a rebuild.
 */

.pp-document-sheet {
  /* Light: ink on paper, the library's own palette. */
  --pp-bg: #ffffff;
  --pp-ink: #0b3558;
  --pp-muted: #476788;
  --pp-rule: #d4e0ed;
  --pp-fill: #f0f3f8;
  --pp-accent: #006bff;
  --pp-shadow: 0 24px 60px -28px rgb(11 53 88 / 45%);

  width: 210mm;
  min-height: 297mm;
  padding: 16mm;
  box-sizing: border-box;
  background: var(--pp-bg);
  color: var(--pp-ink);
  font-family: 'DM Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15.5px;
  line-height: 1.65;
  box-shadow: var(--pp-shadow);
  /* The preview's own size is set inline with \`zoom\`, because unlike a
     transform it shrinks the space the sheet takes up as well as its
     drawing, so a fitted page leaves no gap. Printing undoes it. */
}

.pp-document-sheet[data-page-size='letter'] {
  width: 215.9mm;
  min-height: 279.4mm;
  padding: 16.51mm;
}

.pp-document-sheet[data-theme='dark'] {
  --pp-bg: #0f172a;
  --pp-ink: #f1f5f9;
  --pp-muted: #94a3b8;
  --pp-rule: #29405e;
  --pp-fill: #16233b;
  --pp-accent: #7fb2ff;
  --pp-shadow: 0 24px 60px -28px rgb(0 0 0 / 60%);
}

.pp-document-sheet[data-font='serif'] {
  font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, ui-serif, serif;
}

.pp-document-sheet[data-font='mono'] {
  font-family: 'DM Mono', ui-monospace, 'SF Mono', Consolas, monospace;
}

.pp-document-sheet[data-scale='compact'] {
  font-size: 14px;
  line-height: 1.55;
}

.pp-document-sheet[data-scale='comfortable'] {
  font-size: 17.5px;
  line-height: 1.75;
}

/* ── Head, metadata, contents ─────────────────────────────────────── */

.pp-sheet-title {
  margin: 0 0 0.5em;
  font-size: 2em;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.015em;
  break-after: avoid;
}

.pp-metadata {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 28px;
  padding: 14px 16px;
  border: 1px solid var(--pp-rule);
  border-radius: 8px;
  background: var(--pp-fill);
  font-size: 0.85em;
}

.pp-meta-row {
  display: contents;
}

.pp-meta-row dt {
  color: var(--pp-muted);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.pp-meta-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.pp-toc {
  margin: 0 0 32px;
  padding: 0 0 20px;
  border-bottom: 1px solid var(--pp-rule);
}

.pp-toc-head {
  margin: 0 0 10px;
  font-size: 1.1em;
  font-weight: 700;
}

.pp-toc ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-toc a {
  color: var(--pp-ink);
  text-decoration: none;
}

.pp-toc a:hover {
  color: var(--pp-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pp-toc-1 {
  margin: 0 0 4px;
  font-size: 0.9em;
}

.pp-toc-2 {
  margin: 0 0 4px;
  padding-left: 20px;
  font-size: 0.85em;
  color: var(--pp-muted);
}

/* ── Turns ────────────────────────────────────────────────────────── */

.pp-turn + .pp-turn {
  margin-top: 28px;
}

.pp-speaker {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--pp-rule);
  break-after: avoid;
}

.pp-speaker-badge {
  padding: 2px 8px;
  border: 1px solid var(--pp-rule);
  border-radius: 999px;
  background: var(--pp-fill);
  color: var(--pp-ink);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.pp-speaker-badge.pp-user {
  border-color: var(--pp-accent);
  color: var(--pp-accent);
}

.pp-timestamp {
  color: var(--pp-muted);
  font-size: 0.78em;
}

/* ── Blocks ───────────────────────────────────────────────────────── */

.pp-document-sheet p,
.pp-document-sheet ul,
.pp-document-sheet ol,
.pp-document-sheet blockquote,
.pp-document-sheet pre,
.pp-document-sheet table {
  margin: 0 0 14px;
}

.pp-paragraph {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pp-source {
  font-family: 'DM Mono', ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.88em;
  color: var(--pp-muted);
}

.pp-heading {
  margin: 22px 0 10px;
  font-weight: 700;
  line-height: 1.25;
  break-after: avoid;
}

h1.pp-heading {
  font-size: 1.5em;
}

h2.pp-heading {
  font-size: 1.3em;
}

h3.pp-heading {
  font-size: 1.15em;
}

h4.pp-heading,
h5.pp-heading,
h6.pp-heading {
  font-size: 1em;
}

/* Named rather than inherited: the app's reset takes list markers away, and
   the standalone file has no reset at all. Saying it here is what makes the
   preview and the exported page show the same bullets and the same numbers. */
ul.pp-list {
  margin: 0;
  padding-left: 26px;
  list-style: disc;
}

ol.pp-list {
  margin: 0;
  padding-left: 26px;
  list-style: decimal;
}

.pp-list li {
  margin: 0 0 6px;
  white-space: pre-wrap;
}

.pp-quote {
  padding: 2px 0 2px 16px;
  border-left: 3px solid var(--pp-accent);
  color: var(--pp-muted);
  white-space: pre-wrap;
}

.pp-code-figure {
  margin: 0 0 16px;
  break-inside: avoid;
}

.pp-code {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid var(--pp-rule);
  border-radius: 8px;
  background: var(--pp-fill);
  color: var(--pp-ink);
  font-family: 'DM Mono', ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.85em;
  line-height: 1.55;
  white-space: pre;
  tab-size: 4;
}

.pp-code[data-language] {
  border-top-width: 2px;
  border-top-color: var(--pp-accent);
}

.pp-code-caption {
  margin-top: 6px;
  color: var(--pp-muted);
  font-size: 0.78em;
  font-style: italic;
}

.pp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  break-inside: avoid;
}

.pp-table caption {
  padding-bottom: 8px;
  color: var(--pp-muted);
  font-size: 0.88em;
  font-style: italic;
  text-align: left;
}

.pp-table th,
.pp-table td {
  padding: 7px 10px;
  border: 1px solid var(--pp-rule);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.pp-table th {
  background: var(--pp-fill);
  font-weight: 700;
}

.pp-math {
  margin: 0 0 14px;
  overflow-x: auto;
  overflow-y: hidden;
  break-inside: avoid;
}

.pp-math .katex-display {
  margin: 8px 0;
}

.pp-math-raw {
  padding: 10px 14px;
  border: 1px dashed var(--pp-rule);
  border-radius: 8px;
  background: var(--pp-fill);
  font-family: 'DM Mono', ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
}

.pp-link {
  color: var(--pp-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pp-href {
  font-family: 'DM Mono', ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.85em;
  color: var(--pp-muted);
  overflow-wrap: anywhere;
}

.pp-figure {
  margin: 0 0 14px;
  break-inside: avoid;
}

.pp-image {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--pp-rule);
  border-radius: 8px;
}

.pp-badge {
  padding: 2px 8px;
  border: 1px solid var(--pp-rule);
  border-radius: 999px;
  background: var(--pp-fill);
  color: var(--pp-muted);
  font-size: 0.8em;
  font-weight: 600;
}

/* An attachment, or an element nothing on this browser can draw: named,
   never left out. */
.pp-callout {
  padding: 10px 14px;
  border: 1px solid var(--pp-rule);
  border-left: 3px solid var(--pp-muted);
  border-radius: 8px;
  background: var(--pp-fill);
  break-inside: avoid;
}

.pp-callout-kept {
  border-left-color: var(--pp-accent);
  border-style: dashed;
}

.pp-callout-label {
  margin: 0 0 2px;
  color: var(--pp-muted);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.pp-callout-body {
  margin: 0;
  overflow-wrap: anywhere;
}

.pp-callout-note {
  margin: 4px 0 0;
  color: var(--pp-muted);
  font-size: 0.85em;
  font-style: italic;
}

.pp-preservation {
  margin: 28px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--pp-rule);
  color: var(--pp-muted);
  font-size: 0.82em;
  font-style: italic;
}

.pp-sheet-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid var(--pp-rule);
  color: var(--pp-muted);
  font-size: 0.78em;
}

/* ── Printing ─────────────────────────────────────────────────────── */

@media print {
  html,
  body {
    overflow: visible;
    background: #fff;
  }

  /* Only in the studio: printing /documents or the landing page keeps the
     chrome it always had. */
  body:has(.pp-document-sheet) .pp-chrome {
    display: none !important;
  }

  body:has(.pp-document-sheet) .pp-print-root {
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
  }

  .pp-document-sheet {
    width: auto !important;
    min-height: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    transform: none !important;
    zoom: 1 !important;
    /* The chosen theme is a reading choice; paper keeps its own ink. */
    background: #fff !important;
    color: #0b3558 !important;
    font-size: 11.5pt;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .pp-code,
  .pp-table,
  .pp-callout,
  .pp-math,
  .pp-figure {
    break-inside: avoid;
  }

  /* On screen a long line of code scrolls; paper has no scrollbars, so the
     line wraps instead of running off the edge of the page. */
  .pp-code {
    overflow-x: visible;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .pp-sheet-title,
  .pp-heading,
  .pp-speaker {
    break-after: avoid;
  }
}

`,o=`
html { background: #eef2f7; }
body { margin: 0; padding: 24px 12px 48px; }
.pp-file-sheet { margin: 0 auto; }
@media print {
  html, body { background: #fff; padding: 0; }
  .pp-file-sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; }
}
`,s=async(s,c)=>{let{standaloneKatexCss:l}=await i(async()=>{let{standaloneKatexCss:e}=await import(`./katexStandalone-WgvGnls-.js`);return{standaloneKatexCss:e}},[]),u=new Date,d=[`<!doctype html>`,`<html lang="en">`,`<head>`,`<meta charset="utf-8" />`,`<meta name="viewport" content="width=device-width, initial-scale=1" />`,`<title>${r(s.title)}</title>`,`<style>`,a.trim(),`</style>`,`<style>`,l(),`</style>`,`<style>`,o,e[c.pageSize],`</style>`,`</head>`,`<body>`,`<main class="pp-document-sheet pp-file-sheet" ${t(c)}>`,n(s,c,u),`</main>`,`</body>`,`</html>`].join(`
`);return new Blob([d],{type:`text/html;charset=utf-8`})};export{s as htmlExporter};