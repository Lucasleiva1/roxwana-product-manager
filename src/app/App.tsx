import { useEffect, useState } from "react";
import {
  Archive,
  Barcode,
  Boxes,
  ChevronDown,
  FileOutput,
  FolderClock,
  Gauge,
  History,
  Image,
  Menu,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  X,
} from "lucide-react";
import { initializeDesktop, listProducts } from "../services/desktopService";
import { useProductStore } from "../store/useProductStore";
import type { ProductDraft } from "../types/product";
import Studio from "../features/studio/Studio";
import {
  BarcodeView,
  DashboardView,
  ExportView,
  HistoryView,
  ImagesView,
  ProductsView,
  SearchView,
  SettingsView,
} from "../features/views/AppViews";

export type AppView =
  | "dashboard"
  | "studio"
  | "products"
  | "search"
  | "images"
  | "barcodes"
  | "export"
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
  { id: "images", label: "Imágenes", icon: Image },
  { id: "barcodes", label: "Códigos de barras", icon: Barcode },
  { id: "export", label: "Exportar ficha", icon: FileOutput },
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
  const setDraft = useProductStore((state) => state.setDraft);
  const draft = useProductStore((state) => state.draft);

  const refreshProducts = async () => {
    const next = await listProducts();
    setProducts(next);
  };

  useEffect(() => {
    initializeDesktop()
      .then((result) => setAppMode("mode" in result ? result.mode : "desktop"))
      .catch(() => setAppMode("browser"));
    void refreshProducts();
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("roxwana-sidebar-collapsed", String(next));
      return next;
    });
  };

  const openProduct = (product: ProductDraft) => {
    setDraft(product);
    setView("studio");
  };

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <DashboardView products={products} onNavigate={setView} />;
      case "studio":
        return <Studio onSaved={refreshProducts} onNavigate={setView} appMode={appMode} />;
      case "products":
        return <ProductsView products={products} onOpen={openProduct} onRefresh={refreshProducts} />;
      case "search":
        return <SearchView onOpen={openProduct} />;
      case "images":
        return <ImagesView />;
      case "barcodes":
        return <BarcodeView />;
      case "export":
        return <ExportView appMode={appMode} />;
      case "history":
        return <HistoryView products={products} onOpen={openProduct} />;
      case "settings":
        return <SettingsView appMode={appMode} />;
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
                  setView(item.id);
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

        <div className="workspace__content" key={view}>
          {renderView()}
        </div>

        <footer className="app-statusbar">
          <span>
            <i className={appMode === "desktop" ? "online" : "warning"} />
            {appMode === "desktop" ? "SQLite local activo" : "Modo navegador · datos locales"}
          </span>
          <span className="statusbar-model">{draft.modelCode}</span>
          <span>
            <Archive size={14} /> Sin Supabase
          </span>
          <span>
            <FolderClock size={14} /> Guardado local
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
