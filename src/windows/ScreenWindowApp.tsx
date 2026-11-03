import { useEffect, useState } from "react";
import { ChildDragChrome } from "@/components/ChildDragChrome";
import { useResolvedDark } from "@/hooks/useResolvedDark";
import { isConfigured } from "@/lib/config";
import { ScreenPanel } from "@/modules/screen/ScreenPanel";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";

/**
 * Slim shell for `?window=screen&botId=…`.
 * Hydrates config + HTTP client only (no WS). Loads computer for the bot.
 * macOS: ChildDragChrome Overlay drag; Win/Linux: native title bar.
 */
export function ScreenWindowApp({ botId }: { botId: string }) {
  const dark = useResolvedDark();
  const hydrateConfig = useConnection((s) => s.hydrateConfig);
  const connectHttpOnly = useConnection((s) => s.connectHttpOnly);
  const loadComputer = useWorkspace((s) => s.loadComputer);
  const [readyError, setReadyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await hydrateConfig();
        if (cancelled) return;
        if (!isConfigured(config)) {
          setReadyError("Gateway is not configured. Open Settings in the main window.");
          return;
        }
        await connectHttpOnly();
        if (cancelled) return;
        // Minimal DM selection so ScreenPanel resolves botId.
        useWorkspace.setState({
          selection: { kind: "dm", botId, threadId: `popout:${botId}` },
          panel: "computer",
          computer: null,
        });
        await loadComputer(botId);
      } catch (err) {
        if (!cancelled) {
          setReadyError(err instanceof Error ? err.message : "Failed to load computer.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [botId, hydrateConfig, connectHttpOnly, loadComputer]);

  return (
    <div className={dark ? "dark h-full" : "h-full"}>
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <ChildDragChrome title="Computer" />
        {readyError ? (
          <p className="px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{readyError}</p>
        ) : null}
        <div className="min-h-0 flex-1">
          <ScreenPanel variant="window" showPopOut={false} />
        </div>
      </div>
    </div>
  );
}
