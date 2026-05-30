import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50",
        variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-700",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
