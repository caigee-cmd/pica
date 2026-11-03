import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Puzzle, Search, Store, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { colorFor } from "@/lib/utils";

type TabId = "discover" | "plugins" | "bots" | "installed";

const TABS: { id: TabId; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "plugins", label: "Plugins" },
  { id: "bots", label: "Bots" },
  { id: "installed", label: "Installed" },
];

const SAMPLE_CATALOG = [
  {
    id: "sample-researcher",
    name: "Researcher",
    blurb: "Digs through docs and cites sources.",
    emoji: "🔎",
  },
  {
    id: "sample-coder",
    name: "Pair Coder",
    blurb: "Reviews diffs and sketches patches.",
    emoji: "💻",
  },
  {
    id: "sample-ops",
    name: "Ops Buddy",
    blurb: "Watches logs and files routines.",
    emoji: "🛠️",
  },
];

const SAMPLE_PLUGINS = [
  { id: "plug-web", name: "Web Fetch", blurb: "Fetch public pages into context.", tag: "Tools" },
  { id: "plug-calendar", name: "Calendar", blurb: "Read free/busy when connected.", tag: "Productivity" },
  { id: "plug-notes", name: "Notes Sync", blurb: "Mirror notes into memory.", tag: "Memory" },
];

/**
 * BoardUI-density marketplace. Roster bots come from the gateway;
 * sample cards + plugins are local placeholders (Add toggles local prefs).
 */
export function MarketplaceDialog() {
  const open = useUi((s) => s.marketplaceOpen);
  const setOpen = useUi((s) => s.setMarketplaceOpen);
  const showToast = useUi((s) => s.showToast);
  const bots = useWorkspace((s) => s.bots);
  const openBot = useWorkspace((s) => s.openBot);
  const agentLooks = usePrefs((s) => s.agents);
  const [tab, setTab] = useState<TabId>("discover");
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Record<string, boolean>>(() => loadAdded());

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const q = query.trim().toLowerCase();

  const rosterCards = useMemo(
    () =>
      bots
        .map((bot) => ({
          id: bot.id,
          name: agentLooks[bot.id]?.name || bot.name,
          blurb: agentLooks[bot.id]?.description || bot.role || "On your gateway",
          emoji: bot.emoji,
          installed: true as const,
          gateway: true as const,
        }))
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q)),
    [bots, agentLooks, q],
  );

  const sampleCards = useMemo(
    () =>
      SAMPLE_CATALOG.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q),
      ).map((c) => ({
        ...c,
        installed: Boolean(added[c.id]),
        gateway: false as const,
      })),
    [added, q],
  );

  const plugins = useMemo(
    () =>
      SAMPLE_PLUGINS.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q),
      ),
    [q],
  );

  if (!open) return null;

  const discover = [...rosterCards, ...sampleCards.filter((c) => !c.installed)];
  const botsTab = [...rosterCards, ...sampleCards];
  const installed = [...rosterCards, ...sampleCards.filter((c) => c.installed)];

  const toggleAdd = (id: string) => {
    setAdded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem("pica.marketplaceAdded", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="pica-marketplace-root fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close marketplace"
        className="pica-marketplace-scrim absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Marketplace"
        className="pica-marketplace-panel relative flex max-h-[min(720px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
      >
        <header className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <Store size={16} className="text-[var(--color-accent)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Marketplace</h2>
            <p className="text-[11px] text-[var(--color-muted)]">
              Discover agents and plugins. Installs stay local until the gateway grows a catalog API.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-xl text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex items-center gap-1 border-b border-[var(--color-line)] px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                tab === t.id
                  ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white"
                  : "text-[var(--color-muted)] hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto mb-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-zinc-50 px-2 dark:bg-white/5">
            <Search size={12} className="text-[var(--color-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-8 w-36 bg-transparent text-xs outline-none sm:w-48"
            />
          </div>
        </div>

        <div className="pica-scroll flex-1 overflow-auto p-4">
          {tab === "plugins" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plugins.map((plug) => (
                <article
                  key={plug.id}
                  className="rounded-2xl border border-[var(--color-line)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
                      <Puzzle size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{plug.name}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{plug.tag}</p>
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-[var(--color-muted)]">{plug.blurb}</p>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-100 px-3 text-xs font-medium dark:bg-white/10"
                    onClick={() => showToast("Plugin installs come in a later round")}
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </article>
              ))}
              {plugins.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">No plugins match.</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(tab === "discover" ? discover : tab === "bots" ? botsTab : installed).map((card) => (
                <article
                  key={card.id}
                  className="rounded-2xl border border-[var(--color-line)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar
                      id={card.id}
                      name={card.name}
                      emoji={card.emoji}
                      size={36}
                      color={"gateway" in card && card.gateway ? undefined : colorFor(card.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <p className="truncate text-[10px] text-[var(--color-muted)]">
                        {card.gateway ? "On gateway" : "Sample catalog"}
                      </p>
                    </div>
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-[var(--color-muted)]">{card.blurb}</p>
                  {card.gateway ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-emerald-500/15 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                      onClick={() => {
                        setOpen(false);
                        void openBot(card.id);
                      }}
                    >
                      <Check size={12} />
                      Open
                    </button>
                  ) : card.installed ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-100 px-3 text-xs font-medium dark:bg-white/10"
                      onClick={() => {
                        toggleAdd(card.id);
                        showToast(`Removed ${card.name}`);
                      }}
                    >
                      <Check size={12} />
                      Added
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 text-xs font-medium text-white"
                      onClick={() => {
                        toggleAdd(card.id);
                        showToast(`Added ${card.name} (local)`);
                      }}
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  )}
                </article>
              ))}
              {(tab === "discover" ? discover : tab === "bots" ? botsTab : installed).length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">Nothing here yet.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function loadAdded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem("pica.marketplaceAdded");
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}
