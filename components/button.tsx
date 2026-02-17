import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

function classesForVariant(variant: ButtonVariant): string {
  if (variant === "primary") {
    return "bg-primary text-white hover:bg-primary-hover";
  }
  if (variant === "secondary") {
    return "bg-secondary text-white hover:bg-secondary-hover";
  }
  return "bg-transparent text-anchor hover:bg-soft-accent";
}

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-soft-accent/70 disabled:opacity-50 ${classesForVariant(
        variant
      )} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
