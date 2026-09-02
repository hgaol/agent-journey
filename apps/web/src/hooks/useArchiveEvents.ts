import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useArchiveEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    const events = new EventSource("/api/v1/events", { withCredentials: true });
    const refresh = (): void => {
      void Promise.all([
        client.invalidateQueries({ queryKey: ["journeys"] }),
        client.invalidateQueries({ queryKey: ["pending-evidence"] })
      ]);
    };
    events.addEventListener("archive-changed", refresh);
    events.addEventListener("capture-completed", refresh);
    return () => events.close();
  }, [client]);
}
