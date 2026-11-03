import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type {
  AgentSecret,
  DeploymentSettings,
  MessagingInstallationsStatus,
  MessagingStatus,
  ScratchpadItem,
  SpaceNav,
  UsageSummary,
  VaultSecretMeta,
  VoiceCatalogEntry,
  VoiceStatus,
} from "@/types/gateway";

/**
 * Minimal P2 surfaces per PICA-RPC-P2.md.
 * billing.* hidden — this instance capabilities.billing === false.
 */
export function P2RpcPanels() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const botId = selection?.kind === "dm" ? selection.botId : undefined;

  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<VoiceCatalogEntry[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [msgStatus, setMsgStatus] = useState<MessagingStatus | null>(null);
  const [installs, setInstalls] = useState<MessagingInstallationsStatus | null>(null);
  const [spaces, setSpaces] = useState<SpaceNav | null>(null);
  const [scratch, setScratch] = useState<ScratchpadItem[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [vault, setVault] = useState<VaultSecretMeta[]>([]);
  const [agentSecrets, setAgentSecrets] = useState<AgentSecret[]>([]);
  const [deploy, setDeploy] = useState<DeploymentSettings | null>(null);
  const [secCount, setSecCount] = useState<number | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!client || busy) return;
    setBusy(true);
    setDetail(null);
    try {
      await fn();
      setDetail(`${label} ok`);
    } catch (err) {
      setDetail(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
      <div>
        <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">P2 RPC</p>
        <p className="text-xs text-[var(--color-muted)]">
          voice · messaging · spaces · onboarding · scratchpad · notifications · export · usage ·
          vault/botSecrets/agentSecrets · security/audit · deployment（billing 本实例关闭，已隐藏）
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("voice.catalog/status", async () => {
              setVoiceCatalog(await client!.voiceCatalog());
              setVoiceStatus(await client!.voiceStatus());
            })
          }
        >
          Voice
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("messaging.status/installations", async () => {
              setMsgStatus(await client!.messagingStatus());
              setInstalls(await client!.messagingInstallationsList());
            })
          }
        >
          Messaging
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("spaces.list", async () => {
              setSpaces(await client!.spacesList());
            })
          }
        >
          Spaces
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client || !botId}
          title={!botId ? "Select a bot" : undefined}
          onClick={() =>
            void run("scratchpad.list", async () => {
              setScratch(await client!.scratchpadList({ botId: botId! }));
            })
          }
        >
          Scratchpad
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("usage.summary", async () => {
              setUsage(await client!.usageSummary());
            })
          }
        >
          Usage
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("vault.list + agentSecrets.list", async () => {
              setVault(await client!.vaultList());
              setAgentSecrets(await client!.agentSecretsList());
            })
          }
        >
          Vault
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("deployment.get", async () => {
              setDeploy(await client!.deploymentGet());
            })
          }
        >
          Deployment
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("security.events", async () => {
              const rows = await client!.securityEvents({ limit: 20 });
              setSecCount(rows.length);
            })
          }
        >
          Security
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("audit.events", async () => {
              const page = await client!.auditEvents({ limit: 20 });
              setAuditCount(Array.isArray(page.events) ? page.events.length : 0);
            })
          }
        >
          Audit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client || !botId}
          title={!botId ? "Select a bot" : undefined}
          onClick={() =>
            void run("export.bot", async () => {
              const m = await client!.exportBot(botId!);
              setDetail(`export.bot ok · v=${String(m.version ?? "?")}`);
            })
          }
        >
          Export bot
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client || !botId}
          title={!botId ? "Select a bot" : undefined}
          onClick={() =>
            void run("onboarding.dismissFocus", async () => {
              await client!.onboardingDismissFocus(botId!);
            })
          }
        >
          Onboarding dismiss
        </Button>
      </div>

      {detail ? (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {detail}
        </p>
      ) : null}

      <ul className="space-y-1 text-[11px] text-[var(--color-muted)]">
        {voiceStatus ? (
          <li>
            voice: ready={String(voiceStatus.ready)} provider={voiceStatus.provider ?? "—"} catalog=
            {voiceCatalog.length}
          </li>
        ) : null}
        {msgStatus ? (
          <li>
            messaging: enabled={String(msgStatus.enabled)} installs=
            {installs?.installations?.length ?? 0}
          </li>
        ) : null}
        {spaces ? (
          <li>
            spaces: {(spaces.spaces ?? []).length} · current={spaces.current?.id ?? "—"}
          </li>
        ) : null}
        {scratch.length ? <li>scratchpad: {scratch.length} items</li> : null}
        {usage ? <li>usage: tokens={String(usage.totalTokens ?? "—")}</li> : null}
        {vault.length || agentSecrets.length ? (
          <li>
            vault: {vault.length} · agentSecrets: {agentSecrets.length}
          </li>
        ) : null}
        {deploy ? (
          <li>
            deployment: signups={String(deploy.signupsEnabled)} host={String(deploy.computerHost)}
          </li>
        ) : null}
        {secCount != null ? <li>security.events: {secCount}</li> : null}
        {auditCount != null ? <li>audit.events: {auditCount}</li> : null}
      </ul>
    </section>
  );
}
