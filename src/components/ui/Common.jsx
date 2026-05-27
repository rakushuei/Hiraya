import { cn } from "../../lib/utils";
import React from "react";

export const Button = React.forwardRef(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20",
      secondary: "bg-navy text-white hover:bg-navy/90",
      outline: "border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-900",
      ghost: "bg-transparent hover:bg-slate-100 text-slate-900",
    };

    const sizes = {
      sm: "h-9 px-4 text-xs rounded-lg",
      md: "h-11 px-6 text-sm font-bold uppercase tracking-wider rounded-xl",
      lg: "h-14 px-10 text-base font-bold rounded-2xl",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

export const Badge = ({ children, className, variant = "default" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    warning: "bg-orange-50 text-orange-700 border-orange-100",
    error: "bg-red-50 text-red-700 border-red-100",
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors", variants[variant], className)}>
      {children}
    </span>
  );
};
