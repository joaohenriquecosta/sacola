// Inline loading spinner. Composes inside buttons next to the label so the
// activity stays adjacent to what triggered it. Uses pure CSS animation, no
// JS heartbeat — cheap to throw on dozens of elements.

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  // Tailwind size token (the default fits beside a body-size text button).
  size?: "sm" | "md";
  label?: string;
};

export function Spinner({ className, size = "sm", label = "Carregando" }: Props) {
  const sizing = size === "sm" ? "size-3.5" : "size-4";
  return (
    <svg
      className={cn("animate-spin", sizing, className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21.5 12a9.5 9.5 0 0 1-9.5 9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
