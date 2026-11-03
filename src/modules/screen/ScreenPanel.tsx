import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  SidePanelBanner,
  SidePanelChrome,
  SidePanelIconButton,
} from "@/components/SidePanelChrome";
import { absoluteUrl } from "@/lib/config";
import { isTauri } from "@/lib/platform";
import { openScreenWindow } from "@/lib/windows";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";

/**
 * BoardUI-like "bot computer" card.
 * Embeds computer.screenUrl in an iframe when present. Sealed /novnc/session/…
 * URLs often carry capability in the path; otherwise we sync Better Auth cookies
 * from the Rust jar into this webview so the iframe can authenticate.
 */
export function ScreenPanel({
  variant = "rail",
  showPopOut = true,
}: {
  /** `window` fills the OS pop-out; `rail` is the main right column. */
  variant?: "rail" | "window";
  showPopOut?: boolean;
} = {}) {
  const computer = useWorkspace((s) => s.computer);
  const loading = useWorkspace((s) => s.computerLoading);
  const selection = useWorkspace((s) => s.selection);
  const loadComputer = useWorkspace((s) => s.loadComputer);
  const client = useConnection((s) => s.client);
  const config = useConnection((s) => s.config);
  const botId = selection?.kind === "dm" ? selection.botId : null;
  const [busy, setBusy] = useState<
    | "boot"
    | "stop"
    | "refresh"
    | "popout"
    | "takeover"
    | "release"
    | "recover"
    | "reset"
    | "files"
    | "readFile"
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filesPath, setFilesPath] = useState("/");
  const [files, setFiles] = useState<{ path: string; kind: string; size?: number }[]>([]);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [embedNote, setEmbedNote] = useState<string | null>(null);
  const [cookieReady, setCookieReady] = useState(false);
  const wide = variant === "window";

  const running = Boolean(computer?.running);
  const screen = computer?.screen;
  const screenHref =
    screen?.url && config.baseUrl
      ? screen.url.startsWith("http")
        ? screen.url
        : absoluteUrl(config.baseUrl, screen.url)
      : null;
  const vncHref =
    computer?.vncUrl && config.baseUrl
      ? computer.vncUrl.startsWith("http")
        ? computer.vncUrl
        : absoluteUrl(config.baseUrl, computer.vncUrl)
      : null;
  const openHref = screenHref ?? vncHref;

  useEffect(() => {
    let cancelled = false;
    setCookieReady(false);
    setEmbedNote(null);
    if (!openHref || !isTauri) {
      setCookieReady(Boolean(openHref));
      return;
    }
    void (async () => {
      try {
        const label = getCurrentWindow().label;
        const n = await invoke<number>("gateway_inject_session_cookies", {
          windowLabel: label,
          url: openHref,
        });
        if (cancelled) return;
        setCookieReady(true);
        setEmbedNote(n > 0 ? `Synced ${n} session cookie(s) into webview` : "No jar cookies for this origin (sealed URL may still work)");
      } catch (err) {
        if (cancelled) return;
        // Still try iframe — sealed screen URLs often do not need the jar.
        setCookieReady(true);
        setEmbedNote(err instanceof Error ? err.message : "Cookie sync skipped");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openHref]);

  const withBusy = async (kind: typeof busy, fn: () => Promise<void>) => {
    if (!client || !botId || busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
      await loadComputer(botId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Computer action failed.");
    } finally {
      setBusy(null);
    }
  };

  const idleLabel = loading
    ? "Loading…"
    : computer?.error
      ? "Error"
      : running
        ? computer?.window
          ? "Takeover ready"
          : "Live · idle"
        : "Stopped";

  return (
    <SidePanelChrome
      title="Computer"
      subtitle={`${idleLabel}${computer?.kind ? ` · ${computer.kind}` : ""}`}
      onClose={
        wide
          ? () => {
              void getCurrentWindow().close();
            }
          : undefined
      }
      actions={
        <>
          {showPopOut ? (
            <SidePanelIconButton
              label="Pop out"
              disabled={!botId || busy === "popout"}
              onClick={() => {
                if (!botId) return;
                setBusy("popout");
                setActionError(null);
                void openScreenWindow(botId)
                  .catch((err) => {
                    setActionError(err instanceof Error ? err.message : "Could not pop out.");
                  })
                  .finally(() => setBusy(null));
              }}
            >
              <ExternalLink className="size-3.5" />
            </SidePanelIconButton>
          ) : null}
          <SidePanelIconButton
            label="Refresh"
            disabled={!botId || busy === "refresh"}
            onClick={() =>
              void withBusy("refresh", async () => {
                /* loadComputer called by withBusy */
              })
            }
          >
            <RefreshCw className={`size-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
          </SidePanelIconButton>
        </>
      }
      padded={false}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="pica-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 pb-5">
        <div
          className={`relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-2xl border shadow-[0_1px_0_rgba(0,0,0,0.04)] ${
            running
              ? "border-emerald-500/25 bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100"
              : "border-[var(--color-line)] bg-zinc-100 text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-300"
          }`}
        >
          {openHref && cookieReady ? (
            <iframe
              title="Bot desktop"
              src={openHref}
              className="absolute inset-0 h-full w-full border-0 bg-black"
              allow="clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <div
                className={`mb-2 size-2.5 rounded-full ${
                  loading ? "animate-pulse bg-amber-400" : running ? "bg-emerald-400" : "bg-zinc-400"
                }`}
                aria-hidden
              />
              <p className="text-xs font-medium tracking-wide uppercase opacity-80">
                {loading ? "Connecting" : running ? "Bot desktop" : "No session"}
              </p>
              <p className="mt-1 max-w-[85%] text-center text-[11px] leading-relaxed opacity-70">
                {computer?.error
                  ? computer.error
                  : screen
                    ? `${screen.kind === "vnc" ? "noVNC" : "CDP screencast"} — preparing embed…`
                    : running
                      ? "Computer is up; gateway did not publish a screen URL"
                      : "Start or wake this bot on the gateway to see a live desktop"}
              </p>
              {openHref ? (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-zinc-900 shadow-sm hover:bg-white"
                >
                  Open screen
                </a>
              ) : null}
            </>
          )}
        </div>

        {embedNote ? (
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">{embedNote}</p>
        ) : null}
        {actionError ? <SidePanelBanner tone="danger">{actionError}</SidePanelBanner> : null}

        <div className="flex flex-wrap gap-1.5">
          <Chip
            label="Boot"
            hint="computer.boot"
            disabled={!botId || !client || busy === "boot" || computer?.state === "running"}
            onClick={() =>
              void withBusy("boot", async () => {
                await client!.bootComputer(botId!);
              })
            }
          />
          <Chip
            label="Stop"
            hint="computer.stop"
            disabled={!botId || !client || busy === "stop" || computer?.state === "stopped"}
            onClick={() =>
              void withBusy("stop", async () => {
                await client!.stopComputer(botId!);
              })
            }
          />
          <Chip
            label="Takeover"
            hint="computer.takeover"
            disabled={!botId || !client || busy === "takeover"}
            onClick={() =>
              void withBusy("takeover", async () => {
                const lease = await client!.takeoverComputer(botId!);
                setActionError(`lease ${lease.leaseId} · until ${lease.expiresAt}`);
              })
            }
          />
          <Chip
            label="Release"
            hint="computer.release"
            disabled={!botId || !client || busy === "release"}
            onClick={() =>
              void withBusy("release", async () => {
                await client!.releaseComputer(botId!, "done");
              })
            }
          />
          <Chip
            label="Recover"
            hint="computer.recover"
            disabled={!botId || !client || busy === "recover"}
            onClick={() =>
              void withBusy("recover", async () => {
                await client!.recoverComputer(botId!);
              })
            }
          />
          <Chip
            label="Reset"
            hint="computer.reset"
            disabled={!botId || !client || busy === "reset"}
            onClick={() =>
              void withBusy("reset", async () => {
                await client!.resetComputer(botId!);
              })
            }
          />
          <Chip
            label="Files"
            hint="computer.files"
            disabled={!botId || !client || busy === "files"}
            onClick={() =>
              void withBusy("files", async () => {
                const rows = await client!.listComputerFiles(botId!, filesPath || "/");
                setFiles(rows);
                setFilePreview(null);
              })
            }
          />
          {computer?.terminalUrl ? (
            <a
              href={
                computer.terminalUrl.startsWith("http")
                  ? computer.terminalUrl
                  : absoluteUrl(config.baseUrl, computer.terminalUrl)
              }
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:bg-white/5 dark:text-zinc-200"
            >
              Open terminal
            </a>
          ) : null}
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:bg-white/5 dark:text-zinc-200"
            >
              Open screen tab
            </a>
          ) : null}
        </div>
        <div className="space-y-1.5 rounded-xl border border-[var(--color-line)] p-2.5">
          <div className="flex gap-1.5">
            <input
              value={filesPath}
              onChange={(e) => setFilesPath(e.target.value)}
              placeholder="/ path"
              className="h-7 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-transparent px-2 text-[11px]"
            />
            <Chip
              label="List"
              hint="computer.files"
              disabled={!botId || !client || busy === "files"}
              onClick={() =>
                void withBusy("files", async () => {
                  const rows = await client!.listComputerFiles(botId!, filesPath || "/");
                  setFiles(rows);
                  setFilePreview(null);
                })
              }
            />
          </div>
          {files.length > 0 ? (
            <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[11px]">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="w-full truncate text-left hover:underline"
                    onClick={() => {
                      if (f.kind === "dir") {
                        setFilesPath(f.path);
                        return;
                      }
                      if (!client || !botId) return;
                      void withBusy("readFile", async () => {
                        const row = await client.readComputerFile(botId, f.path);
                        setFilePreview(row.content.slice(0, 4000));
                      });
                    }}
                  >
                    {f.kind === "dir" ? "📁" : "📄"} {f.path}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {filePreview ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-[10px] dark:bg-white/5">
              {filePreview}
            </pre>
          ) : null}
        </div>

        {computer?.gaps?.length ? (
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
            Gaps: {computer.gaps.join(" · ")}
          </p>
        ) : null}

        {computer?.usage ? (
          <p className="text-[11px] text-[var(--color-muted)]">
            Today {computer.usage.today.total.toLocaleString()} tokens
            {computer.usage.budget ? ` / ${computer.usage.budget.toLocaleString()}` : ""}
          </p>
        ) : null}

        {(computer?.actions ?? []).length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Recent actions
            </p>
            <ul className="space-y-1">
              {(computer?.actions ?? []).slice(0, 10).map((action) => (
                <li
                  key={action.id}
                  className="rounded-xl border border-[var(--color-line)] bg-zinc-50 px-2.5 py-1.5 text-[11px] leading-snug dark:bg-white/4"
                >
                  <span className="font-mono text-zinc-800 dark:text-zinc-100">{action.tool}</span>{" "}
                  <span className="text-[var(--color-muted)]">{action.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : !loading ? (
          <p className="text-[11px] text-[var(--color-muted)]">No recent computer actions.</p>
        ) : null}

        <p className="mt-auto pt-2 text-[10px] leading-relaxed text-[var(--color-muted)]">
          Embeds computer.screenUrl (iframe) after syncing jar cookies into the webview. Bot computer RPC: takeover / files / recover. Host device runner: Settings → devices.
        </p>
      </div>
    </SidePanelChrome>
  );
}

function Chip({
  label,
  hint,
  onClick,
  disabled,
  active,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "border border-[var(--color-line)] bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
