import { useCallback, useEffect, useRef, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import type { ButtonVariant } from "@astryxdesign/core/Button";

export interface ConfirmationOptions {
  title: string;
  description: string;
  actionLabel: string;
  actionVariant?: ButtonVariant;
  cancelLabel?: string;
}

interface ConfirmationRequest extends ConfirmationOptions {
  id: number;
}

export function useConfirmation(): {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  element: React.ReactNode;
} {
  const [request, setRequest] = useState<ConfirmationRequest>();
  const resolverRef = useRef<((confirmed: boolean) => void) | undefined>(undefined);
  const idRef = useRef(0);

  const settle = useCallback((confirmed: boolean): void => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setRequest(undefined);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions): Promise<boolean> => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest({ ...options, id: ++idRef.current });
    });
  }, []);

  useEffect(() => () => resolverRef.current?.(false), []);

  return {
    confirm,
    element: request ? (
      <AlertDialog
        key={request.id}
        className="agentjourney-astryx-dialog"
        isOpen
        onOpenChange={(isOpen) => { if (!isOpen) settle(false); }}
        title={request.title}
        description={request.description}
        actionLabel={request.actionLabel}
        actionVariant={request.actionVariant ?? "destructive"}
        {...(request.cancelLabel ? { cancelLabel: request.cancelLabel } : {})}
        onAction={() => settle(true)}
      />
    ) : null
  };
}
