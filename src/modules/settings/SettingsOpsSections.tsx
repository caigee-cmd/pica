import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/stores/connection";
import type {
  AuditEventPage,
  DeploymentSettings,
  SecurityEvent,
  ServerUpdateCheck,
  ServerUpdateRun,
  ServerUpdateStatus,
  UsageRecord,
  UsageSummary,
  VaultSecretMeta,
} from "@/types/gateway";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function SettingsOpsSections() {
  const client = useConnection((s) => s.client);
  const signedIn = useConnection((s) => s.signedIn);

  // —— Usage ——
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageDetail, setUsageDetail] = useState<string | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageList, setUsageList] = useState<UsageRecord[]>([]);

  // —— Vault ——
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultDetail, setVaultDetail] = useState<string | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultSecretMeta[]>([]);
  const [vaultName, setVaultName] = useState("");
  const [vaultAuth, setVaultAuth] = useState("bearer");
  const [vaultValue, setVaultValue] = useState("");
  const [revealedName, setRevealedName] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);

  // —— Deployment ——
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployDetail, setDeployDetail] = useState<string | null>(null);
  const [deploy, setDeploy] = useState<DeploymentSettings | null>(null);

  // —— Updater ——
  const [updaterBusy, setUpdaterBusy] = useState(false);
  const [updaterDetail, setUpdaterDetail] = useState<string | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<ServerUpdateStatus | null>(null);
  const [updaterCheck, setUpdaterCheck] = useState<ServerUpdateCheck | null>(null);
  const [updaterLastRun, setUpdaterLastRun] = useState<ServerUpdateRun | null>(null);

  // —— Security / Audit (thin) ——
  const [secBusy, setSecBusy] = useState(false);
  const [secDetail, setSecDetail] = useState<string | null>(null);
  const [secEvents, setSecEvents] = useState<SecurityEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<Array<Record<string, unknown>>>([]);

  const refreshUsage = useCallback(() => {
    void (async () => {
      if (!client) return;
      setUsageBusy(true);
      setUsageDetail(null);
      try {
        const [summary, list] = await Promise.all([
          client.usageSummary(),
          client.usageList().catch(() => [] as UsageRecord[]),
        ]);
        setUsageSummary(summary);
        setUsageList(Array.isArray(list) ? list.slice(0, 30) : []);
      } catch (err) {
        setUsageDetail(errMsg(err, "usage 加载失败（可能无权限）"));
      } finally {
        setUsageBusy(false);
      }
    })();
  }, [client]);

  const refreshVault = useCallback(() => {
    void (async () => {
      if (!client) return;
      setVaultBusy(true);
      setVaultDetail(null);
      setRevealedName(null);
      setRevealedValue(null);
      try {
        setVaultItems(await client.vaultList());
      } catch (err) {
        setVaultDetail(errMsg(err, "vault 加载失败（可能无权限）"));
      } finally {
        setVaultBusy(false);
      }
    })();
  }, [client]);

  const refreshDeploy = useCallback(() => {
    void (async () => {
      if (!client) return;
      setDeployBusy(true);
      setDeployDetail(null);
      try {
        setDeploy(await client.deploymentGet());
      } catch (err) {
        setDeployDetail(errMsg(err, "deployment 加载失败（可能无权限）"));
      } finally {
        setDeployBusy(false);
      }
    })();
  }, [client]);

  const refreshUpdater = useCallback(() => {
    void (async () => {
      if (!client) return;
      setUpdaterBusy(true);
      setUpdaterDetail(null);
      try {
        const st = await client.updaterStatus();
        setUpdaterStatus(st);
        if (st.lastRun) setUpdaterLastRun(st.lastRun);
      } catch (err) {
        setUpdaterDetail(errMsg(err, "updater.status 失败（可能无权限）"));
      } finally {
        setUpdaterBusy(false);
      }
    })();
  }, [client]);

  const refreshSecurity = useCallback(() => {
    void (async () => {
      if (!client) return;
      setSecBusy(true);
      setSecDetail(null);
      try {
        const [sec, audit] = await Promise.all([
          client.securityEvents({ limit: 20 }).catch(() => [] as SecurityEvent[]),
          client.auditEvents({ limit: 20 }).catch(
            () => ({ events: [] }) as AuditEventPage,
          ),
        ]);
        setSecEvents(Array.isArray(sec) ? sec.slice(0, 20) : []);
        const ev = Array.isArray(audit?.events) ? audit.events : [];
        setAuditEvents(ev.slice(0, 20));
        if (!sec.length && !ev.length) {
          setSecDetail("暂无事件，或无权限查看");
        }
      } catch (err) {
        setSecDetail(errMsg(err, "security/audit 加载失败"));
      } finally {
        setSecBusy(false);
      }
    })();
  }, [client]);

  useEffect(() => {
    if (!signedIn || !client) {
      setUsageSummary(null);
      setUsageList([]);
      setVaultItems([]);
      setDeploy(null);
      setUpdaterStatus(null);
      setUpdaterCheck(null);
      setSecEvents([]);
      setAuditEvents([]);
      return;
    }
    refreshUsage();
    refreshVault();
    refreshDeploy();
    refreshUpdater();
  }, [signedIn, client, refreshUsage, refreshVault, refreshDeploy, refreshUpdater]);

  if (!signedIn) return null;

  const putVault = () => {
    void (async () => {
      if (!client) return;
      const name = vaultName.trim();
      if (!name || !vaultValue) {
        setVaultDetail("请填写 name 与 value");
        return;
      }
      setVaultBusy(true);
      setVaultDetail(null);
      try {
        await client.vaultPut({
          destination: { name, auth: vaultAuth },
          value: vaultValue,
        });
        setVaultValue("");
        setVaultDetail(`已写入 ${name}（值未记入日志）`);
        refreshVault();
      } catch (err) {
        setVaultDetail(errMsg(err, "vault.put 失败"));
        setVaultBusy(false);
      }
    })();
  };

  const revealVault = (name: string) => {
    void (async () => {
      if (!client) return;
      if (!window.confirm(`确认揭示密钥「${name}」？仅显示在本页，不会写入日志。`)) return;
      setVaultBusy(true);
      setVaultDetail(null);
      try {
        const revealed = await client.vaultReveal({ name });
        // Never console.log the secret.
        setRevealedName(name);
        setRevealedValue(
          typeof revealed.value === "string"
            ? revealed.value
            : revealed.fields
              ? JSON.stringify(revealed.fields)
              : "(empty)",
        );
        setVaultDetail(`已揭示 ${name}`);
      } catch (err) {
        setVaultDetail(errMsg(err, "vault.reveal 失败"));
      } finally {
        setVaultBusy(false);
      }
    })();
  };

  const removeVault = (name: string) => {
    void (async () => {
      if (!client) return;
      if (!window.confirm(`确认删除密钥「${name}」？`)) return;
      setVaultBusy(true);
      setVaultDetail(null);
      try {
        await client.vaultRemove({ name });
        if (revealedName === name) {
          setRevealedName(null);
          setRevealedValue(null);
        }
        setVaultDetail(`已删除 ${name}`);
        refreshVault();
      } catch (err) {
        setVaultDetail(errMsg(err, "vault.remove 失败"));
        setVaultBusy(false);
      }
    })();
  };

  const saveDeploy = (patch: {
    signupsEnabled?: boolean;
    computerHost?: "docker" | "this-mac" | null;
  }) => {
    void (async () => {
      if (!client) return;
      setDeployBusy(true);
      setDeployDetail(null);
      try {
        const next = await client.deploymentUpdate(patch);
        setDeploy(next);
        setDeployDetail("已更新 deployment");
      } catch (err) {
        setDeployDetail(errMsg(err, "deployment.update 失败"));
      } finally {
        setDeployBusy(false);
      }
    })();
  };

  const checkUpdate = () => {
    void (async () => {
      if (!client) return;
      setUpdaterBusy(true);
      setUpdaterDetail(null);
      try {
        const check = await client.updaterCheck({});
        setUpdaterCheck(check);
        setUpdaterDetail(`check: ${check.status}${check.reason ? ` · ${check.reason}` : ""}`);
      } catch (err) {
        setUpdaterDetail(errMsg(err, "updater.check 失败"));
      } finally {
        setUpdaterBusy(false);
      }
    })();
  };

  const applyUpdate = () => {
    void (async () => {
      if (!client) return;
      if (
        !window.confirm(
          "确认对服务器执行 updater.apply？可能重启服务。仅部署所有者可操作。",
        )
      )
        return;
      setUpdaterBusy(true);
      setUpdaterDetail(null);
      try {
        const run = await client.updaterApply({});
        setUpdaterLastRun(run);
        setUpdaterDetail(
          run.ok
            ? `apply 成功${run.restartAdvice ? ` · ${run.restartAdvice}` : ""}`
            : `apply 失败${run.error ? ` · ${run.error}` : ""}`,
        );
        refreshUpdater();
      } catch (err) {
        setUpdaterDetail(errMsg(err, "updater.apply 失败"));
        setUpdaterBusy(false);
      }
    })();
  };

  return (
    <>
      {/* Usage */}
      <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
              用量 · usage
            </p>
            <p className="text-xs text-[var(--color-muted)]">usage.summary · usage.list</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={usageBusy || !client}
            onClick={() => refreshUsage()}
          >
            刷新
          </Button>
        </div>
        {usageSummary ? (
          <div className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <p>
              tokens:{" "}
              <span className="font-medium">
                {String(usageSummary.totalTokens ?? usageSummary.inputTokens ?? "—")}
              </span>
              {usageSummary.costUsd != null || usageSummary.totalCost != null
                ? ` · cost $${String(usageSummary.costUsd ?? usageSummary.totalCost)}`
                : ""}
              {usageSummary.runs != null ? ` · runs ${String(usageSummary.runs)}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">尚未加载 summary</p>
        )}
        {usageList.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">暂无用量记录</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {usageList.map((r, i) => (
              <li
                key={String(r.id ?? i)}
                className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-[11px]"
              >
                <span className="font-medium">
                  {String(r.provider ?? "")}
                  {r.model ? `/${r.model}` : ""}
                </span>
                {" · "}
                {String(r.totalTokens ?? r.tokens ?? "—")} tok
                {typeof r.createdAt === "string" ? (
                  <span className="ml-1 text-[var(--color-muted)]">{r.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {usageDetail ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {usageDetail}
          </p>
        ) : null}
      </section>

      {/* Vault */}
      <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
              密钥库 · vault
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              vault.list / put / remove · reveal 需确认，不写日志
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={vaultBusy || !client}
            onClick={() => refreshVault()}
          >
            刷新
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
          <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
            Put · vault.put
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-32 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
              placeholder="name"
              value={vaultName}
              disabled={vaultBusy}
              onChange={(e) => setVaultName(e.target.value)}
            />
            <select
              className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs"
              value={vaultAuth}
              disabled={vaultBusy}
              onChange={(e) => setVaultAuth(e.target.value)}
            >
              <option value="bearer">bearer</option>
              <option value="header">header</option>
              <option value="basic">basic</option>
              <option value="login">login</option>
              <option value="command">command</option>
            </select>
            <input
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
              placeholder="value（不会记入日志）"
              type="password"
              value={vaultValue}
              disabled={vaultBusy}
              onChange={(e) => setVaultValue(e.target.value)}
            />
            <Button size="sm" disabled={vaultBusy || !client} onClick={putVault}>
              写入
            </Button>
          </div>
        </div>

        {vaultItems.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">暂无密钥</p>
        ) : (
          <ul className="space-y-1.5">
            {vaultItems.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{item.name}</span>
                  {item.auth ? ` · ${item.auth}` : ""}
                  {item.origin ? ` · ${item.origin}` : ""}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={vaultBusy}
                    onClick={() => revealVault(item.name)}
                  >
                    揭示
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={vaultBusy}
                    onClick={() => removeVault(item.name)}
                  >
                    删除
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {revealedName && revealedValue != null ? (
          <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">已揭示：{revealedName}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRevealedName(null);
                  setRevealedValue(null);
                }}
              >
                隐藏
              </Button>
            </div>
            <p className="break-all font-mono text-[11px]">{revealedValue}</p>
          </div>
        ) : null}

        {vaultDetail ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {vaultDetail}
          </p>
        ) : null}
      </section>

      {/* Deployment */}
      <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
              部署 · deployment
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              deployment.get · update（signupsEnabled / computerHost）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={deployBusy || !client}
            onClick={() => refreshDeploy()}
          >
            刷新
          </Button>
        </div>
        {deploy ? (
          <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3 text-xs">
            <label className="flex items-center justify-between gap-3">
              <span>
                开放注册 signupsEnabled
                <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
                  allowlist {Array.isArray(deploy.signupAllowlist) ? deploy.signupAllowlist.length : 0} 条
                </span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(deploy.signupsEnabled)}
                disabled={deployBusy || !client}
                onChange={(e) => saveDeploy({ signupsEnabled: e.target.checked })}
              />
            </label>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-muted)]">computerHost</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "docker" as const, label: "docker" },
                    { id: "this-mac" as const, label: "this-mac" },
                    { id: null, label: "null" },
                  ] as { id: "docker" | "this-mac" | null; label: string }[]
                ).map((opt) => (
                  <button
                    key={String(opt.id)}
                    type="button"
                    disabled={deployBusy || !client}
                    onClick={() => saveDeploy({ computerHost: opt.id })}
                    className={
                      deploy.computerHost === opt.id
                        ? "rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white"
                        : "rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] hover:bg-zinc-50 dark:hover:bg-white/5"
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              sandbox: {String(deploy.sandboxProvider ?? "—")}
              {deploy.canChooseHostComputer === false ? " · 不可改 host" : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">尚未加载（可能无部署所有者权限）</p>
        )}
        {deployDetail ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {deployDetail}
          </p>
        ) : null}
      </section>

      {/* Updater */}
      <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
              更新 · updater
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              updater.status · check · apply（部署所有者）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={updaterBusy || !client}
            onClick={() => refreshUpdater()}
          >
            刷新
          </Button>
        </div>
        {updaterStatus ? (
          <div className="space-y-1 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <p>
              <span className="font-medium">{updaterStatus.version}</span>
              {" · "}
              {updaterStatus.installKind}/{updaterStatus.mode}
              {updaterStatus.supported ? "" : " · unsupported"}
              {updaterStatus.running ? " · running" : ""}
              {updaterStatus.dirty ? " · dirty" : ""}
            </p>
            {updaterStatus.commit || updaterStatus.branch ? (
              <p className="font-mono text-[10px] text-[var(--color-muted)]">
                {updaterStatus.branch ?? "?"}@{String(updaterStatus.commit ?? "").slice(0, 12)}
              </p>
            ) : null}
            {updaterStatus.unsupportedReason ? (
              <p className="text-amber-700 dark:text-amber-300">{updaterStatus.unsupportedReason}</p>
            ) : null}
            {updaterStatus.manualCommands && updaterStatus.manualCommands.length > 0 ? (
              <ul className="list-disc pl-4 font-mono text-[10px] text-[var(--color-muted)]">
                {updaterStatus.manualCommands.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
            {updaterStatus.restartAdvice ? (
              <p className="text-[11px] text-[var(--color-muted)]">{updaterStatus.restartAdvice}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">尚未加载 status</p>
        )}
        {updaterCheck ? (
          <p className="text-xs text-[var(--color-muted)]">
            check: <span className="font-medium text-[var(--color-ink)] dark:text-zinc-100">{updaterCheck.status}</span>
            {updaterCheck.behindBy != null ? ` · behind ${updaterCheck.behindBy}` : ""}
            {updaterCheck.targetTag ? ` · tag ${updaterCheck.targetTag}` : ""}
            {updaterCheck.targetCommit
              ? ` · ${String(updaterCheck.targetCommit).slice(0, 12)}`
              : ""}
          </p>
        ) : null}
        {updaterLastRun ? (
          <p className="text-[11px] text-[var(--color-muted)]">
            lastRun: {updaterLastRun.ok ? "ok" : "fail"}
            {updaterLastRun.error ? ` · ${updaterLastRun.error}` : ""}
            {updaterLastRun.restart ? ` · restart ${updaterLastRun.restart}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" disabled={updaterBusy || !client} onClick={checkUpdate}>
            Check
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              updaterBusy ||
              !client ||
              updaterStatus?.installKind !== "sidecar" ||
              updaterStatus?.supported === false
            }
            onClick={applyUpdate}
          >
            Apply
          </Button>
        </div>
        {updaterDetail ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {updaterDetail}
          </p>
        ) : null}
      </section>

      {/* Security / Audit thin */}
      <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
              安全与审计
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              security.events · audit.events（最近 20 条）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={secBusy || !client}
            onClick={() => refreshSecurity()}
          >
            加载
          </Button>
        </div>
        {secEvents.length > 0 ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {secEvents.map((e, i) => (
              <li
                key={String(e.id ?? i)}
                className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-[11px]"
              >
                <span className="font-medium">{String(e.type ?? "event")}</span>
                {typeof e.createdAt === "string" ? (
                  <span className="ml-1 text-[var(--color-muted)]">{e.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {auditEvents.length > 0 ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {auditEvents.map((e, i) => (
              <li
                key={String(e.id ?? i)}
                className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-[11px]"
              >
                <span className="font-medium">{String(e.action ?? e.type ?? "audit")}</span>
                {typeof e.createdAt === "string" ? (
                  <span className="ml-1 text-[var(--color-muted)]">{e.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {secDetail ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {secDetail}
          </p>
        ) : null}
      </section>
    </>
  );
}
