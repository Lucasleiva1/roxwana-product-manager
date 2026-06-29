import { useEffect, useState } from "react";
import {
  Archive,
  Boxes,
  ChevronDown,
  Cloud,
  CloudDownload,
  CloudUpload,
  FolderClock,
  Gauge,
  History,
  Menu,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  X,
} from "lucide-react";
import { initializeDesktop, listProducts } from "../services/desktopService";
import { Button } from "../components/ui";
import {
  formatBackupDate,
  getBackupStatus,
  restoreBackup,
  runBackup,
  shouldRunAutomaticBackup,
  type BackupStatus,
} from "../services/backupService";
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type UpdateInstallStatus,
} from "../services/updateService";
import { useProductStore } from "../store/useProductStore";
import type { ProductDraft } from "../types/product";
import Studio from "../features/studio/Studio";
import {
  BackupView,
  DashboardView,
  HistoryView,
  ProductsView,
  SearchView,
  SettingsView,
} from "../features/views/AppViews";

export type AppView =
  | "dashboard"
  | "studio"
  | "products"
  | "search"
  | "backup"
  | "history"
  | "settings";

const navigation: Array<{
  id: AppView;
  label: string;
  icon: typeof Gauge;
}> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "studio", label: "Crear producto", icon: PackagePlus },
  { id: "products", label: "Productos", icon: Boxes },
  { id: "search", label: "Buscador", icon: Search },
  { id: "backup", label: "Backup", icon: CloudUpload },
  { id: "history", label: "Historial", icon: History },
  { id: "settings", label: "Ajustes", icon: Settings },
];

