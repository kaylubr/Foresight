import type { ReactNode } from "react";

export default function InfoTip({
  label,
  align = "end",
  className,
  children
}: {
  label: string;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const classes = ["info", className, align === "start" ? "info-start" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} aria-label={label}>
      <span aria-hidden="true">i</span>
      <span className="info-tip" role="tooltip">
        {children}
      </span>
    </button>
  );
}
