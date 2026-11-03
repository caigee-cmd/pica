import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "pica-focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-ink)] text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900",
        accent: "bg-[var(--color-accent)] text-white hover:bg-blue-600",
        ghost: "hover:bg-zinc-100 dark:hover:bg-white/8",
        outline:
          "border border-[var(--color-line)] bg-transparent hover:bg-zinc-50 dark:border-white/12 dark:hover:bg-white/6",
        danger: "bg-transparent text-rose-600 hover:bg-rose-500/10",
        send: "rounded-full bg-[var(--color-accent)] text-white shadow-sm transition-opacity hover:bg-blue-600",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-3",
        icon: "size-8",
        send: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
>(function Button({ className, variant, size, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
