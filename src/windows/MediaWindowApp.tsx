import { useEffect, useMemo, useState } from "react";
import { ChildDragChrome } from "@/components/ChildDragChrome";
import { useResolvedDark } from "@/hooks/useResolvedDark";
import { isConfigured } from "@/lib/config";
import { gatewayFetch } from "@/lib/transport";
import { useConnection } from "@/stores/connection";

/**
 * Independent media viewer (`?window=media&src=…&title=…`).
 * Prefer gateway-relative paths; blob: URLs do not cross webview windows.
 */
export function MediaWindowApp({
  src: rawSrc,
  title,
}: {
  src: string;
  title?: string;
}) {
  const dark = useResolvedDark();
  const hydrateConfig = useConnection((s) => s.hydrateConfig);
  const connectHttpOnly = useConnection((s) => s.connectHttpOnly);
  const config = useConnection((s) => s.config);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = title?.trim() || "媒体";

  const isHttp = useMemo(
    () => /^https?:\/\//i.test(rawSrc) || rawSrc.startsWith("data:"),
    [rawSrc],
  );

  useEffect(() => {
    let cancelled = false;
    let created = "";
    void (async () => {
      try {
        if (isHttp || rawSrc.startsWith("data:")) {
          if (!cancelled) setObjectUrl(rawSrc);
          return;
        }
        const cfg = await hydrateConfig();
        if (cancelled) return;
        if (!isConfigured(cfg)) {
          setError("未配置网关，无法加载媒体。");
          return;
        }
        await connectHttpOnly();
        if (cancelled) return;
        const path = rawSrc.startsWith("/")
          ? rawSrc
          : new URL(rawSrc, cfg.baseUrl).pathname;
        const res = await gatewayFetch(cfg, path);
        if (!res.ok) {
          setError(`加载失败（HTTP ${res.status}）`);
          return;
        }
        const blob = await res.blob();
        created = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(created);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [rawSrc, isHttp, hydrateConfig, connectHttpOnly, config.baseUrl]);

  return (
    <div className={dark ? "dark h-full" : "h-full"}>
      <div className="flex h-full flex-col bg-black text-zinc-100">
        <ChildDragChrome title={heading} />
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : objectUrl ? (
            <img
              src={objectUrl}
              alt={heading}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="text-sm text-zinc-400">加载中…</p>
          )}
        </div>
      </div>
    </div>
  );
}
