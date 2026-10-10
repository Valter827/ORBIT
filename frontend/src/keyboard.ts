export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  shortcut: string,
) {
  if (!shortcut) return false;
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop();
  return (
    event.key.toLowerCase() === key &&
    event.ctrlKey === parts.includes("ctrl") &&
    event.altKey === parts.includes("alt") &&
    event.shiftKey === parts.includes("shift") &&
    event.metaKey === parts.includes("meta")
  );
}
