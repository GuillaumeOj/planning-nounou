import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/src/lib/utils"

// Badge (brand guide p.7/p.10): a 22px pill, 10px/2px padding, 12px/600 text,
// 12px icon with 6px gap. Two families of variant:
//  - status (success / warning / destructive): a real contract status, always
//    paired with an icon + label — never colour alone (use <StatusBadge>).
//  - tag (secondary / outline): neutral classification (type of care, hours),
//    implies no action or alert.
const badgeVariants = cva(
  "group/badge inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

// StatusBadge encodes the guide's non-negotiable rule: a status is never colour
// alone. It always renders an icon *and* a label, so the meaning survives for
// colour-blind users and greyscale. `icon` is a Lucide component.
function StatusBadge({
  icon: Icon,
  variant = "success",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  }) {
  return (
    <Badge variant={variant} className={className} {...props}>
      <Icon aria-hidden={true} />
      {children}
    </Badge>
  )
}

export { Badge, StatusBadge, badgeVariants }
