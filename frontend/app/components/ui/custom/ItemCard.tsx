import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ItemCardProps = {
  children: ReactNode;
  className?: string;
};

const ItemCard = ({ children, className }: ItemCardProps) => {
  return <div className={cn("rounded-2xl bg-muted p-2 space-y-2", className)}>{children}</div>;
};

export default ItemCard;
