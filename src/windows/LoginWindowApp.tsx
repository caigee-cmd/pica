import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { ChildDragChrome } from "@/components/ChildDragChrome";
import { useResolvedDark } from "@/hooks/useResolvedDark";
import {
  DEFAULT_ORIGIN_HINT,
  LOCAL_ORIGIN_HINT,
  isForbiddenApiPort,
  normalizeBaseUrl,
} from "@/lib/config";
import { GatewayClient, GatewayError } from "@/lib/gateway";
import { isTauri } from "@/lib/platform";
import { focusMainWindow } from "@/lib/windows";
import { useConnection } from "@/stores/connection";
import type { AuthCapabilities } from "@/types/gateway";

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

const DEFAULT_CAPS: AuthCapabilities = {
  passwordAuth: true,
  passwordReset: false,
  resetUrl: null,
  emailCode: false,
  sso: null,
};

/**
 * HuLa-style compact login OS window (`?window=login`).
 * Auth methods driven by GET /api/auth/capabilities (Rakazo).
 */
export function LoginWindowApp() {
  const dark = useResolvedDark();
  const config = useConnection((s) => s.config);
  const secretsReady = useConnection((s) => s.secretsReady);
  const hydrateConfig = useConnection((s) => s.hydrateConfig);
  const setConfig = useConnection((s) => s.setConfig);
  const signIn = useConnection((s) => s.signIn);
  const signUp = useConnection((s) => s.signUp);

  const [baseUrl, setBaseUrl] = useState(config.baseUrl || DEFAULT_ORIGIN_HINT);
  const [email, setEmail] = useState(loadSavedEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "email-code">("sign-in");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [probeOk, setProbeOk] = useState(false);
  const [caps, setCaps] = useState<AuthCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateConfig().catch(() => undefined);
  }, [hydrateConfig]);

  useEffect(() => {
    if (!secretsReady) return;
    if (config.baseUrl) setBaseUrl(config.baseUrl);
  }, [secretsReady, config.baseUrl]);

  const loadCapabilities = async (origin: string) => {
    const client = new GatewayClient({ baseUrl: origin, token: "" });
    const next = await client.fetchAuthCapabilities();
    setCaps(next);
    setCapsError(null);
    if (!next.passwordAuth && next.emailCode) setMode("email-code");
    else if (!next.passwordAuth) setMode("sign-in");
    return next;
  };

  const finishSuccess = async () => {
    if (isTauri) {
      try {
        await emit("pica-session", { signedIn: true });
      } catch {
        /* ignore */
      }
      try {
        await focusMainWindow();
      } catch {
        /* ignore */
      }
      try {
        await getCurrentWindow().close();
      } catch {
        /* ignore */
      }
    }
  };

  const checkConnection = () => {
    void (async () => {
      setBusy(true);
      setDetail(null);
      setProbeOk(false);
      setCaps(null);
      setCapsError(null);
      try {
        if (isForbiddenApiPort(baseUrl)) {
          setDetail("不要使用 API 端口 :3100。");
          return;
        }
        const origin = normalizeBaseUrl(baseUrl);
        if (!origin) {
          setDetail("请填写有效的服务器地址。");
          return;
        }
        const client = new GatewayClient({ baseUrl: origin, token: "" });
        const health = await client.checkHealth();
        const next = await loadCapabilities(origin);
        setProbeOk(true);
        const methods: string[] = [];
        if (next.passwordAuth) methods.push("密码");
        if (next.emailCode) methods.push("邮箱验证码");
        if (next.sso) methods.push(next.sso.name || "SSO");
        setDetail(
          `已连通 · Rakazo ${health.version}` +
            (methods.length ? ` · 登录：${methods.join(" / ")}` : " · 无可用登录方式"),
        );
      } catch (err) {
        setDetail(
          err instanceof GatewayError
            ? err.message
            : err instanceof Error
              ? err.message
              : "无法连接服务器。",
        );
        setCapsError("capabilities 拉取失败，暂按密码登录展示");
        setCaps(DEFAULT_CAPS);
      } finally {
        setBusy(false);
      }
    })();
  };

  const submit = () => {
    void (async () => {
      setBusy(true);
      setDetail(null);
      try {
        if (isForbiddenApiPort(baseUrl)) {
          setDetail("不要使用 API 端口 :3100。");
          return;
        }
        const origin = normalizeBaseUrl(baseUrl);
        if (!origin) {
          setDetail("请填写服务器地址（Existing instance origin）。");
          return;
        }
        await setConfig({ baseUrl: origin, token: config.token ?? "" });
        let active = caps;
        if (!active) {
          try {
            active = await loadCapabilities(origin);
          } catch {
            active = DEFAULT_CAPS;
            setCaps(DEFAULT_CAPS);
          }
        }
        if (mode === "email-code") {
          setDetail("邮箱验证码登录需事务邮件；此实例未开放或客户端尚未接 OTP 提交。");
          return;
        }
        if (!active.passwordAuth) {
          setDetail(
            active.sso
              ? `此实例仅开放 ${active.sso.name}（SSO），Pica 桌面端 SSO 弹窗尚未接通。`
              : "此实例未开放密码登录。",
          );
          return;
        }
        if (!email.trim() || !password) {
          setDetail("请填写邮箱和密码。");
          return;
        }
        saveEmail(email.trim());
        if (mode === "sign-up") {
          await signUp(email.trim(), password, name.trim() || undefined);
        } else {
          await signIn(email.trim(), password);
        }
        setPassword("");
        setDetail("登录成功。");
        await finishSuccess();
      } catch (err) {
        setDetail(
          err instanceof GatewayError
            ? err.message
            : err instanceof Error
              ? err.message
              : "登录失败。",
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  const ok = Boolean(detail && (detail.includes("成功") || detail.startsWith("已连通")));
  const showPassword = (caps ?? DEFAULT_CAPS).passwordAuth;
  const showEmailCode = Boolean(caps?.emailCode);
  const sso = caps?.sso ?? null;
  const showReset = Boolean(caps?.passwordReset && caps.resetUrl);

  return (
    <div className={dark ? "dark h-full" : "h-full"}>
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <ChildDragChrome />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-8 pt-2">
          <div className="w-full max-w-[320px] space-y-5">
            <div className="space-y-1 text-center">
              <p className="text-xs tracking-wide text-[var(--color-muted)] uppercase">Existing instance</p>
              <h1 className="text-xl font-semibold tracking-tight">登录 Pica</h1>
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                对齐 Rakazo：origin + <span className="font-mono">/api/auth/capabilities</span> 驱动登录方式。
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium">服务器地址</span>
              <input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setProbeOk(false);
                  setCaps(null);
                }}
                placeholder={DEFAULT_ORIGIN_HINT}
                spellCheck={false}
                className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
              />
              <span className="block text-[11px] text-[var(--color-muted)]">
                例 {DEFAULT_ORIGIN_HINT} · 本机 {LOCAL_ORIGIN_HINT}
              </span>
            </label>

            {showPassword || showEmailCode ? (
              <div className="flex gap-1 rounded-lg border border-[var(--color-line)] p-0.5 text-xs">
                {showPassword ? (
                  <>
                    <button
                      type="button"
                      className={
                        mode === "sign-in"
                          ? "flex-1 rounded-md bg-[var(--color-accent)]/15 px-2.5 py-1.5 font-medium"
                          : "flex-1 rounded-md px-2.5 py-1.5 text-[var(--color-muted)]"
                      }
                      onClick={() => setMode("sign-in")}
                    >
                      登录
                    </button>
                    <button
                      type="button"
                      className={
                        mode === "sign-up"
                          ? "flex-1 rounded-md bg-[var(--color-accent)]/15 px-2.5 py-1.5 font-medium"
                          : "flex-1 rounded-md px-2.5 py-1.5 text-[var(--color-muted)]"
                      }
                      onClick={() => setMode("sign-up")}
                    >
                      注册
                    </button>
                  </>
                ) : null}
                {showEmailCode ? (
                  <button
                    type="button"
                    className={
                      mode === "email-code"
                        ? "flex-1 rounded-md bg-[var(--color-accent)]/15 px-2.5 py-1.5 font-medium"
                        : "flex-1 rounded-md px-2.5 py-1.5 text-[var(--color-muted)]"
                    }
                    onClick={() => setMode("email-code")}
                  >
                    验证码
                  </button>
                ) : null}
              </div>
            ) : null}

            {showPassword && mode === "sign-up" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">显示名称（可选）</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                />
              </label>
            ) : null}

            {(showPassword && (mode === "sign-in" || mode === "sign-up")) || mode === "email-code" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">邮箱</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@example.com"
                  className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                />
              </label>
            ) : null}

            {showPassword && (mode === "sign-in" || mode === "sign-up") ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)] dark:bg-white/5"
                />
              </label>
            ) : null}

            {mode === "email-code" ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                capabilities.emailCode=true，但桌面端 OTP 提交尚未接线；请用密码或网页登录。
              </p>
            ) : null}

            {sso ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy || !sso.available}
                onClick={() =>
                  setDetail(
                    sso.available
                      ? `SSO「${sso.name}」：桌面端沙箱弹窗尚未接通，请用浏览器登录后带回 Cookie，或使用密码。`
                      : `SSO「${sso.name}」暂时不可用（discovery）。`,
                  )
                }
              >
                {sso.name}
                {!sso.available ? " · 不可用" : ""}
              </Button>
            ) : null}

            {showReset && caps?.resetUrl ? (
              <a
                className="block text-center text-[11px] text-[var(--color-accent)] underline-offset-2 hover:underline"
                href={caps.resetUrl}
                target="_blank"
                rel="noreferrer"
              >
                忘记密码
              </a>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={checkConnection}>
                {busy && !probeOk ? "…" : "检查连接"}
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                disabled={busy || (!showPassword && mode !== "email-code")}
                onClick={submit}
              >
                {busy
                  ? "处理中…"
                  : mode === "sign-up"
                    ? "注册并登录"
                    : mode === "email-code"
                      ? "发送验证码"
                      : "登录"}
              </Button>
            </div>

            {capsError ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{capsError}</p>
            ) : null}

            {detail ? (
              <p
                className={
                  ok
                    ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
                    : "rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
                }
              >
                {detail}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                Cookie：`better-auth.session_token`（Rust 持久 jar）。可选 `set-auth-token` → 本机密钥环 Bearer。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
