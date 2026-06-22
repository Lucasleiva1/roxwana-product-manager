import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Barcode,
  Bell,
  Boxes,
  ChevronDown,
  FileOutput,
  FolderClock,
  Gauge,
  History,
  Image,
  Menu,
  PackagePlus,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { initializeDesktop, listProducts } from "../services/desktopService";
import { useProductStore } from "../store/useProductStore";
import type { ProductDraft } from "../types/product";
import Studio from "../features/studio/Studio";
import {
  BarcodeView,
  DashboardView,
  DescriptionsView,
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
  | "descriptions"
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
  { id: "descriptions", label: "Descripciones IA", icon: Sparkles },
  { id: "barcodes", label: "Códigos de barras", icon: Barcode },
  { id: "export", label: "Exportar ficha", icon: FileOutput },
  { id: "history", label: "Historial", icon: History },
  { id: "settings", label: "Ajustes", icon: Settings },
];

function App() {
  const [view, setView] = useState<AppView>("studio");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
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

  const filteredQuickResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const query = globalSearch.toLowerCase();
    return products
      .filter((product) =>
        [product.name, product.modelCode, ...product.variants.map((variant) => variant.sku)]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 5);
  }, [globalSearch, products]);

  const openProduct = (product: ProductDraft) => {
    setDraft(product);
    setView("studio");
    setGlobalSearch("");
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
      case "descriptions":
        return <DescriptionsView />;
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
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <button className="icon-button sidebar__close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
          <span className="brand-word">ROXWANA</span>
          <span className="brand-subtitle">Product Manager</span>
        </div>

        <nav className="sidebar__nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
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
          <div>
            <strong>Roxwana Team</strong>
            <small>Admin · {appMode === "desktop" ? "Local" : "Demo web"}</small>
          </div>
          <ChevronDown size={15} />
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button topbar__menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar__mobile-brand">
            <span className="brand-word">ROXWANA</span>
          </div>
          <div className="global-search">
            <Search size={17} />
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && globalSearch) setView("search");
              }}
              placeholder="Buscar productos, SKUs, modelos..."
            />
            <kbd>Ctrl + K</kbd>
            {filteredQuickResults.length > 0 && (
              <div className="global-search__results">
                {filteredQuickResults.map((product) => (
                  <button key={product.id} onClick={() => openProduct(product)}>
                    <span>
                      <strong>{product.name}</strong>
                      <small>{product.modelCode}</small>
                    </span>
                    <PackagePlus size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar__actions">
            <button className="icon-button">
              <Bell size={18} />
            </button>
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
