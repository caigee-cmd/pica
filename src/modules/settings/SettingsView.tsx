import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { P1RpcPanels } from "@/modules/p1/P1RpcPanels";
import { P2RpcPanels } from "@/modules/p2/P2RpcPanels";
import { SettingsOpsSections } from "@/modules/settings/SettingsOpsSections";
import { useConnection } from "@/stores/connection";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { DEFAULT_ORIGIN_HINT, LOCAL_ORIGIN_HINT, isForbiddenApiPort, normalizeBaseUrl } from "@/lib/config";
import { GatewayClient, GatewayError } from "@/lib/gateway";
import { isTauri } from "@/lib/platform";
import { hideMainWindow, openLoginWindow } from "@/lib/windows";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { secretDelete, secretGet, secretSet } from "@/lib/secrets";
import type {
  ApprovalMode,
  ApprovalRule,
  AuthCapabilities,
  AutoReviewSettings,
  DeviceSummary,
  ModelCatalogEntry,
  ModelCredential,
  ModelRoleView,
} from "@/types/gateway";
import { usePrefs, type AppearanceMode, type SendKeyMode } from "@/stores/prefs";
import { checkClientUpdate, installClientUpdate } from "@/lib/clientUpdater";
import { takeSystemScreenshot } from "@/lib/screenshot";
import { isMac } from "@/lib/platform";

const DEVICE_ID_KEY = "pica.device.deviceId";
const DEVICE_TOKEN_ACCOUNT = "device-token";

function devicePlatform(): "darwin" | "win32" | "linux" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("win")) return "win32";
  return "linux";
}

function deviceDisplayName(): string {
  const host = (typeof window !== "undefined" && (window as unknown as { location?: { hostname?: string } }).location?.hostname) || "";
  const base = host && host !== "localhost" ? host : "This computer";
  return `${base} (Pica)`.slice(0, 128);
}

function loadDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function saveDeviceId(id: string | null) {
  try {
    if (id) localStorage.setItem(DEVICE_ID_KEY, id);
    else localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    /* ignore */
  }
}

const EMAIL_KEY = "pica.auth.email";

function loadSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveEmail(email: string) {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export function SettingsView({
  onClose,
  onOpenMarketplace: _onOpenMarketplace,
  /** Child settings window: session check only, no second WebSocket. */
  httpOnly = false,
  /** OS preferences window shell — compact header, Esc/traffic-light close (no nested main chrome). */
  standalone = false,
}: {
  onClose: () => void;
  /** @deprecated Marketplace stub hidden */
  onOpenMarketplace?: () => void;
  httpOnly?: boolean;
  standalone?: boolean;
}) {
  void _onOpenMarketplace;
  const config = useConnection((s) => s.config);
  const secretsReady = useConnection((s) => s.secretsReady);
  const state = useConnection((s) => s.state);
  const detail = useConnection((s) => s.detail);
  const signedIn = useConnection((s) => s.signedIn);
  const sessionLabel = useConnection((s) => s.sessionLabel);
  const setConfig = useConnection((s) => s.setConfig);
  const connect = useConnection((s) => s.connect);
  const connectHttpOnly = useConnection((s) => s.connectHttpOnly);
  const signIn = useConnection((s) => s.signIn);
  const signUp = useConnection((s) => s.signUp);
  const signOut = useConnection((s) => s.signOut);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [email, setEmail] = useState(loadSavedEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [probeDetail, setProbeDetail] = useState<string | null>(null);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [autoReview, setAutoReviewState] = useState<AutoReviewSettings | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyDetail, setPolicyDetail] = useState<string | null>(null);
  const [ruleEffect, setRuleEffect] = useState<"always_allow" | "deny">("always_allow");
  const [ruleKind, setRuleKind] = useState<"tool" | "connector" | "site">("tool");
  const [ruleValue, setRuleValue] = useState("");
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(loadDeviceId);
  const [deviceStatus, setDeviceStatus] = useState<string>("idle");
  const [deviceDetail, setDeviceDetail] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceAllowed, setDeviceAllowed] = useState(false);
  const [caps, setCaps] = useState<AuthCapabilities | null>(null);
  const [modelCreds, setModelCreds] = useState<ModelCredential[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogEntry[]>([]);
  const [modelRole, setModelRole] = useState<ModelRoleView | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsDetail, setModelsDetail] = useState<string | null>(null);
  const [connectProvider, setConnectProvider] = useState("openai");
  const [connectApiKey, setConnectApiKey] = useState("");
  const [connectModelId, setConnectModelId] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModelId, setDefaultModelId] = useState("");
  const closeToTray = usePrefs((s) => s.closeToTray);
  const setCloseToTray = usePrefs((s) => s.setCloseToTray);
  const appearance = usePrefs((s) => s.appearance);
  const setAppearance = usePrefs((s) => s.setAppearance);
  const setShell = usePrefs((s) => s.setShell);
  const autostartEnabled = usePrefs((s) => s.autostartEnabled);
  const autoLogin = usePrefs((s) => s.autoLogin);
  const globalShortcutEnabled = usePrefs((s) => s.globalShortcutEnabled);
  const globalShortcutToggle = usePrefs((s) => s.globalShortcutToggle);
  const globalShortcutScreenshotEnabled = usePrefs((s) => s.globalShortcutScreenshotEnabled);
  const globalShortcutScreenshot = usePrefs((s) => s.globalShortcutScreenshot);
  const screenshotHideWindow = usePrefs((s) => s.screenshotHideWindow);
  const soundEnabled = usePrefs((s) => s.soundEnabled);
  const soundVolume = usePrefs((s) => s.soundVolume);
  const sendKey = usePrefs((s) => s.sendKey);
  const [clientUpdateDetail, setClientUpdateDetail] = useState<string | null>(null);
  const [clientUpdateBusy, setClientUpdateBusy] = useState(false);
  const [pendingClientUpdate, setPendingClientUpdate] = useState<
    Awaited<ReturnType<typeof checkClientUpdate>> | null
  >(null);
  const client = useConnection((s) => s.client);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!secretsReady) return;
    setBaseUrl(config.baseUrl);
  }, [secretsReady, config.baseUrl]);

  useEffect(() => {
    if (!isTauri) return;
    void invoke<boolean>("device_get_allowed")
      .then((v) => setDeviceAllowed(Boolean(v)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const origin = normalizeBaseUrl(baseUrl || config.baseUrl);
    if (!origin || isForbiddenApiPort(origin)) {
      setCaps(null);
      return;
    }
    let cancelled = false;
    const c = new GatewayClient({ baseUrl: origin, token: "" });
    void c
      .fetchAuthCapabilities()
      .then((next) => {
        if (!cancelled) setCaps(next);
      })
      .catch(() => {
        if (!cancelled) setCaps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, config.baseUrl]);

  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    void listen<{ state: string; detail: string }>("device-status", (ev) => {
      setDeviceStatus(ev.payload.state);
      if (ev.payload.detail) setDeviceDetail(ev.payload.detail);
    }).then((fn) => {
      un = fn;
    });
    return () => {
      un?.();
    };
  }, []);

  useEffect(() => {
    if (!signedIn || !client) {
      setRules([]);
      setAutoReviewState(null);
      setDevices([]);
      setModelCreds([]);
      setModelCatalog([]);
      setModelRole(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [r, a, d] = await Promise.all([
          client.listApprovalRules(),
          client.getAutoReview(),
          client.listDevices().catch(() => [] as DeviceSummary[]),
        ]);
        if (cancelled) return;
        setRules(r);
        setAutoReviewState(a);
        setDevices(d);
      } catch (err) {
        if (!cancelled) {
          setPolicyDetail(err instanceof Error ? err.message : "无法加载审批策略");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, client]);

  const refreshModels = () => {
    void (async () => {
      if (!client) return;
      setModelsBusy(true);
      setModelsDetail(null);
      try {
        const [creds, catalog, role] = await Promise.all([
          client.listModelCredentials(),
          client.listModels().catch(() => [] as ModelCatalogEntry[]),
          client.getModelRole("main").catch(() => null),
        ]);
        setModelCreds(creds);
        setModelCatalog(catalog);
        setModelRole(role);
        const def = creds.find((c) => c.isDefault);
        if (def) {
          setDefaultProvider(def.provider);
          setDefaultModelId(def.modelId || "");
        }
      } catch (err) {
        setModelsDetail(err instanceof Error ? err.message : "无法加载模型配置");
      } finally {
        setModelsBusy(false);
      }
    })();
  };

  useEffect(() => {
    if (!signedIn || !client) return;
    refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, client]);

  const connectModel = () => {
    void (async () => {
      if (!client) return;
      setModelsBusy(true);
      setModelsDetail(null);
      try {
        await client.connectModel({
          provider: connectProvider.trim(),
          ...(connectApiKey.trim() ? { apiKey: connectApiKey.trim() } : {}),
          ...(connectModelId.trim() ? { modelId: connectModelId.trim() } : {}),
          makeDefault: true,
        });
        setConnectApiKey("");
        setModelsDetail("已连接模型凭证");
        refreshModels();
      } catch (err) {
        setModelsDetail(err instanceof Error ? err.message : "models.connect 失败");
        setModelsBusy(false);
      }
    })();
  };

  const applyDefaultModel = () => {
    void (async () => {
      if (!client) return;
      setModelsBusy(true);
      setModelsDetail(null);
      try {
        await client.setDefaultModel({
          provider: defaultProvider.trim(),
          modelId: defaultModelId.trim(),
        });
        setModelsDetail("已设置默认模型");
        refreshModels();
      } catch (err) {
        setModelsDetail(err instanceof Error ? err.message : "models.setDefault 失败");
        setModelsBusy(false);
      }
    })();
  };

  const applyMainRole = () => {
    void (async () => {
      if (!client) return;
      const provider = defaultProvider.trim();
      const modelId = defaultModelId.trim();
      if (!provider || !modelId) {
        setModelsDetail("请先填写 provider 与 modelId");
        return;
      }
      setModelsBusy(true);
      setModelsDetail(null);
      try {
        const view = await client.setModelRole("main", {
          primary: { provider, modelId },
        });
        setModelRole(view);
        setModelsDetail("已更新 main 角色模型");
        setModelsBusy(false);
      } catch (err) {
        setModelsDetail(err instanceof Error ? err.message : "models.setRole 失败");
        setModelsBusy(false);
      }
    })();
  };

  const saveAndConnect = () => {
    void (async () => {
      setProbeDetail(null);
      setAuthDetail(null);
      if (isForbiddenApiPort(baseUrl)) {
        setProbeDetail(
          `不要使用 API 端口 :3100。请填写 Web origin（例如 ${DEFAULT_ORIGIN_HINT} 或 ${LOCAL_ORIGIN_HINT}）。`,
        );
        return;
      }
      await setConfig({ baseUrl, token: config.token ?? "" });
      if (httpOnly) await connectHttpOnly();
      else await connect();
    })();
  };

  const checkConnection = () => {
    void (async () => {
      setProbing(true);
      setProbeDetail(null);
      try {
        if (isForbiddenApiPort(baseUrl)) {
          setProbeDetail("不要把 API 端口 :3100 当作服务器地址。");
          return;
        }
        const origin = normalizeBaseUrl(baseUrl);
        if (!origin) {
          setProbeDetail("请先填写 Rakazo 服务器地址。");
          return;
        }
        const client = new GatewayClient({
          baseUrl: origin,
          token: config.token ?? "",
        });
        const health = await client.checkHealth();
        setProbeDetail(`已连通 · Rakazo ${health.version}`);
      } catch (err) {
        const message =
          err instanceof GatewayError
            ? err.message
            : err instanceof Error
              ? err.message
              : "无法连接服务器。";
        setProbeDetail(message);
      } finally {
        setProbing(false);
      }
    })();
  };

  const submitAuth = () => {
    void (async () => {
      setAuthBusy(true);
      setAuthDetail(null);
      setProbeDetail(null);
      try {
        if (isForbiddenApiPort(baseUrl)) {
          setAuthDetail("不要使用 API 端口 :3100。");
          return;
        }
        const origin = normalizeBaseUrl(baseUrl);
        if (!origin) {
          setAuthDetail("请先填写服务器地址。");
          return;
        }
        // Persist origin before auth so cookie jar / Bearer land on the right host.
        await setConfig({ baseUrl: origin, token: config.token ?? "" });
        if (caps && caps.passwordAuth === false) {
          setAuthDetail(
            caps.sso
              ? `此实例仅开放 ${caps.sso.name}（SSO），桌面弹窗尚未接通。`
              : "此实例未开放密码登录（capabilities.passwordAuth=false）。",
          );
          return;
        }
        if (!email.trim() || !password) {
          setAuthDetail("请填写邮箱和密码。");
          return;
        }
        saveEmail(email.trim());
        if (mode === "sign-up") {
          await signUp(email.trim(), password, name.trim() || undefined);
          setAuthDetail("注册并登录成功。");
        } else {
          await signIn(email.trim(), password);
          setAuthDetail("登录成功。");
        }
        setPassword("");
      } catch (err) {
        const message =
          err instanceof GatewayError
            ? err.message
            : err instanceof Error
              ? err.message
              : "登录失败。";
        setAuthDetail(message);
      } finally {
        setAuthBusy(false);
      }
    })();
  };

  const doSignOut = () => {
    void (async () => {
      setAuthBusy(true);
      setAuthDetail(null);
      try {
        await signOut();
        setAuthDetail("已退出登录。");
        setPassword("");
        // HuLa-like: after logout, reopen compact login; hide main until re-auth.
        if (isTauri) {
          try {
            await openLoginWindow();
            await hideMainWindow();
            onClose();
          } catch {
            /* keep settings visible as fallback */
          }
        }
      } catch (err) {
        setAuthDetail(err instanceof Error ? err.message : "退出失败。");
      } finally {
        setAuthBusy(false);
      }
    })();
  };


  const refreshPolicy = async () => {
    if (!client) return;
    setPolicyBusy(true);
    setPolicyDetail(null);
    try {
      const [r, a, d] = await Promise.all([
        client.listApprovalRules(),
        client.getAutoReview(),
        client.listDevices().catch(() => [] as DeviceSummary[]),
      ]);
      setRules(r);
      setAutoReviewState(a);
      setDevices(d);
    } catch (err) {
      setPolicyDetail(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const changeAutoReviewMode = (mode: ApprovalMode) => {
    if (!client) return;
    void (async () => {
      setPolicyBusy(true);
      setPolicyDetail(null);
      try {
        const next = await client.setAutoReview({ mode });
        setAutoReviewState(next);
        setPolicyDetail(`autoReview.mode = ${next.mode}`);
      } catch (err) {
        setPolicyDetail(err instanceof Error ? err.message : "设置失败");
      } finally {
        setPolicyBusy(false);
      }
    })();
  };

  const toggleSkipApprovals = () => {
    if (!client || !autoReview) return;
    void (async () => {
      setPolicyBusy(true);
      try {
        const next = await client.setAutoReview({ skipApprovals: !autoReview.skipApprovals });
        setAutoReviewState(next);
      } catch (err) {
        setPolicyDetail(err instanceof Error ? err.message : "设置失败");
      } finally {
        setPolicyBusy(false);
      }
    })();
  };

  const removeRule = (id: string) => {
    if (!client) return;
    void (async () => {
      setPolicyBusy(true);
      try {
        await client.revokeRule(id);
        setRules((cur) => cur.filter((r) => r.id !== id));
      } catch (err) {
        setPolicyDetail(err instanceof Error ? err.message : "删除规则失败");
      } finally {
        setPolicyBusy(false);
      }
    })();
  };

  const createRule = () => {
    if (!client) return;
    const matchValue = ruleValue.trim();
    if (!matchValue) {
      setPolicyDetail("请填写 matchValue（工具名 / connector / 站点）");
      return;
    }
    void (async () => {
      setPolicyBusy(true);
      setPolicyDetail(null);
      try {
        const row = await client.createApprovalRule({
          effect: ruleEffect,
          matchKind: ruleKind,
          matchValue,
        });
        setRules((cur) => {
          const rest = cur.filter((r) => r.id !== row.id);
          return [row, ...rest];
        });
        setRuleValue("");
        setPolicyDetail(`已写入 approvalRules.set · ${row.effect} · ${row.matchKind}:${row.matchValue}`);
      } catch (err) {
        setPolicyDetail(err instanceof Error ? err.message : "创建规则失败");
      } finally {
        setPolicyBusy(false);
      }
    })();
  };

  const refreshDevices = async () => {
    if (!client) return;
    setDeviceBusy(true);
    setDeviceDetail(null);
    try {
      setDevices(await client.listDevices());
    } catch (err) {
      setDeviceDetail(err instanceof Error ? err.message : "无法列出设备");
    } finally {
      setDeviceBusy(false);
    }
  };

  const pairAndConnect = () => {
    if (!client || !isTauri) {
      setDeviceDetail("需要桌面端（Tauri）才能 pair/connect");
      return;
    }
    void (async () => {
      setDeviceBusy(true);
      setDeviceDetail(null);
      try {
        let token = await secretGet(DEVICE_TOKEN_ACCOUNT);
        let id = deviceId;
        if (!token || !id) {
          const paired = await client.pairDevice({
            name: deviceDisplayName(),
            platform: devicePlatform(),
          });
          token = paired.token;
          id = paired.deviceId;
          await secretSet(DEVICE_TOKEN_ACCOUNT, token);
          saveDeviceId(id);
          setDeviceId(id);
          setDeviceDetail(`已 pair · deviceId ${id}（token 已写入钥匙串）`);
        }
        await invoke("device_connect", {
          baseUrl: config.baseUrl,
          token,
        });
        setDeviceStatus("connecting");
        await refreshDevices();
      } catch (err) {
        setDeviceDetail(err instanceof Error ? err.message : "pair/connect 失败");
      } finally {
        setDeviceBusy(false);
      }
    })();
  };

  const disconnectDevice = () => {
    if (!isTauri) return;
    void (async () => {
      setDeviceBusy(true);
      try {
        await invoke("device_disconnect");
        setDeviceStatus("idle");
        setDeviceDetail("已断开 devices/connect");
      } catch (err) {
        setDeviceDetail(err instanceof Error ? err.message : "断开失败");
      } finally {
        setDeviceBusy(false);
      }
    })();
  };

  const forgetDevice = () => {
    if (!client) return;
    void (async () => {
      setDeviceBusy(true);
      try {
        await invoke("device_disconnect").catch(() => undefined);
        if (deviceId) {
          await client.revokeDevice(deviceId).catch(() => undefined);
        }
        await secretDelete(DEVICE_TOKEN_ACCOUNT);
        saveDeviceId(null);
        setDeviceId(null);
        setDeviceStatus("idle");
        setDeviceDetail("已撤销本机配对");
        await refreshDevices();
      } catch (err) {
        setDeviceDetail(err instanceof Error ? err.message : "撤销失败");
      } finally {
        setDeviceBusy(false);
      }
    })();
  };

  const probeOk = Boolean(probeDetail?.startsWith("已连通"));
  const authOk = Boolean(authDetail && (authDetail.includes("成功") || authDetail.startsWith("已退出")));

  return (
    <div className="flex h-full flex-col">
      <header
        className={
          standalone
            ? "flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-2.5"
            : "flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4"
        }
      >
        <div className="min-w-0">
          {standalone ? (
            <>
              <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                偏好设置
              </h1>
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                Rakazo 服务器 · origin / 会话
              </p>
            </>
          ) : (
            <>
              <p className="text-xs tracking-wide text-[var(--color-muted)] uppercase">Pica</p>
              <h1 className="text-lg font-semibold">Rakazo 服务器</h1>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionBadge state={state} detail={detail} />
          {standalone ? null : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </header>

      <div
        className={
          standalone
            ? "pica-scroll mx-auto w-full max-w-xl flex-1 space-y-4 overflow-auto px-5 py-5"
            : "pica-scroll mx-auto w-full max-w-xl flex-1 space-y-5 overflow-auto px-6 py-8"
        }
      >
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Pica 是对接自托管 Rakazo 的桌面客户端。请只填写服务器{" "}
          <span className="font-medium text-[var(--color-ink)] dark:text-zinc-100">origin</span>
          （不要带路径）。鉴权走 Better Auth 会话 Cookie；登录后若响应带有{" "}
          <span className="font-mono text-xs">set-auth-token</span>，也会写入本机密钥环作 Bearer。不要指向{" "}
          <span className="font-mono">:3100</span>。
        </p>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">服务器地址</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={DEFAULT_ORIGIN_HINT}
            spellCheck={false}
            className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
          />
          <span className="block text-xs text-[var(--color-muted)]">
            例如 {DEFAULT_ORIGIN_HINT} · 本机 {LOCAL_ORIGIN_HINT}
          </span>
        </label>

        {probeDetail ? (
          <p
            className={
              probeOk
                ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
                : "rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
            }
          >
            {probeDetail}
          </p>
        ) : detail && state !== "live" ? (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {detail}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" type="button" disabled={probing} onClick={checkConnection}>
            {probing ? "检查中…" : "检查连接"}
          </Button>
          <Button variant="accent" onClick={saveAndConnect}>
            保存并连接
          </Button>
          {/* Marketplace stub hidden — not wired to Rakazo catalog yet */}
        </div>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">账号登录</p>
              <p className="text-xs text-[var(--color-muted)]">
                {signedIn
                  ? `当前：${sessionLabel ?? "已登录"}`
                  : "登录后才会拉取机器人名单（bots.list）"}
              </p>
            </div>
            {signedIn ? (
              <Button variant="outline" size="sm" disabled={authBusy} onClick={doSignOut}>
                退出登录
              </Button>
            ) : caps && !caps.passwordAuth && !caps.emailCode ? (
              <p className="text-xs text-[var(--color-muted)]">
                {caps.sso
                  ? `仅 ${caps.sso.name}（SSO）· 桌面弹窗未接通`
                  : "无密码/验证码登录能力"}
              </p>
            ) : (
              <div className="flex gap-1 rounded-lg border border-[var(--color-line)] p-0.5 text-xs">
                <button
                  type="button"
                  className={
                    mode === "sign-in"
                      ? "rounded-md bg-[var(--color-accent)]/15 px-2.5 py-1 font-medium"
                      : "rounded-md px-2.5 py-1 text-[var(--color-muted)]"
                  }
                  onClick={() => setMode("sign-in")}
                >
                  登录
                </button>
                {(caps?.passwordAuth !== false) ? (
                  <button
                    type="button"
                    className={
                      mode === "sign-up"
                        ? "rounded-md bg-[var(--color-accent)]/15 px-2.5 py-1 font-medium"
                        : "rounded-md px-2.5 py-1 text-[var(--color-muted)]"
                    }
                    onClick={() => setMode("sign-up")}
                  >
                    注册
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {!signedIn ? (
            <div className="space-y-3">
              {mode === "sign-up" ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">显示名称（可选）</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                  />
                </label>
              ) : null}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">邮箱</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@example.com"
                  className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAuth();
                  }}
                  className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                />
              </label>
              <Button variant="accent" type="button" disabled={authBusy} onClick={submitAuth}>
                {authBusy ? "处理中…" : mode === "sign-up" ? "注册并登录" : "登录"}
              </Button>
              <p className="text-xs text-[var(--color-muted)]">
                能力来自 <span className="font-mono">GET /api/auth/capabilities</span>
                {caps
                  ? ` · password=${caps.passwordAuth ? "on" : "off"} · reset=${caps.passwordReset ? "on" : "off"} · emailCode=${caps.emailCode ? "on" : "off"} · sso=${caps.sso ? caps.sso.name : "off"}`
                  : " · 探测中…"}
                。公开实例可能关闭注册，需{" "}
                <span className="font-mono">bootstrap-owner</span>。
              </p>
            </div>
          ) : null}

          {authDetail ? (
            <p
              className={
                authOk
                  ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
                  : "rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
              }
            >
              {authDetail}
            </p>
          ) : signedIn && detail && state === "live" ? (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
              {detail.includes("登录") ? detail : `会话正常 · ${sessionLabel}`}
            </p>
          ) : !signedIn && detail && state === "live" ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {detail}
            </p>
          ) : null}
        </section>


        {signedIn ? (
          <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
                  模型 · credentials / connect / setDefault / setRole
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  models.credentials · connect · setDefault · setRole(main)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={modelsBusy || !client}
                onClick={() => refreshModels()}
              >
                刷新
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Connect · models.connect
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  className="w-28 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="provider"
                  value={connectProvider}
                  disabled={modelsBusy}
                  onChange={(e) => setConnectProvider(e.target.value)}
                />
                <input
                  className="min-w-[10rem] flex-1 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="apiKey（可选）"
                  type="password"
                  value={connectApiKey}
                  disabled={modelsBusy}
                  onChange={(e) => setConnectApiKey(e.target.value)}
                />
                <input
                  className="w-36 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="modelId（可选）"
                  value={connectModelId}
                  disabled={modelsBusy}
                  onChange={(e) => setConnectModelId(e.target.value)}
                />
                <Button size="sm" disabled={modelsBusy || !client || !connectProvider.trim()} onClick={connectModel}>
                  连接
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Default / role
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  className="w-28 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="provider"
                  value={defaultProvider}
                  disabled={modelsBusy}
                  onChange={(e) => setDefaultProvider(e.target.value)}
                />
                <input
                  className="min-w-[10rem] flex-1 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="modelId"
                  value={defaultModelId}
                  disabled={modelsBusy}
                  onChange={(e) => setDefaultModelId(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={modelsBusy || !client || !defaultProvider.trim() || !defaultModelId.trim()}
                  onClick={applyDefaultModel}
                >
                  setDefault
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={modelsBusy || !client || !defaultProvider.trim() || !defaultModelId.trim()}
                  onClick={applyMainRole}
                >
                  setRole main
                </Button>
              </div>
              {modelRole?.primary ? (
                <p className="text-[11px] text-[var(--color-muted)]">
                  main primary: {modelRole.primary.provider}/{modelRole.primary.modelId}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--color-muted)]">main primary: （未设置）</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Credentials
              </p>
              {modelCreds.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">暂无凭证</p>
              ) : (
                <ul className="space-y-1.5">
                  {modelCreds.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{c.label || c.provider}</span>
                        {" · "}
                        {c.provider}
                        {c.modelId ? `/${c.modelId}` : ""}
                        {c.isDefault ? " · default" : ""}
                        {c.hasKey ? "" : " · no key"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={modelsBusy || !c.modelId}
                        onClick={() => {
                          setDefaultProvider(c.provider);
                          setDefaultModelId(c.modelId || "");
                        }}
                      >
                        选用
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {modelCatalog.length > 0 ? (
                <p className="text-[10px] text-[var(--color-muted)]">
                  catalog {modelCatalog.length} entries（models.list）
                </p>
              ) : null}
            </div>

            {modelsDetail ? (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {modelsDetail}
              </p>
            ) : null}
          </section>
        ) : null}

        {signedIn ? (
          <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
                  审批与自动审核
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  approvalRules.list / set / remove · autoReview.get / set
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={policyBusy || !client} onClick={() => void refreshPolicy()}>
                刷新
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Auto review mode
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["ask", "auto", "never"] as ApprovalMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={policyBusy || !client}
                    onClick={() => changeAutoReviewMode(mode)}
                    className={
                      autoReview?.mode === mode
                        ? "rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white"
                        : "rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] hover:bg-zinc-50 dark:hover:bg-white/5"
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
              {autoReview ? (
                <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    checked={autoReview.skipApprovals}
                    disabled={policyBusy}
                    onChange={toggleSkipApprovals}
                  />
                  skipApprovals（跳过人工审批卡）
                  {autoReview.checkerAvailable ? null : (
                    <span className="text-amber-700 dark:text-amber-300">· checker 不可用</span>
                  )}
                </label>
              ) : (
                <p className="text-xs text-[var(--color-muted)]">尚未加载 autoReview</p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                New approval rule · approvalRules.set
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs"
                  value={ruleEffect}
                  disabled={policyBusy}
                  onChange={(e) =>
                    setRuleEffect(e.target.value as "always_allow" | "deny")
                  }
                >
                  <option value="always_allow">always_allow</option>
                  <option value="deny">deny</option>
                </select>
                <select
                  className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs"
                  value={ruleKind}
                  disabled={policyBusy}
                  onChange={(e) =>
                    setRuleKind(e.target.value as "tool" | "connector" | "site")
                  }
                >
                  <option value="tool">tool</option>
                  <option value="connector">connector</option>
                  <option value="site">site</option>
                </select>
                <input
                  className="min-w-[10rem] flex-1 rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  placeholder="matchValue（如 shell / github / example.com）"
                  value={ruleValue}
                  disabled={policyBusy}
                  onChange={(e) => setRuleValue(e.target.value)}
                />
                <Button size="sm" disabled={policyBusy || !client} onClick={createRule}>
                  添加
                </Button>
              </div>
              <p className="text-[10px] text-[var(--color-muted)]">
                set 仅支持 always_allow | deny；matchKind 无 category（列表里旧规则可能仍含
                require_approval / category）。
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Saved approval rules
              </p>
              {rules.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">暂无规则</p>
              ) : (
                <ul className="space-y-1.5">
                  {rules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{rule.effect}</span>
                        {" · "}
                        {rule.matchKind}:{rule.matchValue}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={policyBusy}
                        onClick={() => removeRule(rule.id)}
                      >
                        删除
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {policyDetail ? (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {policyDetail}
              </p>
            ) : null}
          </section>
        ) : null}

        {signedIn ? (
          <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">
                  本机电脑 · devices
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  POST /api/devices/pair · WS /api/devices/connect · host runner：environment / execute / listFiles / readFile / writeFile + soft lifecycle
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={deviceBusy || !client}
                onClick={() => void refreshDevices()}
              >
                刷新
              </Button>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
              <span>
                允许本机执行 host 请求
                <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
                  关闭时对所有 request 回 Not allowed（对照 Electron consent）
                </span>
              </span>
              <input
                type="checkbox"
                checked={deviceAllowed}
                disabled={!isTauri || deviceBusy}
                onChange={(e) => {
                  const next = e.target.checked;
                  setDeviceAllowed(next);
                  if (isTauri) {
                    void invoke("device_set_allowed", { allowed: next }).catch(() => undefined);
                  }
                }}
              />
            </label>
            <p className="text-xs text-[var(--color-muted)]">
              状态：{deviceStatus}
              {deviceId ? ` · 本机 deviceId ${deviceId}` : " · 尚未 pair"}
              {deviceAllowed ? " · consent on" : " · consent off"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={deviceBusy || !client} onClick={pairAndConnect}>
                Pair + connect
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deviceBusy}
                onClick={disconnectDevice}
              >
                Disconnect
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={deviceBusy || !client}
                onClick={forgetDevice}
              >
                Forget
              </Button>
            </div>
            {devices.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">账号下暂无已配对设备</p>
            ) : (
              <ul className="space-y-1.5">
                {devices.map((d) => (
                  <li
                    key={d.deviceId}
                    className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{d.name}</span>
                    {" · "}
                    {d.connected ? "online" : "offline"}
                    <span className="ml-1 font-mono text-[10px] text-[var(--color-muted)]">
                      {d.deviceId}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {deviceDetail ? (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {deviceDetail}
              </p>
            ) : null}
          </section>
        ) : null}


        {signedIn ? <SettingsOpsSections /> : null}

        {signedIn ? <P1RpcPanels /> : null}

        {signedIn ? <P2RpcPanels /> : null}

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">外观</p>
            <p className="text-xs text-[var(--color-muted)]">
              Rakazo 明暗 token；可跟随系统，或手动锁定白天 / 黑夜。聊天、侧栏、对话框与滚动条一并切换。
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "light", label: "白天" },
                { id: "dark", label: "黑夜" },
                { id: "system", label: "跟随系统" },
              ] as { id: AppearanceMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAppearance(opt.id)}
                className={
                  appearance === opt.id
                    ? "rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] hover:bg-zinc-50 dark:hover:bg-white/5"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">窗口 · 托盘</p>
            <p className="text-xs text-[var(--color-muted)]">壳行为对齐 Lulu/HuLa：关主窗进托盘，而不是直接退出。</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>关闭窗口时最小化到托盘</span>
            <input
              type="checkbox"
              checked={closeToTray}
              onChange={(e) => setCloseToTray(e.target.checked)}
            />
          </label>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">通用 · 启动</p>
            <p className="text-xs text-[var(--color-muted)]">开机自启与自动登录（会话 Cookie 持久化已存在时由开关接管）。</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>开机时启动 Pica</span>
            <input
              type="checkbox"
              checked={autostartEnabled}
              onChange={(e) => setShell({ autostartEnabled: e.target.checked })}
              disabled={!isTauri}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>启动时自动登录（恢复会话）</span>
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={(e) => setShell({ autoLogin: e.target.checked })}
            />
          </label>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">通知 · 提示音</p>
            <p className="text-xs text-[var(--color-muted)]">新消息等系统通知触发时播放提示音（与静默 toast 互补）。</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>启用提示音</span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setShell({ soundEnabled: e.target.checked })}
            />
          </label>
          <label className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span className="flex justify-between">
              <span>音量</span>
              <span className="text-[var(--color-muted)]">{Math.round(soundVolume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={soundVolume}
              disabled={!soundEnabled}
              onChange={(e) => setShell({ soundVolume: Number(e.target.value) })}
            />
          </label>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">快捷键 · 截图</p>
            <p className="text-xs text-[var(--color-muted)]">全局快捷键默认关闭；开启后可在系统任意处唤起/隐藏主窗或截图。</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>启用全局快捷键</span>
            <input
              type="checkbox"
              checked={globalShortcutEnabled}
              onChange={(e) => setShell({ globalShortcutEnabled: e.target.checked })}
              disabled={!isTauri}
            />
          </label>
          <label className="flex flex-col gap-1 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>唤起 / 隐藏主窗</span>
            <input
              className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1 font-mono text-[11px]"
              value={globalShortcutToggle}
              disabled={!globalShortcutEnabled || !isTauri}
              onChange={(e) => setShell({ globalShortcutToggle: e.target.value })}
              placeholder="CommandOrControl+Shift+P"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>启用截图快捷键</span>
            <input
              type="checkbox"
              checked={globalShortcutScreenshotEnabled}
              onChange={(e) => setShell({ globalShortcutScreenshotEnabled: e.target.checked })}
              disabled={!globalShortcutEnabled || !isTauri}
            />
          </label>
          <label className="flex flex-col gap-1 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>系统截图</span>
            <input
              className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1 font-mono text-[11px]"
              value={globalShortcutScreenshot}
              disabled={!globalShortcutEnabled || !globalShortcutScreenshotEnabled || !isTauri}
              onChange={(e) => setShell({ globalShortcutScreenshot: e.target.value })}
              placeholder="CommandOrControl+Shift+A"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs">
            <span>截图前隐藏主窗</span>
            <input
              type="checkbox"
              checked={screenshotHideWindow}
              onChange={(e) => setShell({ screenshotHideWindow: e.target.checked })}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!isTauri}
            onClick={() => void takeSystemScreenshot()}
          >
            立即截图
          </Button>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">发送键</p>
            <p className="text-xs text-[var(--color-muted)]">
              选择 Enter 或 {isMac ? "⌘" : "Ctrl"}+Enter 发送；另一键换行。
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "enter" as SendKeyMode, label: "Enter 发送" },
                {
                  id: "modEnter" as SendKeyMode,
                  label: `${isMac ? "⌘" : "Ctrl"}+Enter 发送`,
                },
              ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setShell({ sendKey: opt.id })}
                className={
                  sendKey === opt.id
                    ? "rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] hover:bg-zinc-50 dark:hover:bg-white/5"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">客户端更新</p>
            <p className="text-xs text-[var(--color-muted)]">
              壳侧 tauri-plugin-updater（≠ 服务器 updater.* RPC）。发行端点未配时可检查并查看说明。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isTauri || clientUpdateBusy}
              onClick={() => {
                void (async () => {
                  setClientUpdateBusy(true);
                  setClientUpdateDetail(null);
                  try {
                    const result = await checkClientUpdate();
                    setPendingClientUpdate(result);
                    setClientUpdateDetail(result.detail);
                  } finally {
                    setClientUpdateBusy(false);
                  }
                })();
              }}
            >
              {clientUpdateBusy ? "检查中…" : "检查更新"}
            </Button>
            {pendingClientUpdate?.status === "available" ? (
              <Button
                type="button"
                size="sm"
                disabled={clientUpdateBusy}
                onClick={() => {
                  void (async () => {
                    if (pendingClientUpdate.status !== "available") return;
                    setClientUpdateBusy(true);
                    try {
                      const msg = await installClientUpdate(pendingClientUpdate.update);
                      setClientUpdateDetail(msg);
                    } catch (err) {
                      setClientUpdateDetail(err instanceof Error ? err.message : String(err));
                    } finally {
                      setClientUpdateBusy(false);
                    }
                  })();
                }}
              >
                下载并安装
              </Button>
            ) : null}
          </div>
          {clientUpdateDetail ? (
            <p className="text-xs text-[var(--color-muted)]">{clientUpdateDetail}</p>
          ) : null}
        </section>

        <section className="space-y-2 border-t border-[var(--color-line)] pt-5 text-sm text-[var(--color-muted)]">
          <p className="font-medium text-[var(--color-ink)] dark:text-zinc-100">说明</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              连通性：<span className="font-mono">POST /rpc/health</span>
            </li>
            <li>
              会话：登录后探测 <span className="font-mono">me</span> /{" "}
              <span className="font-mono">bots.list</span>
            </li>
            <li>
              业务 RPC 经 Tauri Rust（Cookie jar + 可选 Bearer）。实时聊天用{" "}
              <span className="font-mono">threads.subscribe</span>（无全站 WebSocket）。
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
