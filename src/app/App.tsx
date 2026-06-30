import { useEffect, useRef, useState } from "react";
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
  latestProductChange,
  restoreBackup,
  runBackup,
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

type AvailableUpdate = Extract<UpdateCheckResult, { status: "available" }>;

interface LoadingScreenState {
  active: boolean;
  progress: number | null;
  message: string;
  detail: string;
  mode: "startup" | "update";
  error?: string;
  version?: string;
}

function RoxwanaLoadingScreen({
  state,
  onClose,
}: {
  state: LoadingScreenState;
  onClose?: () => void;
}) {
  const progress = typeof state.progress === "number" ? Math.max(0, Math.min(100, state.progress)) : null;
  const isUpdate = state.mode === "update";

  return (
    <div className={`system-loader ${isUpdate ? "system-loader--update" : "system-loader--startup"}`}>
      <div className="system-loader__frame">
        <div className="system-loader__corner system-loader__corner--tl" />
        <div className="system-loader__corner system-loader__corner--tr" />
        <div className="system-loader__corner system-loader__corner--bl" />
        <div className="system-loader__corner system-loader__corner--br" />
        <div className="system-loader__side">
          <code>SYS.01</code>
          <span>{isUpdate ? "DESCARGANDO BUILD" : "SINCRONIZANDO"}</span>
          <span>{isUpdate ? "VERIFICANDO FIRMA" : "BASE DE DATOS"}</span>
          <span>{isUpdate ? "INSTALANDO" : "VERIFICANDO MODULOS"}</span>
        </div>
        <div className="system-loader__brand">
          <div className="system-loader__seal">
            <span>RXW</span>
          </div>
          <div>
            <strong>ROXWANA</strong>
            <small>INVENTARIO</small>
          </div>
        </div>
        <div className="system-loader__progress">
          <div>
            <i style={{ width: `${progress ?? 42}%` }} />
          </div>
          <strong>{progress === null ? "--" : progress}%</strong>
        </div>
        <div className="system-loader__status">
          <span>[</span>
          <strong>{state.message}</strong>
          <span>]</span>
        </div>
        <p>{state.detail}</p>
        {state.error && (
          <div className="system-loader__error">
            <strong>No se pudo completar</strong>
            <span>{state.error}</span>
            {onClose && (
              <Button size="sm" onClick={onClose}>
                Cerrar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [bootScreen, setBootScreen] = useState<LoadingScreenState>({
    active: true,
    progress: 4,
    message: "CARGANDO SISTEMA...",
    detail: "Activando modulos locales",
    mode: "startup",
  });
  const [updateScreen, setUpdateScreen] = useState<LoadingScreenState>({
    active: false,
    progress: 0,
    message: "ACTUALIZACION",
    detail: "Preparando instalador",
    mode: "update",
  });
  const updateDismissed = useRef(false);
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
    if (result.status === "available" && !updateDismissed.current) {
      setStartupUpdate(result);
    }
  };

  const installUpdate = async (updateResult: AvailableUpdate) => {
    setStartupUpdateBusy(true);
    setStartupInstall(null);
    setUpdateScreen({
      active: true,
      mode: "update",
      version: updateResult.version,
      progress: 0,
      message: "ACTUALIZANDO SISTEMA...",
      detail: `Preparando version ${updateResult.version}`,
    });
    let failed = false;
    await downloadAndInstallUpdate(updateResult.update, (status) => {
      if (status.status === "error") failed = true;
      setStartupInstall(status);
      setUpdateScreen({
        active: true,
        mode: "update",
        version: updateResult.version,
        progress:
          typeof status.progress === "number"
            ? status.progress
            : status.status === "installing"
              ? 92
              : status.status === "relaunching"
                ? 100
                : null,
        message:
          status.status === "downloading"
            ? "DESCARGANDO ACTUALIZACION..."
            : status.status === "installing"
              ? "INSTALANDO ACTUALIZACION..."
              : status.status === "relaunching"
                ? "REINICIANDO SISTEMA..."
                : "ERROR DE ACTUALIZACION",
        detail: status.message,
        error: status.status === "error" ? status.message : undefined,
      });
    });
    if (failed) setStartupUpdateBusy(false);
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
      if (!status.backupExists) {
        if (!currentProducts.length) {
          setBackupMessage("Drive listo, sin productos para sincronizar");
          return;
        }
        setBackupMessage("Subiendo copia local a Drive");
        const result = await runBackup(settings.backupRoot, `auto-${mode}-crear-backup`);
        if (cancelled) return;
        setBackupStatus(result.status);
        setBackupMessage("Drive quedo actualizado con esta PC");
        return;
      }

      const driveTime = new Date(status.lastBackupAt || "").getTime() || 0;
      const localTime = latestProductChange(currentProducts);

      if (currentProducts.length === 0 || driveTime > localTime) {
        setBackupMessage("Bajando cambios nuevos de Drive");
        const result = await restoreBackup(settings.backupRoot);
        if (cancelled) return;
        setBackupStatus(result.status);
        setBackupMessage("Esta PC quedo actualizada desde Drive");
        await loadProducts();
        return;
      }

      if (localTime > driveTime || currentProducts.length !== status.productCount) {
        setBackupMessage("Subiendo cambios locales a Drive");
        const result = await runBackup(settings.backupRoot, `auto-${mode}-subir-cambios`);
        if (cancelled) return;
        setBackupStatus(result.status);
        setBackupMessage("Drive quedo actualizado con los cambios locales");
        return;
      }
      setBackupMessage(`Drive y esta PC al dia - ${formatBackupDate(status.lastBackupAt)}`);
    };

    const start = async () => {
      let mode: "desktop" | "browser" = "browser";
      setBootScreen({
        active: true,
        progress: 8,
        message: "CARGANDO SISTEMA...",
        detail: "Activando escritorio local",
        mode: "startup",
      });
      try {
        const result = await initializeDesktop();
        mode = "mode" in result ? result.mode : "desktop";
      } catch {
        mode = "browser";
      }
      if (cancelled) return;
      setAppMode(mode);
      setBootScreen({
        active: true,
        progress: 28,
        message: "CARGANDO PRODUCTOS...",
        detail: "Leyendo base local y carpetas de productos",
        mode: "startup",
      });
      await loadProducts();
      if (mode === "desktop") {
        try {
          setBootScreen({
            active: true,
            progress: 52,
            message: "SINCRONIZANDO DRIVE...",
            detail: "Comparando esta PC con Google Drive",
            mode: "startup",
          });
          await syncBackup("startup");
        } catch (error) {
          if (!cancelled) {
            setBackupMessage(error instanceof Error ? error.message : "No pude revisar Drive");
          }
        }
        setBootScreen({
          active: true,
          progress: 78,
          message: "VERIFICANDO VERSION...",
          detail: "Buscando actualizaciones disponibles",
          mode: "startup",
        });
        await checkStartupUpdate().catch(() => {
          // The startup check must never block local work.
        });
      } else {
        setBackupMessage("Backup disponible en escritorio");
      }
      if (cancelled) return;
      setBootScreen({
        active: true,
        progress: 100,
        message: "SISTEMA EN LINEA",
        detail: "ROXWANA listo para trabajar",
        mode: "startup",
      });
      window.setTimeout(() => {
        if (!cancelled) setBootScreen((current) => ({ ...current, active: false }));
      }, 420);
    };

    void start();
    const intervalId = window.setInterval(() => {
      void (async () => {
        await Promise.allSettled([syncBackup("daily"), checkStartupUpdate()]);
      })().catch((error) => {
        if (!cancelled) {
          setBackupMessage(error instanceof Error ? error.message : "No pude actualizar Drive");
        }
      });
    }, 24 * 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [settings.backupEnabled, settings.backupRoot]);

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
        return <SettingsView appMode={appMode} onProductsChanged={refreshProducts} onInstallUpdate={installUpdate} />;
      default:
        return null;
    }
  };

  if (bootScreen.active) {
    return <RoxwanaLoadingScreen state={bootScreen} />;
  }

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

        {startupUpdate?.status === "available" && !updateDismissed.current && !updateScreen.active && (
          <div className="update-dialog-backdrop">
            <section className="update-dialog">
            <CloudDownload size={17} />
            <span>
              Nueva version disponible: {startupUpdate.version}
              {startupInstall ? ` · ${startupInstall.message}` : ""}
              {startupInstall && typeof startupInstall.progress === "number" ? ` ${startupInstall.progress}%` : ""}
            </span>
            <Button size="sm" variant="primary" onClick={() => void installUpdate(startupUpdate)} loading={startupUpdateBusy}>
              Actualizar ahora
            </Button>
            <Button
              size="sm"
              onClick={() => {
                updateDismissed.current = true;
                setStartupUpdate(null);
              }}
              disabled={startupUpdateBusy}
            >
              Mas tarde
            </Button>
            </section>
          </div>
        )}

        {updateScreen.active && (
          <RoxwanaLoadingScreen
            state={updateScreen}
            onClose={
              updateScreen.error
                ? () => setUpdateScreen((current) => ({ ...current, active: false }))
                : undefined
            }
          />
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
