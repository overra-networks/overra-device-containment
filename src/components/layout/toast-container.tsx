"use client";

import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from "@/components/ui/toast";
import { useToastState } from "@/hooks/use-toast";

export function ToastContainer() {
  const { toasts, dismiss } = useToastState();

  return (
    <ToastProvider>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant} open onOpenChange={() => dismiss(t.id)}>
          <div className="flex-1">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && (
              <ToastDescription>{t.description}</ToastDescription>
            )}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