function App() {
  const [view, setView] = useState<AppView>("studio");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("roxwana-sidebar-collapsed") === "true",
  );
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [appMode, setAppMode] = useState<"desktop" | "browser">("browser");
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupMessage, setBackupMessage] = useState("Backup sin revisar");
  const [startupUpdate, setStartupUpdate] = useState<UpdateCheckResult | null>(null);
  const [startupInstall, setStartupInstall] = useState<UpdateInstallStatus | null>(null);
  const [startupUpdateBusy, setStartupUpdateBusy] = useState(false);
  const setDraft = useProductStore((state) => state.setDraft);
  const resetDraft = useProductStore((state) => state.resetDraft);
  const draft = useProductStore((state) => state.draft);
  const settings = useProductStore((state) => state.settings);

  const loadProducts = async () => {
    const next = await listProducts();
    setProducts(next);
    return next;
  };

  const refreshProducts = async () => {
    await loadProducts();
  };

  const checkStartupUpdate = async () => {
    const result = await checkForUpdates();
    if (result.status === "available") {
      setStartupUpdate(result);
    }
  };

  const installStartupUpdate = async () => {
    if (startupUpdate?.status !== "available") return;
    const accepted = window.confirm(
      `Hay una nueva actualizacion disponible: ${startupUpdate.version}.\n\nQueres instalarla ahora? La app se va a reiniciar al terminar.`,
    );
    if (!accepted) return;
    setStartupUpdateBusy(true);
    await downloadAndInstallUpdate(startupUpdate.update, setStartupInstall);
    setStartupUpdateBusy(false);
  };

  useEffect(() => {
    let cancelled = false;

    const syncBackup = async (mode: "startup" | "daily") => {
      if (!settings.backupEnabled) {
        setBackupMessage("Backup automatico pausado");
        return;
      }
      const currentProducts = await loadProducts();
      const status = await getBackupStatus(settings.backupRoot);
      if (cancelled) return;
      setBackupStatus(status);
      if (!status.available) {
        setBackupMessage("Drive no detectado");
        return;
      }
      if (status.backupExists && currentProducts.length === 0) {
        setBackupMessage("Restaurando backup de Drive");
        const result = await restoreBackup(settings.backupRoot);
        if (cancelled) return;
        setBackupStatus(result.status);
        setBackupMessage("Backup restaurado desde Drive");
        await loadProducts();
        return;
      }
      if (shouldRunAutomaticBackup(status, currentProducts, settings.backupFrequencyDays)) {
        setBackupMessage("Guardando backup en Drive");
        const result = await runBackup(settings.backupRoot, mode === "startup" ? "auto-startup" : "auto-daily");
        if (cancelled) return;
        setBackupStatus(result.status);
        setBackupMessage("Backup de Drive actualizado");
        return;
      }
      setBackupMessage(
        status.backupExists ? `Drive listo para subir o bajar - ${formatBackupDate(status.lastBackupAt)}` : "Drive listo",
      );
    };

    const start = async () => {
      let mode: "desktop" | "browser" = "browser";
      try {
        const result = await initializeDesktop();
        mode = "mode" in result ? result.mode : "desktop";
      } catch {
        mode = "browser";
      }
      if (cancelled) return;
      setAppMode(mode);
      await loadProducts();
      if (mode === "desktop") {
        void checkStartupUpdate().catch(() => {
          // The startup check must never block local work.
        });
        try {
          await syncBackup("startup");
        } catch (error) {
          if (!cancelled) {
            setBackupMessage(error instanceof Error ? error.message : "No pude revisar Drive");
          }
        }
      } else {
        setBackupMessage("Backup disponible en escritorio");
      }
    };

    void start();
    const intervalId = window.setInterval(() => {
      void syncBackup("daily").catch((error) => {
        if (!cancelled) {
          setBackupMessage(error instanceof Error ? error.message : "No pude actualizar Drive");
        }
      });
    }, 24 * 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [settings.backupEnabled, settings.backupFrequencyDays, settings.backupRoot]);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("roxwana-sidebar-collapsed", String(next));
      return next;
    });
  };

  const openProduct = (product: ProductDraft) => {
    resetDraft();
    setDraft(product);
    setView("studio");
  };

  const navigateTo = (nextView: AppView) => {
    if (nextView === "studio") resetDraft();
    setView(nextView);
  };

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <DashboardView products={products} onNavigate={navigateTo} />;
      case "studio":
        return <Studio onSaved={refreshProducts} onNavigate={navigateTo} appMode={appMode} />;
      case "products":
        return <ProductsView products={products} onOpen={openProduct} onRefresh={refreshProducts} />;
      case "search":
        return <SearchView onOpen={openProduct} onProductsChanged={refreshProducts} />;
      case "backup":
        return <BackupView onProductsChanged={refreshProducts} />;
      case "history":
        return <HistoryView products={products} onOpen={openProduct} />;
      case "settings":
        return <SettingsView appMode={appMode} onProductsChanged={refreshProducts} />;
      default:
        return null;
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar--open" : ""} ${
          sidebarCollapsed ? "sidebar--collapsed" : ""
        }`}
      >
        <div className="sidebar__brand">
          <button className="icon-button sidebar__close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
          <button
            className="sidebar__collapse"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir menú" : "Plegar menú"}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Plegar menú"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="sidebar__brand-copy">
            <span className="brand-word">ROXWANA</span>
            <span className="brand-subtitle">Product Manager</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => {
                  navigateTo(item.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar__art" aria-hidden="true">
          <i />
          <span className="brand-word">ROXWANA</span>
          <small>WEAR THE ROCK</small>
        </div>

        <div className="sidebar__profile">
          <span className="avatar">RW</span>
          <div className="sidebar__profile-copy">
            <strong>Roxwana Team</strong>
            <small>Admin · {appMode === "desktop" ? "Local" : "Demo web"}</small>
          </div>
          <ChevronDown size={15} />
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className={`workspace ${view === "studio" ? "workspace--studio" : ""}`}>
        <header className="topbar">
          <button className="icon-button topbar__menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar__mobile-brand">
            <span className="brand-word">ROXWANA</span>
          </div>
          <div className="topbar__actions">
            <span className="avatar">RW</span>
            <button className="icon-button">
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        {startupUpdate?.status === "available" && (
          <div className="app-update-banner">
            <CloudDownload size={17} />
            <span>
              Nueva version disponible: {startupUpdate.version}
              {startupInstall ? ` · ${startupInstall.message}` : ""}
              {startupInstall && typeof startupInstall.progress === "number" ? ` ${startupInstall.progress}%` : ""}
            </span>
            <Button size="sm" variant="primary" onClick={() => void installStartupUpdate()} loading={startupUpdateBusy}>
              Instalar ahora
            </Button>
            <Button size="sm" onClick={() => setStartupUpdate(null)} disabled={startupUpdateBusy}>
              Despues
            </Button>
          </div>
        )}

        <div className="workspace__content" key={view}>
          {renderView()}
        </div>

        <footer className="app-statusbar">
          <span>
            <i className={appMode === "desktop" ? "online" : "warning"} />
            {appMode === "desktop" ? "SQLite local activo" : "Modo navegador · datos locales"}
          </span>
          <span className="statusbar-model">{draft.modelCode || "Producto sin completar"}</span>
          <span>
            <Archive size={14} /> Sin Supabase
          </span>
          <span>
            <FolderClock size={14} /> Guardado local
          </span>
          <span>
            <Cloud size={14} /> {backupStatus?.available ? backupMessage : backupMessage}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
