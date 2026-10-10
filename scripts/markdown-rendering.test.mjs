import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const output=path.resolve(".desktop-cache/markdown-component-test.mjs");
await fs.mkdir(path.dirname(output),{recursive:true});
await build({entryPoints:["frontend/src/message-body.tsx"],outfile:output,bundle:true,platform:"node",format:"esm",packages:"external",jsx:"automatic"});
const {MessageBody}=await import(pathToFileURL(output).href);
const render=text=>renderToStaticMarkup(React.createElement(MessageBody,{text}));
test("Markdown semantic typography, lists, tables, links and code",()=>{
 const html=render("# Title\n\nParagraph with **bold**, *italic* and \`inline\`.\n\n- One\n- Two\n\n1. First\n2. Second\n\n> Quoted\n\n[Docs](https://example.com)\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n\`\`\`typescript\nconst n = 1;\n\`\`\`");
 for(const tag of ["h1","strong","em","ul","ol","blockquote","table","code"])assert.match(html,new RegExp("<"+tag+"(?:>| )"));
 assert.match(html,/Copy code/);assert.match(html,/typescript/);assert.match(html,/rel="noopener noreferrer"/);
});
test("Raw HTML and active elements are discarded",()=>{
 const html=render('<script>globalThis.pwned=true</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://example.com"></iframe>\n\n<svg onload=alert(1)>x</svg>');
 assert.doesNotMatch(html,/<(?:script|img|iframe|svg)\b/i);
 assert.doesNotMatch(html,/\son(?:error|load)=/i);
});
test("Unsafe and local links cannot become navigable; images cannot fetch remotely",()=>{
 const html=render('[x](javascript:alert%281%29)\n\n[x](data:text/html,evil)\n\n[x](file:///C:/private.txt)\n\n[x](//example.com)\n\n![tracker](https://example.com/tracker.png)');
 assert.doesNotMatch(html,/<a\b|<img\b/i);
});
test("Code is escaped and partial streaming fences stay readable",()=>{
 const html=render('~~~html\n<script>alert(1)</script>\n~~~\n\n\`\`\`js\nconst pending =');
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/const pending =/);
});
