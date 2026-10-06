"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Unplug, Link as LinkIcon } from "lucide-react";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { ApiConfigModal } from "@/components/api-config-modal";

const platformLabels: Record<string, string> = {
  garmin: "Garmin Connect",
  hevy: "Hevy",
  telegram: "Telegram",
};

interface ConnectionActionsProps {
  platform: string;
  isConnected: boolean;
  connectionType: "oauth" | "sync-service" | "planned";
}

export function ConnectionActions({ platform, isConnected, connectionType }: ConnectionActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${platform}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Failed to disconnect:", await res.text());
      }
      router.refresh();
    } catch (err) {
      console.error("Error disconnecting:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleConnect() {
    if (platform === "strava") {
      window.location.href = "/api/strava/auth";
    }
    if (platform === "spotify") {
      window.location.href = "/api/playlist/spotify/auth";
    }
  }

  if (connectionType === "oauth") {
    if (isConnected) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          disabled={loading}
        >
          <Unplug className="h-4 w-4" />
          {loading ? "Disconnecting..." : "Disconnect"}
        </Button>
      );
    }
    return (
      <div className="flex gap-2">
        <ApiConfigModal platform={platform} />
        <Button variant="outline" size="sm" onClick={handleConnect}>
          <LinkIcon className="h-4 w-4 mr-1" />
          Connect
        </Button>
      </div>
    );
  }

  // Sync-service platforms get a Configure/Settings button
  if (connectionType === "sync-service" && platformLabels[platform]) {
    return (
      <CredentialsDialog
        platform={platform}
        platformLabel={platformLabels[platform]}
        isConfigured={isConnected}
      />
    );
  }

  return null;
}
