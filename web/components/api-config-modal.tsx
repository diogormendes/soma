"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";

export function ApiConfigModal({ platform, isConfigured }: { platform: string, isConfigured?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ id: "", secret: "" });
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    const res = await fetch("/api/settings");
    const d = await res.json();
    if (platform === "strava") setData({ id: d.stravaId || "", secret: d.stravaSecret || "" });
    if (platform === "spotify") setData({ id: d.spotifyId || "", secret: d.spotifySecret || "" });
  };

  const saveConfig = async () => {
    setLoading(true);
    const payload: any = {};
    if (platform === "strava") { payload.stravaId = data.id; payload.stravaSecret = data.secret; }
    if (platform === "spotify") { payload.spotifyId = data.id; payload.spotifySecret = data.secret; }
    
    await fetch("/api/settings", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" }});
    toast.success("Saved! You can now connect your account.");
    setOpen(false);
    setLoading(false);
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchConfig(); }}>
      <DialogTrigger asChild>
        <Button variant={isConfigured ? "outline" : "default"} size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" /> API Config
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">{platform} API Config</DialogTitle>
          <DialogDescription>
            {platform === "strava" && "Enter your Strava Developer App credentials."}
            {platform === "spotify" && "Enter your Spotify Developer App credentials."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input value={data.id} onChange={e => setData({...data, id: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input type="password" value={data.secret} onChange={e => setData({...data, secret: e.target.value})} placeholder="********" />
          </div>
          <Button onClick={saveConfig} disabled={loading} className="w-full">Save Configuration</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
