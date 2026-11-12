/** How long the object URL lives after the click; the browser has started the download by then. */
const REVOKE_AFTER_MS = 250;

/** Saves `data` as a pretty-printed JSON file on the coach's device. Nothing is sent anywhere. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_AFTER_MS);
}
