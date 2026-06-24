import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Box,
  CloudCog,
  Copy,
  Database,
  FileCheck2,
  FileOutput,
  Folder,
  Layers3,
  LayoutGrid,
  LayoutList,
  LayoutPanelTop,
  Mic,
  Package,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type { AppView } from "../../app/App";
import { Button, EmptyState, Panel, StatCard, StatusDot } from "../../components/ui";
import {
  COLOR_CATALOG,
  type AppSettings,
  type ProductDraft,
} from "../../types/product";
import { useProductStore } from "../../store/useProductStore";
import {
  deleteProduct,
  openProductPackageFolder,
  searchProducts,
} from "../../services/desktopService";
import {
  checkOllamaStatus,
  RECOMMENDED_OLLAMA_MODELS,
} from "../../services/ollamaService";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function DashboardView({
  products,
  onNavigate,
}: {
  products: ProductDraft[];
  onNavigate: (view: AppView) => void;
}) {
  const stock = products.reduce(
    (sum, product) => sum + product.variants.reduce((inner, variant) => inner + variant.stock, 0),
    0,
  );
  const drafts = products.filter((product) => product.status === "draft").length;
  const ready = products.filter(
    (product) => product.status !== "draft" && product.variants.some((variant) => variant.stock > 0),
  ).length;
  const withoutStock = products.filter((product) => product.variants.every((variant) => !variant.stock)).length;
  const recentProducts = [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const attentionProducts = products
    .filter((product) => product.status === "draft" || product.variants.every((variant) => !variant.stock))
    .slice(0, 5);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Resumen local</span>
          <h1>Dashboard</h1>
          <p>Accesos rapidos al flujo actual: crear, editar, revisar ficha y preparar etiquetas.</p>
        </div>
        <div className="dashboard-heading-actions">
          <Button onClick={() => onNavigate("products")}>
            <LayoutGrid size={16} /> Ver productos
          </Button>
          <Button variant="primary" onClick={() => onNavigate("studio")}>
            <PackagePlus size={17} /> Nuevo producto
          </Button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Productos" value={products.length} note="Guardados en esta base" icon={<Box />} />
        <StatCard label="Borradores" value={drafts} note="Listos para continuar" icon={<FileOutput />} tone="blue" />
        <StatCard label="Stock total" value={stock} note="Unidades registradas" icon={<Database />} tone="green" />
        <StatCard label="Sin stock" value={withoutStock} note="Revisar antes de publicar" icon={<AlertTriangle />} tone="orange" />
      </div>

      <div className="quick-action-grid">
        <button type="button" onClick={() => onNavigate("studio")}>
          <PackagePlus size={20} />
          <span>
            <strong>Crear producto</strong>
            <small>Brief, datos, SKU y stock</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => onNavigate("products")}>
          <LayoutList size={20} />
          <span>
            <strong>Gestionar productos</strong>
            <small>Tarjetas, lista, detalle y copiar codigo</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => onNavigate("search")}>
          <Search size={20} />
          <span>
            <strong>Buscar por SKU</strong>
            <small>Modelo, talle, color o texto</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => onNavigate("history")}>
          <PackageCheck size={20} />
          <span>
            <strong>Ver historial</strong>
            <small>Ultimas fichas editadas</small>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="dashboard-grid dashboard-grid--updated">
        <Panel title="Continuar productos" eyebrow="Recientes" icon={<PackageOpen size={18} />}>
          {recentProducts.length ? (
            <div className="dashboard-product-list">
              {recentProducts.map((product) => (
                <button type="button" key={product.id} onClick={() => onNavigate("products")}>
                  <span className="product-thumb">
                    {(product.name || product.modelCode || "RX").slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{product.name || "Producto sin nombre"}</strong>
                    <small>{product.modelCode || "Codigo pendiente"}</small>
                  </div>
                  <StatusDot status={product.status === "draft" ? "warning" : "success"}>
                    {product.status}
                  </StatusDot>
                  <strong>{formatPrice(product.price)}</strong>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<PackagePlus />}
              title="Todavia no hay productos guardados"
              description="El primer borrador esta listo en Crear producto."
              action={<Button onClick={() => onNavigate("studio")}>Abrir estudio</Button>}
            />
          )}
        </Panel>

        <Panel title="Atencion rapida" eyebrow={`${attentionProducts.length} pendientes`} icon={<AlertTriangle size={18} />}>
          {attentionProducts.length ? (
            <div className="attention-list">
              {attentionProducts.map((product) => (
                <button type="button" key={product.id} onClick={() => onNavigate("products")}>
                  <span>
                    <strong>{product.name || product.modelCode || "Producto sin nombre"}</strong>
                    <small>
                      {product.status === "draft" ? "Borrador" : "Sin stock cargado"} - {product.modelCode || "Sin codigo"}
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<PackageCheck />}
              title="Sin pendientes urgentes"
              description="Los productos guardados tienen stock o ya salieron de borrador."
            />
          )}
        </Panel>

        <Panel title="Flujo actualizado" eyebrow={`${ready} productos activos`} icon={<Layers3 size={18} />}>
          <div className="workflow-list workflow-list--current">
            {[
              ["1", "Crear brief", "Prenda, dise�o, talles, precio y stock desde Crear producto.", Package],
              ["2", "Revisar SKU", "El codigo y las variantes quedan en el bloque SKU y codigo de barras.", Barcode],
              ["3", "Cargar imagenes", "Portada, hover, espalda y detalles dentro de la ficha.", PackageOpen],
              ["4", "Vista previa", "Imprimir, copiar, guardar TXT/JSON y crear carpeta desde la vista previa.", FileCheck2],
              ["5", "Etiqueta", "Abrir Ver etiqueta para imprimir o guardar SVG + PNG por variante.", LayoutPanelTop],
            ].map(([number, title, description, Icon]) => (
              <div key={number as string}>
                <span>{number as string}</span>
                <div>
                  <Icon size={15} />
                  <strong>{title as string}</strong>
                  <small>{description as string}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
export function ProductsView({
  products,
  onOpen,
  onRefresh,
}: {
  products: ProductDraft[];
  onOpen: (product: ProductDraft) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list" | "detail">("cards");
  const [copiedCode, setCopiedCode] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingFolderId, setOpeningFolderId] = useState<string | null>(null);
  const visible = products.filter((product) =>
    `${product.name} ${product.modelCode} ${product.status}`.toLowerCase().includes(filter.toLowerCase()),
  );

  const removeProduct = async (product: ProductDraft) => {
    if (
      !window.confirm(
        `¿Eliminar "${product.name || product.modelCode}"? Sus SKU dejarán de estar reservados en la base.`,
      )
    ) {
      return;
    }
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      await onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const openFolder = async (product: ProductDraft) => {
    setOpeningFolderId(product.id);
    try {
      await openProductPackageFolder(product.modelCode);
    } finally {
      setOpeningFolderId(null);
    }
  };

  const totalStock = (product: ProductDraft) =>
    product.variants.reduce((sum, variant) => sum + variant.stock, 0);

  const productCover = (product: ProductDraft) => (
    <div className="product-card__cover">
      {product.images[0]?.previewUrl ? (
        <img src={product.images[0].previewUrl} alt={product.name} />
      ) : (
        <>
          <span className="brand-word">RXW</span>
          <small>PRODUCT STUDIO</small>
        </>
      )}
      <StatusDot status={product.status === "draft" ? "warning" : "success"}>
        {product.status}
      </StatusDot>
    </div>
  );

  const productActions = (product: ProductDraft) => (
    <div className="product-actions">
      <Button
        size="sm"
        variant="danger"
        loading={deletingId === product.id}
        onClick={() => void removeProduct(product)}
      >
        <Trash2 size={14} /> Eliminar
      </Button>
      <Button
        size="sm"
        loading={openingFolderId === product.id}
        onClick={() => void openFolder(product)}
      >
        <Folder size={14} /> Carpeta
      </Button>
      <Button size="sm" variant="primary" onClick={() => onOpen(product)}>
        Editar <ArrowRight size={14} />
      </Button>
    </div>
  );

  const copyProductCode = (code: string) => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((current) => (current === code ? "" : current)), 1800);
  };

  const productCode = (product: ProductDraft) => (
    <div className="product-code-copy">
      <code>{product.modelCode || "Sin codigo"}</code>
      <button
        type="button"
        onClick={() => copyProductCode(product.modelCode)}
        disabled={!product.modelCode}
        title="Copiar codigo"
        aria-label={`Copiar codigo ${product.modelCode || "del producto"}`}
      >
        <Copy size={13} />
      </button>
    </div>
  );

  return (
    <div className="page">
      {copiedCode && (
        <div className="toast">
          <Copy size={17} />
          Codigo copiado: {copiedCode}
        </div>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Base local</span>
          <h1>Productos</h1>
          <p>Todos los modelos, variantes y estados de ROXWANA.</p>
        </div>
        <Button onClick={() => void onRefresh()}>
          <RefreshCw size={16} /> Actualizar
        </Button>
      </div>
      <div className="page-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar por nombre, modelo o estado..."
          />
        </div>
        <div className="view-switch" aria-label="Vista de productos">
          {[
            ["cards", LayoutGrid, "Tarjetas"],
            ["list", LayoutList, "Lista"],
            ["detail", LayoutPanelTop, "Detalle"],
          ].map(([mode, Icon, label]) => (
            <button
              type="button"
              key={mode as string}
              className={viewMode === mode ? "active" : ""}
              title={label as string}
              onClick={() => setViewMode(mode as "cards" | "list" | "detail")}
            >
              <Icon size={15} />
              <span>{label as string}</span>
            </button>
          ))}
        </div>
        <StatusDot status="neutral">{visible.length} resultados</StatusDot>
      </div>
      {visible.length ? (
        <div className={`product-grid product-grid--${viewMode}`}>
          {visible.map((product) => (
            <article className="product-card" key={product.id}>
              {productCover(product)}
              <div className="product-card__body">
                <span className="eyebrow">{product.category}</span>
                <h3>{product.name}</h3>
                {productCode(product)}
                {viewMode === "detail" && (
                  <p className="product-card__description">
                    {product.shortDescription || product.longDescription || "Sin descripción todavía."}
                  </p>
                )}
                <div className="product-card__meta">
                  <span>{product.variants.length} variantes</span>
                  <span>{totalStock(product)} unidades</span>
                  {viewMode === "detail" && (
                    <>
                      <span>{product.colors.length} colores</span>
                      <span>{product.sizes.join(", ") || "Sin talles"}</span>
                    </>
                  )}
                </div>
                <div className="product-card__footer">
                  <strong>{formatPrice(product.price)}</strong>
                  {productActions(product)}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<PackageOpen />}
          title="No hay productos para mostrar"
          description="Guardá un borrador desde Crear producto o cambiá el filtro."
        />
      )}
    </div>
  );
}

export function SearchView({ onOpen }: { onOpen: (product: ProductDraft) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const searchRequest = useRef(0);

  const runSearch = async () => {
    const requestId = ++searchRequest.current;
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const next = await searchProducts(normalized);
    if (requestId === searchRequest.current) {
      setResults(next);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!query.trim()) {
      searchRequest.current += 1;
      setResults([]);
      setBusy(false);
      return;
    }
    const timer = window.setTimeout(() => void runSearch(), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Índice de inventario</span>
          <h1>Buscador universal</h1>
          <p>Encontrá por SKU, modelo, nombre, color, talle, técnica o texto.</p>
        </div>
      </div>
      <div className="hero-search">
        <Search size={24} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ejemplo: RXW-REM-SRK004-NEG-M"
          autoFocus
        />
        <Button variant="primary" loading={busy} disabled={!query.trim()} onClick={runSearch}>
          Buscar
        </Button>
      </div>
      <Panel title="Resultados" eyebrow={query ? `Consulta: ${query}` : "Ingresá una consulta"}>
        {results.length ? (
          <div className="search-results">
            {results.map((product) => (
              <article key={product.id}>
                <span className="search-result__cover">
                  {product.images[0]?.previewUrl ? (
                    <img src={product.images[0].previewUrl} alt="" />
                  ) : (
                    <PackageCheck size={24} />
                  )}
                </span>
                <div>
                  <h3>{product.name}</h3>
                  <code>{product.modelCode}</code>
                  <p>{product.shortDescription || "Sin descripción todavía."}</p>
                  <div>
                    {product.colors.map((color) => (
                      <span className="mini-tag" key={color}>
                        {COLOR_CATALOG[color].name}
                      </span>
                    ))}
                    {product.sizes.map((size) => (
                      <span className="mini-tag" key={size}>
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="search-result__actions">
                  <strong>{formatPrice(product.price)}</strong>
                  <Button variant="primary" onClick={() => onOpen(product)}>
                    Editar producto
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title={query ? "Sin coincidencias" : "Empezá a escribir"}
            description="El buscador consulta productos y variantes guardados localmente."
          />
        )}
      </Panel>
    </div>
  );
}

export function HistoryView({
  products,
  onOpen,
}: {
  products: ProductDraft[];
  onOpen: (product: ProductDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "no_stock" | "active">("all");
  const [copiedCode, setCopiedCode] = useState("");

  const totalStock = (product: ProductDraft) =>
    product.variants.reduce((sum, variant) => sum + variant.stock, 0);

  const timeline = [...products]
    .filter((product) => {
      if (filter === "draft" && product.status !== "draft") return false;
      if (filter === "no_stock" && totalStock(product) > 0) return false;
      if (filter === "active" && (product.status === "draft" || totalStock(product) <= 0)) return false;
      const haystack = `${product.name} ${product.modelCode} ${product.status} ${product.category}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const copyCode = (code: string) => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((current) => (current === code ? "" : current)), 1800);
  };

  const filterOptions = [
    ["all", "Todos", products.length],
    ["draft", "Borradores", products.filter((product) => product.status === "draft").length],
    ["no_stock", "Sin stock", products.filter((product) => totalStock(product) <= 0).length],
    ["active", "Activos", products.filter((product) => product.status !== "draft" && totalStock(product) > 0).length],
  ] as const;

  return (
    <div className="page">
      {copiedCode && (
        <div className="toast">
          <Copy size={17} />
          Codigo copiado: {copiedCode}
        </div>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Registro local</span>
          <h1>Historial</h1>
          <p>Actividad reciente, recuperacion rapida y seguimiento de productos guardados.</p>
        </div>
        <Button variant="primary" onClick={() => onOpen(timeline[0])} disabled={!timeline.length}>
          <ArrowRight size={16} /> Abrir ultimo
        </Button>
      </div>

      <div className="history-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por nombre, codigo, estado o categoria..."
          />
        </div>
        <div className="history-filter-tabs" aria-label="Filtros de historial">
          {filterOptions.map(([id, label, count]) => (
            <button
              type="button"
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </div>

      <Panel title="Actividad de productos" eyebrow={`${timeline.length} resultados`} icon={<Database size={18} />}>
        {timeline.length ? (
          <div className="history-list">
            {timeline.map((product) => {
              const stock = totalStock(product);
              return (
                <article key={product.id} className="history-item">
                  <div className="history-item__mark">
                    <i className={stock <= 0 ? "warning" : product.status === "draft" ? "draft" : "ready"} />
                  </div>
                  <div className="history-item__main">
                    <div className="history-item__title">
                      <span>
                        <strong>{product.name || "Producto sin nombre"}</strong>
                        <small>Modificado {new Date(product.updatedAt).toLocaleString("es-AR")}</small>
                      </span>
                      <StatusDot status={product.status === "draft" ? "warning" : stock <= 0 ? "danger" : "success"}>
                        {stock <= 0 ? "sin stock" : product.status}
                      </StatusDot>
                    </div>
                    <div className="history-code-row">
                      <code>{product.modelCode || "Codigo pendiente"}</code>
                      <button
                        type="button"
                        onClick={() => copyCode(product.modelCode)}
                        disabled={!product.modelCode}
                        title="Copiar codigo"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                    <div className="history-meta">
                      <span>{formatPrice(product.price)}</span>
                      <span>{product.variants.length} variantes</span>
                      <span>{stock} unidades</span>
                      <span>{product.colors.length} colores</span>
                      <span>Creado {new Date(product.createdAt).toLocaleDateString("es-AR")}</span>
                    </div>
                  </div>
                  <div className="history-item__actions">
                    <Button size="sm" onClick={() => onOpen(product)}>
                      Editar <ArrowRight size={14} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Database />}
            title={products.length ? "Sin coincidencias" : "Historial vacio"}
            description={products.length ? "Cambia el filtro o la busqueda para ver mas actividad." : "Los productos guardados apareceran aca."}
          />
        )}
      </Panel>
    </div>
  );
}
export function SettingsView({ appMode }: { appMode: "desktop" | "browser" }) {
  const { settings, setSettings } = useProductStore();
  const [form, setForm] = useState<AppSettings>(settings);
  const [ollama, setOllama] = useState<{ connected: boolean; models: string[] }>({
    connected: false,
    models: [],
  });
  const [saved, setSaved] = useState(false);
  const selectableModels = useMemo(() => {
    const names = new Set([...ollama.models, ...RECOMMENDED_OLLAMA_MODELS.map((model) => model.name)]);
    return [...names];
  }, [ollama.models]);

  const modelLabel = (name: string) => {
    const known = RECOMMENDED_OLLAMA_MODELS.find((model) => model.name === name);
    if (!known) return name;
    return `${known.label} · ${known.kind === "cloud" ? "Cloud" : "Local"}`;
  };

  const testOllama = async () => {
    const status = await checkOllamaStatus(form.ollamaEndpoint);
    setOllama({ connected: status.connected, models: status.models });
    if (status.connected && !form.ollamaModel && status.models[0]) {
      setForm((current) => ({ ...current, ollamaModel: status.models[0] }));
    }
  };

  useEffect(() => {
    void testOllama();
  }, []);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Comportamiento e integraciones</span>
          <h1>Ajustes</h1>
          <p>Acá vive la lógica editable del asistente y la conexión con Ollama.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setSettings(form);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          }}
        >
          <FileCheck2 size={17} /> {saved ? "Guardado" : "Guardar ajustes"}
        </Button>
      </div>
      <div className="settings-grid">
        <Panel
          title="Instrucciones del asistente"
          eyebrow="Prompt editable"
          icon={<WandSparkles size={18} />}
        >
          <p className="panel-intro">
            Estas reglas se aplican al extraer datos, preguntar faltantes y generar textos.
          </p>
          <textarea
            className="instruction-editor"
            value={form.assistantInstructions}
            onChange={(event) =>
              setForm((current) => ({ ...current, assistantInstructions: event.target.value }))
            }
          />
        </Panel>
        <div className="settings-side">
          <Panel title="Ollama local" eyebrow="IA privada" icon={<Sparkles size={18} />}>
            <div className="settings-fields">
              <label>
                <span>Endpoint</span>
                <input
                  value={form.ollamaEndpoint}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ollamaEndpoint: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Modelo</span>
                {selectableModels.length ? (
                  <select
                    value={form.ollamaModel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, ollamaModel: event.target.value }))
                    }
                  >
                    <option value="">Elegir modelo</option>
                    {selectableModels.map((model) => (
                      <option key={model} value={model}>
                        {modelLabel(model)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.ollamaModel}
                    placeholder="Ej: llama3.2:3b"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, ollamaModel: event.target.value }))
                    }
                  />
                )}
              </label>
              <Button onClick={testOllama}>
                <RefreshCw size={15} /> Probar conexión
              </Button>
              <StatusDot status={ollama.connected ? "success" : "warning"}>
                {ollama.connected ? `${ollama.models.length} modelos disponibles` : "Ollama no detectado"}
              </StatusDot>
              <div className="model-catalog">
                {RECOMMENDED_OLLAMA_MODELS.map((model) => (
                  <button
                    type="button"
                    className={form.ollamaModel === model.name ? "active" : ""}
                    key={model.name}
                    onClick={() => setForm((current) => ({ ...current, ollamaModel: model.name }))}
                  >
                    <span>
                      <strong>{model.label}</strong>
                      <small>{model.kind === "cloud" ? "Ollama Cloud" : "Instalado localmente"}</small>
                    </span>
                    <StatusDot status={ollama.models.includes(model.name) ? "success" : "warning"}>
                      {ollama.models.includes(model.name) ? "Disponible" : "No detectado"}
                    </StatusDot>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Voz local" eyebrow="Whisper" icon={<Mic size={18} />}>
            <div className="settings-fields">
              <div className="field-row">
                <label>
                  <span>Modelo</span>
                  <select
                    value={form.whisperModel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, whisperModel: event.target.value }))
                    }
                  >
                    <option value="base-q5_1">Base multilingüe · incluido</option>
                  </select>
                </label>
                <label>
                  <span>Idioma</span>
                  <select
                    value={form.whisperLanguage}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, whisperLanguage: event.target.value }))
                    }
                  >
                    <option value="es">Español</option>
                    <option value="">Automático</option>
                  </select>
                </label>
              </div>
              <StatusDot status={appMode === "desktop" ? "success" : "warning"}>
                {appMode === "desktop"
                  ? "Motor Whisper propio incluido"
                  : "Motor local disponible para pruebas"}
              </StatusDot>
              <p className="settings-note">
                ROXWANA incluye su propio whisper.cpp y el modelo multilingüe. No usa Python,
                tu traductor ni servicios de voz externos.
              </p>
            </div>
          </Panel>
          <Panel title="Conexiones y herramientas" eyebrow="Avanzado" icon={<Settings2 size={18} />}>
            <div className="tool-cards">
              <div>
                <Database size={20} />
                <span>
                  <strong>SQLite local</strong>
                  <small>{appMode === "desktop" ? "Conectado" : "Vista web"}</small>
                </span>
              </div>
              <div>
                <Sparkles size={20} />
                <span>
                  <strong>Ollama</strong>
                  <small>{ollama.connected ? "Conectado" : "No detectado"}</small>
                </span>
              </div>
              <div>
                <Folder size={20} />
                <span>
                  <strong>Carpetas locales</strong>
                  <small>{form.productRoot}</small>
                </span>
              </div>
              <div>
                <CloudCog size={20} />
                <span>
                  <strong>MCP / agentes</strong>
                  <small>Preparado para futuras conexiones</small>
                </span>
              </div>
            </div>
          </Panel>
          <Panel title="Almacenamiento" eyebrow="Solo local" icon={<Database size={18} />}>
            <div className="settings-fields">
              <label>
                <span>Carpeta raíz de productos</span>
                <input
                  value={form.productRoot}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, productRoot: event.target.value }))
                  }
                />
              </label>
              <StatusDot status={appMode === "desktop" ? "success" : "warning"}>
                {appMode === "desktop" ? "Tauri + SQLite activo" : "Vista web con localStorage"}
              </StatusDot>
              <p className="settings-note">Supabase está desactivado intencionalmente en V1.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
