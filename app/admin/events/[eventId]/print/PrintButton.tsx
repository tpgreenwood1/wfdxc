"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-[44px] rounded bg-gray-800 px-4 text-white"
    >
      Print
    </button>
  );
}
