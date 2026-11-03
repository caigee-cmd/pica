import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChildDragChrome } from "@/components/ChildDragChrome";
import { useResolvedDark } from "@/hooks/useResolvedDark";
import { isTauri } from "@/lib/platform";
import { SettingsView } from "@/modules/settings/SettingsView";
import { useConnection } from "@/stores/connection";

/**
 * Preferences-style shell for `?window=settings`.
 * Hydrates keyring; Save uses HTTP-only connect (no second WS).
 * macOS: slim ChildDragChrome for Overlay drag; Win/Linux: native title bar only.
 */
export function SettingsWindowApp() {
  const dark = useResolvedDark();
  const hydrateConfig = useConnection((s) => s.hydrateConfig);

  useEffect(() => {
    void hydrateConfig().catch(() => {
      /* SettingsView still usable; secretsReady flips in store catch */
    });
  }, [hydrateConfig]);

  const close = () => {
    if (!isTauri) return;
    void getCurrentWindow().close();
  };

  return (
    <div className={dark ? "dark h-full" : "h-full"}>
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <ChildDragChrome title="设置" />
        <div className="min-h-0 flex-1">
          <SettingsView onClose={close} httpOnly standalone />
        </div>
      </div>
    </div>
  );
}
