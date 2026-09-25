const STYLES: Record<string, string> = {
  open: "bg-green-100 text-green-800",
  closed: "bg-gray-200 text-gray-700",
  cancelled: "bg-red-100 text-red-700 line-through",
};

const LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
