import { useCallback, useEffect, useState } from "react";
import { Phone, PhoneOff, RefreshCw, Volume2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import {
  SidePanelBanner,
  SidePanelChrome,
  SidePanelEmpty,
  SidePanelIconButton,
  closeRightPanel,
} from "@/components/SidePanelChrome";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type {
  VoiceCatalogEntry,
  VoiceInfo,
  VoicePrepareResult,
  VoiceStatus,
} from "@/types/gateway";

const field =
  "w-full rounded-xl border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-[13px] outline-none dark:border-white/12";

/** DM Call sheet — voice.* ; billing off must NOT hide this. */
export function CallPanel() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const bots = useWorkspace((s) => s.bots);
  const botId = selection?.kind === "dm" ? selection.botId : undefined;
  const bot = bots.find((b) => b.id === botId);

  const [catalog, setCatalog] = useState<VoiceCatalogEntry[]>([]);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [prepareText, setPrepareText] = useState("Hello from Pica.");
  const [prepared, setPrepared] = useState<VoicePrepareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [cat, st] = await Promise.all([
        client.voiceCatalog().catch(() => [] as VoiceCatalogEntry[]),
        client.voiceStatus({}).catch(() => null),
      ]);
      setCatalog(cat);
      setStatus(st);
      const preferred = st?.provider || cat[0]?.id || "";
      setProvider((prev) => prev || preferred);
      if (st?.voiceId) setVoiceId(st.voiceId);
      if (preferred) {
        const vs = await client.voiceVoices({ provider: preferred }).catch(() => [] as VoiceInfo[]);
        setVoices(vs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load voice.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  async function refreshVoices(p: string) {
    if (!client || !p) return;
    try {
      setVoices(await client.voiceVoices({ provider: p }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "voices failed.");
    }
  }

  async function connect() {
    if (!client || !provider) return;
    setBusy(true); setError(null); setNote(null);
    try {
      await client.voiceConnect({
        provider,
        apiKey: apiKey.trim() || undefined,
        voiceId: voiceId.trim() || undefined,
      });
      setStatus(await client.voiceStatus({}));
      setNote(`Connected · ${provider}`);
      setApiKey("");
      await refreshVoices(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed.");
    } finally { setBusy(false); }
  }

  async function setVoice() {
    if (!client || !voiceId.trim()) return;
    setBusy(true); setError(null);
    try {
      await client.voiceSetVoice({ voiceId: voiceId.trim(), provider: provider || undefined });
      setStatus(await client.voiceStatus({}));
      setNote(`Voice · ${voiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "setVoice failed.");
    } finally { setBusy(false); }
  }

  async function prepare() {
    if (!client || !prepareText.trim()) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await client.voicePrepare({
        text: prepareText.trim(),
        voiceId: voiceId.trim() || undefined,
        botId,
      });
      setPrepared(res);
      setNote("Prepared utterance.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "prepare failed.");
    } finally { setBusy(false); }
  }

  if (!botId) {
    return (
      <SidePanelChrome title="Call">
        <SidePanelEmpty className="text-[13px]">通话仅在 Bot DM 可用（群聊不可）。</SidePanelEmpty>
      </SidePanelChrome>
    );
  }

  const ready = Boolean(status?.ready || status?.configured);

  return (
    <SidePanelChrome
      title="Call"
      subtitle={bot?.name || botId}
      actions={
        <SidePanelIconButton label="Refresh" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </SidePanelIconButton>
      }
    >
      <div className="mb-5 flex flex-col items-center gap-2.5 rounded-[22px] border border-[var(--color-line)] bg-zinc-50/80 px-4 py-6 dark:border-white/10 dark:bg-white/[0.04]">
        {bot ? <Avatar id={bot.id} name={bot.name} emoji={bot.emoji} size={56} alive={ready} /> : (
          <div className={`flex size-14 items-center justify-center rounded-full ${ready ? "bg-emerald-500/15 text-emerald-600" : "bg-zinc-200 text-zinc-500 dark:bg-white/10"}`}>
            <Phone className="size-6" strokeWidth={1.6} />
          </div>
        )}
        <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{bot?.name || botId}</p>
        <p className="text-[12px] text-[var(--color-muted)]">
          {ready ? "语音就绪" : "未连接"}
          {status?.provider ? ` · ${status.provider}` : ""}
          {status?.transcribe ? " · STT" : ""}
        </p>
        <div className="mt-1 flex gap-2">
          <Button size="sm" className="h-8 gap-1.5 rounded-full px-4 text-[13px]" disabled={busy || !provider} onClick={() => void connect()}>
            <Phone className="size-3.5" strokeWidth={1.6} /> 连接
          </Button>
          <Button size="sm" variant="danger" className="h-8 gap-1.5 rounded-full px-4 text-[13px]" onClick={() => closeRightPanel()}>
            <PhoneOff className="size-3.5" strokeWidth={1.6} /> 结束
          </Button>
        </div>
      </div>

      {error ? <SidePanelBanner tone="danger">{error}</SidePanelBanner> : null}
      {note ? <SidePanelBanner>{note}</SidePanelBanner> : null}

      <div className="space-y-3">
        <label className="block space-y-1 text-[11px] text-[var(--color-muted)]">
          提供商
          <select
            className={field}
            value={provider}
            onChange={(e) => { const p = e.target.value; setProvider(p); void refreshVoices(p); }}
          >
            <option value="">Select…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.keyless ? " (keyless)" : ""}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-[11px] text-[var(--color-muted)]">
          API key（无 key / 已保存可留空）
          <input type="password" className={field} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </label>

        <label className="block space-y-1 text-[11px] text-[var(--color-muted)]">
          音色
          <div className="flex gap-1.5">
            <select className={`${field} min-w-0 flex-1`} value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.label || v.name || v.id}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-8 text-[13px]" disabled={busy || !voiceId} onClick={() => void setVoice()}>应用</Button>
          </div>
        </label>

        <label className="block space-y-1 text-[11px] text-[var(--color-muted)]">
          预合成（TTS）
          <textarea className={`${field} min-h-[72px] resize-none`} value={prepareText} onChange={(e) => setPrepareText(e.target.value)} />
        </label>
        <Button size="sm" className="h-8 w-full gap-1.5 text-[13px]" disabled={busy || !prepareText.trim()} onClick={() => void prepare()}>
          <Volume2 className="size-3.5" /> 预合成
        </Button>

        {prepared ? (
          <pre className="overflow-x-auto rounded-2xl bg-zinc-50 p-3 text-[10px] leading-relaxed dark:bg-white/5">
            {JSON.stringify(prepared, null, 2)}
          </pre>
        ) : null}
      </div>
    </SidePanelChrome>
  );
}
