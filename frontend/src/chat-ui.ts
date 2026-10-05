// UI preferences contain presentation and opaque conversation IDs, never message text.
export function readPreference(key: string, fallback = "") {
  try {
    return localStorage.getItem("orbit-ui:" + key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem("orbit-ui:" + key, value);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function focusComposer(needsSetup = false) {
  requestAnimationFrame(() => {
    if (document.querySelector('[role="dialog"], .local-setup, [data-block-focus="true"]')) return;
    const element = document.getElementById(needsSetup ? "chat-setup" : "chat-request");
    if (element && element.getClientRects().length) element.focus({ preventScroll: true });
  });
}
export type RecentChat = { id: string; title: string; updated: number };
export function chatGroup(updated: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  return updated >= +today
    ? "Today"
    : updated >= +yesterday
      ? "Yesterday"
      : updated >= +week
        ? "Previous 7 days"
        : "Older";
}
