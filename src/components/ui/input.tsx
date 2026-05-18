import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-[#DDE3EA] bg-[#FFFFFF] px-3 py-2 text-sm text-[#0E1C29] placeholder:text-[#8A9BAB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E1C29] focus-visible:border-[#0E1C29] disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
