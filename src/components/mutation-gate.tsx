import type { ReactElement } from "react";
import { cloneElement, isValidElement } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanMutate, useViewAs } from "@/contexts/view-as-context";

type Props = {
  children: ReactElement<{ disabled?: boolean; onClick?: (...args: unknown[]) => void }>;
  /** Override tooltip text when blocked. */
  tooltip?: string;
};

/**
 * Disables its single child (button-like) when admin is impersonating a seller.
 * Shows a tooltip explaining why. Non-impersonation: passes through unchanged.
 */
export function MutationGate({ children, tooltip }: Props) {
  const canMutate = useCanMutate();
  const { viewAsName } = useViewAs();
  if (canMutate || !isValidElement(children)) return children;

  const disabled = cloneElement(children, {
    disabled: true,
    onClick: (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
    },
  });

  const text = tooltip ?? `Read-only — du ser som ${viewAsName ?? "en anden sælger"}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Span needed because disabled buttons don't fire mouse events */}
          <span className="inline-block cursor-not-allowed">{disabled}</span>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
