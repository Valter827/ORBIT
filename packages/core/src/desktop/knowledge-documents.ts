import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { Parser } from "htmlparser2";
import mammoth from "mammoth";
import { structuredChunks, type Passage } from "./knowledge-structure.js";
import { checkSignal } from "../ai/transport.js";
import { redact } from "../security/redactor.js";

function checkDocxArchive(buffer: Buffer) {
  // Bound decompressed input before Mammoth opens the ZIP. ZIP64 is deliberately unsupported.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Invalid DOCX archive.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16),
    total = 0;
  if (count > 2000 || count === 65535 || offset === 0xffffffff) throw new Error("DOCX archive exceeds limits.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Invalid DOCX directory.");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 20_000_000) throw new Error("DOCX expanded size exceeds limits.");
    offset +=
      46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

export async function parseDocument(
  file: string,
  limit: number,
  signal?: AbortSignal,
): Promise<{ text: string; passages: Passage[]; warning: string }> {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let buffer: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error("Document exceeds file limits.");
    const bytes = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < bytes.length) {
      const read = await handle.read(bytes, used, bytes.length - used, null);
      if (!read.bytesRead) break;
      used += read.bytesRead;
    }
    buffer = bytes.subarray(0, used);
  } finally {
    await handle.close();
  }
  checkSignal(signal);
  if (buffer.length > limit) throw new Error("Document exceeds size limit.");
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      disableFontFace: true,
      stopAtErrors: true,
      verbosity: 0,
    });
    const abort = () => {
      void task.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const doc = await task.promise;
      if (doc.numPages > 500) throw new Error("PDF page limit exceeded.");
      const passages: Passage[] = [];
      let characters = 0;
      for (let page = 1; page <= doc.numPages; page++) {
        checkSignal(signal);
        const content = await (await doc.getPage(page)).getTextContent();
        const text = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("");
        characters += text.length;
        if (characters > 2_000_000) throw new Error("Extracted document exceeds size limit.");
        passages.push(
          ...structuredChunks(file, redact(text).text).map((p) => ({ ...p, page, lineStart: 0, lineEnd: 0 })),
        );
      }
      if (!passages.length)
        throw new Error("PDF contains no extractable text. Scanned PDFs require OCR, which is not supported here.");
      return {
        text: passages.map((p) => p.text).join("\n"),
        passages,
        warning: "PDF text extraction; no OCR. Layout and reading order may be approximate.",
      };
    } finally {
      signal?.removeEventListener("abort", abort);
      await task.destroy();
    }
  }
  if (ext !== ".docx") throw new Error("Unsupported structured document.");
  checkDocxArchive(buffer);
  const converted = await mammoth.convertToHtml(
    { buffer },
    {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    },
  );
  checkSignal(signal);
  if (converted.value.length > 4_000_000) throw new Error("Extracted document exceeds size limit.");
  const blocks: string[] = [];
  let text = "",
    heading = 0;
  const flush = () => {
    if (text.trim()) blocks.push((heading ? "#".repeat(heading) + " " : "") + text.trim());
    text = "";
    heading = 0;
  };
  const parser = new Parser(
    {
      onopentag(name) {
        if (/^h[1-6]$/.test(name)) {
          flush();
          heading = Number(name[1]);
        } else if (name === "p" || name === "tr") flush();
        else if (name === "br") text += "\n";
      },
      ontext(value) {
        text += value;
      },
      onclosetag(name) {
        if (/^h[1-6]$/.test(name) || name === "p" || name === "tr") flush();
        else if (name === "td" || name === "th") text += " | ";
      },
    },
    { decodeEntities: true },
  );
  parser.write(converted.value);
  parser.end();
  flush();
  const safe = redact(blocks.join("\n\n")).text;
  if (!safe.trim()) throw new Error("DOCX contains no extractable text.");
  return {
    text: safe,
    passages: structuredChunks("document.md", safe).map((p) => ({ ...p, lineStart: 0, lineEnd: 0 })),
    warning: converted.messages.length
      ? "Some DOCX formatting was not preserved; headings and text were extracted."
      : "",
  };
}
