"use client";

import { useEffect, useRef } from "react";
import { useDeviceStore } from "@/store/device-store";

const MAX_RETRY_DELAY = 30_000; // 30 s

export function useSSE() {
  const { updateDeviceStatus, updateDeviceHeartbeat, prependLog } =
    useDeviceStore();

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    retryDelay.current = 1000;

    function connect() {
      if (!isMounted.current) return;

      const es = new EventSource("/api/events");
      esRef.current = es;

      // Reset backoff once the server confirms the stream is open
      es.addEventListener("connected", () => {
        retryDelay.current = 1000;
      });

      es.addEventListener("device:status_update", (e) => {
        const data = JSON.parse(e.data);
        updateDeviceStatus(data.deviceId, data.status);
      });

      es.addEventListener("device:heartbeat", (e) => {
        const data = JSON.parse(e.data);
        updateDeviceHeartbeat(data.deviceId, data.lastHeartbeat);
      });

      es.addEventListener("log:new_entry", (e) => {
        const data = JSON.parse(e.data);
        prependLog(data);
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!isMounted.current) return;

        // Exponential backoff: 1s → 2s → 4s … capped at 30s
        timerRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_DELAY);
          connect();
        }, retryDelay.current);
      };
    }

    connect();

    return () => {
      isMounted.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
    // Zustand actions are stable singleton refs — intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
