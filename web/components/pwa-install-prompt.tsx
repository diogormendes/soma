"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { X, Download, Share, Apple, Smartphone } from "lucide-react";
import { detectMobileBrowser } from "@/lib/mobile-browser";

/** GitHub releases host the sideloadable native builds (widgets need native). */
const RELEASES_URL = "https://github.com/drkostas/soma/releases/latest";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the card is worth showing: a mobile browser, not already installed, not dismissed
 *  in the last two weeks. Called as both the subscribe-less snapshot and the server snapshot. */
function readEligible(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return false;
  // @ts-expect-error - iOS standalone check
  if (window.navigator.standalone === true) return false;
  // Mobile browsers only (#709). On a laptop this is noise, and at phone widths it sat on top
  // of the Close Day button.
  if (!detectMobileBrowser()) return false;
  const dismissedAt = localStorage.getItem("pwa-install-dismissed");
  if (dismissedAt && (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24) < 14) return false;
  return true;
}

/** iOS Safari, which has no beforeinstallprompt and needs the share-sheet hint. */
function readIsIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari =
    /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);
  return isIOS && isSafari;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  // iOS Safari has no beforeinstallprompt; the share-sheet hint is derived from the user agent
  // (an external value) rather than copied into state by an effect.
  const showIOSHint = useSyncExternalStore(() => () => {}, readIsIOSSafari, () => false);
  // Whether this browser should see the card at all is an external value (display mode, user
  // agent, the dismissal stamp), read through useSyncExternalStore instead of copied into state
  // by an effect (soma#958). The server snapshot is "not eligible", so nothing renders until
  // the client has decided. A dismissal in this session wins.
  const eligible = useSyncExternalStore(() => () => {}, readEligible, () => false);
  const [dismissedNow, setDismissed] = useState(false);
  const dismissed = dismissedNow || !eligible;

  useEffect(() => {
    if (!eligible) return;

    // Chromium: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [eligible]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
  }, []);

  if (dismissed) return null;

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-bottom-4 fade-in-0 duration-300"
      data-testid="pwa-install-prompt"
    >
      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/20 p-4 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Download className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Install Soma</p>
          {showIOSHint ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {isIOS ? (
                <>
                  Tap <Share className="inline h-3 w-3 -mt-0.5" /> then{" "}
                  <span className="font-medium text-foreground">
                    &quot;Add to Home Screen&quot;
                  </span>
                </>
              ) : (
                <>
                  File &rarr;{" "}
                  <span className="font-medium text-foreground">
                    &quot;Add to Dock&quot;
                  </span>{" "}
                  to install
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for quick access
            </p>
          )}
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-2 text-xs font-medium bg-emerald-500 text-zinc-950 px-3 py-1.5 rounded-md hover:bg-emerald-400 transition-colors"
            >
              Install
            </button>
          )}
          {/* Native app (home-screen widgets need a real native build). */}
          <div className="mt-2.5 pt-2.5 border-t border-border/60">
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Or get the native app for home-screen widgets:
            </p>
            <div className="flex gap-2">
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-accent/60 text-foreground px-2.5 py-1 rounded-md hover:bg-accent transition-colors"
              >
                <Apple className="h-3 w-3" /> iOS (IPA)
              </a>
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-accent/60 text-foreground px-2.5 py-1 rounded-md hover:bg-accent transition-colors"
              >
                <Smartphone className="h-3 w-3" /> Android (APK)
              </a>
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
