/** Rendering for speech only. The original assistant message is unchanged. */
export function speechText(markdown: string): string {
  const ukrainian = /[іїєґ]/i.test(markdown);
  const cyrillic = /[а-я]/i.test(markdown);
  const codeNotice = ukrainian
    ? "Код додано в чат."
    : cyrillic
      ? "Код добавлен в чат."
      : "I've added the code in chat.";
  let code = false;
  let text = markdown.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, () => {
    code = true;
    return " ";
  });
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>)]+/g, (url) => {
      try {
        return new URL(url).hostname;
      } catch {
        return "link";
      }
    })
    .replace(/\[(?:\d+|source[^\]]*|S\d+|K\d+|M\d+)\]/gi, "")
    .replace(/【[^】]+】|[^]+/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/^[ \t]*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*\|?\s*:?-{3,}[^\n]*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (code) text = (text + " " + codeNotice).trim();
  return text.slice(0, 3500);
}
export function shortcutValid(value: string, conflicts: string[] = []): boolean {
  const key = value.toLowerCase().replace(/\s/g, "");
  return (
    /^(ctrl|alt|ctrl\+shift|alt\+shift)\+(space|[a-z])$/.test(key) &&
    !["ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "ctrl+z", "ctrl+s", "ctrl+w", "ctrl+q", "alt+f"].includes(key) &&
    !conflicts.some((v) => v.toLowerCase().replace(/\s/g, "") === key)
  );
}
