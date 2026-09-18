import type { ReactNode } from "react";

export default function InfoTip({
  label,
  align = "end",
  children
}: {
  label: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={align === "start" ? "info repo-info repo-info-start" : "info repo-info"}
      aria-label={label}
    >
      <span aria-hidden="true">i</span>
      <span className="info-tip repo-info-tip" role="tooltip">
        {children}
      </span>
    </button>
  );
}
