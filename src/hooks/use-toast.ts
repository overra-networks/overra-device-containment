"use client";

import { useState, useCallback } from "react";

type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

let globalSetToasts: React.Dispatch<React.SetStateAction<ToastItem[]>> | null =
  null;

export function useToastState() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  globalSetToasts = setToasts;

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, dismiss };
}

export function toast(opts: {
  title: string;
  description?: string;
  variant?: ToastVariant;
}) {
  const id = Math.random().toString(36).slice(2);
  if (globalSetToasts) {
    globalSetToasts((prev) => [...prev, { id, ...opts }]);
    setTimeout(() => {
      globalSetToasts?.((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }
}
