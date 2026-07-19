import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "focusable inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-bold transition-colors disabled:opacity-50";
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-black hover:bg-accent-hover",
    secondary: "bg-surface-2 text-white hover:bg-white/10",
    ghost: "bg-white/10 text-white hover:bg-white/20 backdrop-blur",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}
