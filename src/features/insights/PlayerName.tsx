/** Shirt number and label: a child is never shown as anything more than these. */
export function PlayerName({ shirt, label }: { readonly shirt: number; readonly label: string }) {
  return (
    <span>
      <span className="tabular-nums text-ink-soft">#{shirt}</span> {label}
    </span>
  );
}
