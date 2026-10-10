export function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
export async function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Cancelled"));
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve()
      .then(() => {
        checkAbort(signal);
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}
