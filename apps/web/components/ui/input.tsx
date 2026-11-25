import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const title = props.title ?? props["aria-label"] ?? props.placeholder;
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:text-muted-foreground",
        className
      )}
      {...props}
      title={title}
    />
  );
}

export { Input };
