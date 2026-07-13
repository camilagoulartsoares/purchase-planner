export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed right-4 bottom-4 z-[60] max-w-sm rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-brown-deep shadow-lg">
      {message}
    </div>
  );
}
