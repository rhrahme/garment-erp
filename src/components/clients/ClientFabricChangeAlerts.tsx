"use client";

import { useEffect, useState } from "react";
import { FabricChangeAlertsPanelClient } from "@/components/dashboard/FabricChangeAlertsPanelClient";
import type {
  FabricChangeAlert,
  FabricChangeAlertRole,
} from "@/lib/types/fabric-change-alerts";

type ClientFabricChangeAlertsProps = {
  clientId: string;
};

export function ClientFabricChangeAlerts({ clientId }: ClientFabricChangeAlertsProps) {
  const [alerts, setAlerts] = useState<FabricChangeAlert[] | null>(null);
  const [role, setRole] = useState<FabricChangeAlertRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = clientId.trim();
    if (!trimmed || trimmed.startsWith("new-")) {
      setAlerts([]);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/fabric-change-alerts?client_id=${encodeURIComponent(trimmed)}&outstanding=1`
        );
        if (!res.ok) {
          if (!cancelled) setAlerts([]);
          return;
        }
        const data = (await res.json()) as {
          alerts?: FabricChangeAlert[];
          role?: FabricChangeAlertRole;
        };
        if (!cancelled) {
          setAlerts(data.alerts ?? []);
          setRole(data.role ?? null);
        }
      } catch {
        if (!cancelled) setAlerts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!alerts || alerts.length === 0 || !role) {
    return null;
  }

  return (
    <FabricChangeAlertsPanelClient
      initialAlerts={alerts}
      role={role}
      compact
      title="Fabric changes on this client's orders - reprint stickers & A4"
    />
  );
}
