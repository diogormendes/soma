"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [data, setData] = useState({
    stravaId: "", stravaSecret: "", spotifyId: "", spotifySecret: ""
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setData({
          stravaId: d.stravaId || "",
          stravaSecret: d.stravaSecret || "",
          spotifyId: d.spotifyId || "",
          spotifySecret: d.spotifySecret || "",
        });
        setLoading(false);
      });
  }, []);

  async function save() {
    setLoading(true);
    await fetch("/api/settings", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" }
    });
    toast.success("Settings saved successfully!");
    setLoading(false);
  }

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Global Settings</h1>
      <p className="text-muted-foreground">
        Configure API keys for external platforms here. These override the environment variables.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Strava API</CardTitle>
          <CardDescription>
            Go to <a href="https://www.strava.com/settings/api" target="_blank" className="text-primary hover:underline">Strava API Settings</a> and create an app.
            Set the <b>Authorization Callback Domain</b> to exactly your IP or Domain (e.g., 192.168.1.100).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input value={data.stravaId} onChange={e => setData({...data, stravaId: e.target.value})} placeholder="e.g. 123456" />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input type="password" value={data.stravaSecret} onChange={e => setData({...data, stravaSecret: e.target.value})} placeholder="********" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spotify API</CardTitle>
          <CardDescription>
            Go to <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-primary hover:underline">Spotify Developer</a> and create an app.
            Set the <b>Redirect URI</b> exactly to <code>{typeof window !== "undefined" ? window.location.origin : "http://localhost:3456"}/api/playlist/spotify/callback</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input value={data.spotifyId} onChange={e => setData({...data, spotifyId: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input type="password" value={data.spotifySecret} onChange={e => setData({...data, spotifySecret: e.target.value})} placeholder="********" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={loading} size="lg">Save Settings</Button>
    </div>
  );
}
