import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
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
  Eye,
  Layers3,
  LayoutGrid,
  LayoutList,
  LayoutPanelTop,
  Mic,
  Package,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import type { AppView } from "../../app/App";
import { Button, EmptyState, Panel, StatCard, StatusDot, Toggle } from "../../components/ui";
import {
  COLOR_CATALOG,
  GARMENT_TYPES,
  type AppSettings,
  type ProductDraft,
  type ProductVariant,
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

function formatDate(value: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function ProductBarcodePreview({ variant }: { variant?: ProductVariant }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !variant?.barcodeValue) return;
    JsBarcode(svgRef.current, variant.barcodeValue, {
      format: "CODE128",
      background: "#ffffff",
      lineColor: "#111111",
      width: 1.35,
      height: 62,
      margin: 10,
      displayValue: true,
      font: "monospace",
      fontSize: 12,
    });
  }, [variant?.barcodeValue]);

  if (!variant) {
    return (
      <div className="product-viewer__barcode-empty">
        <Barcode size={22} />
        <span>Sin variantes para mostrar codigo de barras.</span>
      </div>
    );
  }

  return (
    <div className="product-viewer__barcode-card">
      <div>
        <span className="eyebrow">Codigo de barras</span>
        <strong>{variant.sku}</strong>
        <small>
          {COLOR_CATALOG[variant.colorCode].name} / Talle {variant.sizeCode}
        </small>
      </div>
      <svg ref={svgRef} />
    </div>
  );
}

function ProductDetailModal({
  product,
  onClose,
  onEdit,
  onOpenFolder,
}: {
  product: ProductDraft;
  onClose: () => void;
  onEdit: (product: ProductDraft) => void;
  onOpenFolder?: (product: ProductDraft) => void | Promise<void>;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id || "");
  const [copied, setCopied] = useState("");
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) || product.variants[0];
  const cover = product.images[0];
  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);

  useEffect(() => {
    setSelectedVariantId(product.variants[0]?.id || "");
  }, [product.id, product.variants]);

  const copyText = (label: string, value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1600);
  };

  return (
    <div className="product-viewer-backdrop" onMouseDown={onClose}>
      <section className="product-viewer" onMouseDown={(event) => event.stopPropagation()}>
        <header className="product-viewer__header">
          <div>
            <span className="eyebrow">Ficha completa</span>
            <h2>{product.name || product.modelCode || "Producto sin nombre"}</h2>
            <p>{product.shortDescription || product.longDescription || "Sin descripcion cargada."}</p>
          </div>
          <div className="product-viewer__header-actions">
            {copied && <StatusDot status="success">{copied} copiado</StatusDot>}
            <Button size="sm" onClick={() => copyText("Codigo", product.modelCode)}>
              <Copy size={14} /> Codigo
            </Button>
            {onOpenFolder && (
              <Button size="sm" onClick={() => void onOpenFolder(product)}>
                <Folder size={14} /> Carpeta
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => onEdit(product)}>
              Editar <ArrowRight size={14} />
            </Button>
            <button type="button" className="product-viewer__close" onClick={onClose} title="Cerrar">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="product-viewer__body">
          <aside className="product-viewer__media">
            <div className="product-viewer__hero-image">
              {cover?.previewUrl ? (
                <img src={cover.previewUrl} alt={product.name || product.modelCode} />
              ) : (
                <div>
                  <span className="brand-word">RXW</span>
                  <small>PRODUCT STUDIO</small>
                </div>
              )}
              <StatusDot status={product.status === "draft" ? "warning" : "success"}>{product.status}</StatusDot>
            </div>
            <div className="product-viewer__gallery">
              {product.images.length ? (
                product.images.map((image) => (
                  <figure key={image.id}>
                    {image.previewUrl ? <img src={image.previewUrl} alt={image.role} /> : <PackageCheck size={18} />}
                    <figcaption>
                      <strong>{image.role}</strong>
                      <span>
                        {COLOR_CATALOG[image.colorCode].name} / {image.device}
                      </span>
                    </figcaption>
                  </figure>
                ))
              ) : (
                <div className="product-viewer__empty-gallery">Sin imagenes cargadas.</div>
              )}
            </div>
          </aside>

          <main className="product-viewer__content">
            <div className="product-viewer__summary">
              <div>
                <span>Precio</span>
                <strong>{formatPrice(product.price)}</strong>
              </div>
              <div>
                <span>Stock</span>
                <strong>{totalStock}</strong>
              </div>
              <div>
                <span>Variantes</span>
                <strong>{product.variants.length}</strong>
              </div>
              <div>
                <span>Actualizado</span>
                <strong>{formatDate(product.updatedAt)}</strong>
              </div>
            </div>

            <section className="product-viewer__section">
              <h3>Datos del producto</h3>
              <div className="product-viewer__facts">
                <span>
                  <small>Codigo</small>
                  {product.modelCode || "Sin codigo"}
                </span>
                <span>
                  <small>Prenda</small>
                  {product.garmentType ? GARMENT_TYPES[product.garmentType] : "Sin definir"}
                </span>
                <span>
                  <small>Categoria</small>
                  {product.category || "Sin categoria"}
                </span>
                <span>
                  <small>Genero</small>
                  {product.gender || "Sin definir"}
                </span>
                <span>
                  <small>Tecnica</small>
                  {product.technique || "Sin definir"}
                </span>
                <span>
                  <small>Material</small>
                  {product.material || "Sin material"}
                </span>
              </div>
              <div className="product-viewer__tags">
                {product.colors.map((color) => (
                  <span key={color}>
                    <i style={{ background: COLOR_CATALOG[color].hex }} />
                    {COLOR_CATALOG[color].name}
                  </span>
                ))}
                {product.sizes.map((size) => (
                  <span key={size}>{size}</span>
                ))}
                {product.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </section>

            <section className="product-viewer__section product-viewer__barcode-section">
              <div>
                <h3>Variantes y codigo de barras</h3>
                <div className="product-viewer__variant-list">
                  {product.variants.length ? (
                    product.variants.map((variant) => (
                      <button
                        type="button"
                        key={variant.id}
                        className={selectedVariant?.id === variant.id ? "active" : ""}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        <strong>
                          {COLOR_CATALOG[variant.colorCode].name} / {variant.sizeCode}
                        </strong>
                        <code>{variant.sku}</code>
                        <span>{variant.stock} unidades</span>
                      </button>
                    ))
                  ) : (
                    <p>Este producto todavia no tiene variantes.</p>
                  )}
                </div>
              </div>
              <div>
                <ProductBarcodePreview variant={selectedVariant} />
                {selectedVariant && (
                  <div className="product-viewer__barcode-actions">
                    <Button size="sm" onClick={() => copyText("SKU", selectedVariant.sku)}>
                      <Copy size={14} /> Copiar SKU
                    </Button>
                    <Button size="sm" onClick={() => copyText("Barras", selectedVariant.barcodeValue)}>
                      <Barcode size={14} /> Copiar barras
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <section className="product-viewer__section product-viewer__descriptions">
              <div>
                <h3>Descripcion</h3>
                <p>{product.longDescription || product.shortDescription || "Sin descripcion cargada."}</p>
              </div>
              <div>
                <h3>WhatsApp y notas</h3>
                <p>{product.whatsappText || product.notes || "Sin texto adicional."}</p>
              </div>
            </section>
          </main>
        </div>
      </section>
    </div>
  );
}

function DeleteProductDialog({
  product,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  product: ProductDraft;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = product.name || product.modelCode || "este producto";

  return (
    <div className="confirm-dialog-backdrop" onMouseDown={onCancel}>
      <section className="confirm-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-dialog__icon">
          <Trash2 size={24} />
        </div>
        <div>
          <span className="eyebrow">Eliminar producto</span>
          <h2>¿Seguro que querés eliminarlo?</h2>
          <p>
            Vas a quitar <strong>{label}</strong> de la base local. Sus SKU dejarán de estar reservados
            para este producto.
          </p>
          {product.modelCode && <code>{product.modelCode}</code>}
          {error && <div className="confirm-dialog__error">{error}</div>}
        </div>
        <footer>
          <Button onClick={onCancel} disabled={loading}>
            No, cancelar
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            <Trash2 size={15} /> Sí, eliminar
          </Button>
        </footer>
      </section>
    </div>
  );
}

type SearchViewMode = "cards" | "list" | "detail";

interface PinnedSearchProduct {
  product: ProductDraft;
  viewMode: SearchViewMode;
}

const SEARCH_PINNED_STORAGE_KEY = "roxwana.search.pinnedProducts";

function readPinnedSearchProducts(): PinnedSearchProduct[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SEARCH_PINNED_STORAGE_KEY) || "[]") as Array<
      PinnedSearchProduct | ProductDraft
    >;
    return stored
      .map((item) =>
        "product" in item
          ? item
          : {
              product: item,
              viewMode: "list" as SearchViewMode,
            },
      )
      .filter((item) => Boolean(item.product?.id));
  } catch {
    return [];
  }
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
              ["1", "Crear brief", "Prenda, diseño, talles, precio y stock desde Crear producto.", Package],
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
  const [productNotice, setProductNotice] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingFolderId, setOpeningFolderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductDraft | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const visible = products.filter((product) =>
    `${product.name} ${product.modelCode} ${product.status}`.toLowerCase().includes(filter.toLowerCase()),
  );

  const removeProduct = async (product: ProductDraft) => {
    setDeletingId(product.id);
    setDeleteError("");
    try {
      const result = await deleteProduct(product.id, product.modelCode);
      await onRefresh();
      setDeleteTarget(null);
      setProductNotice(
        result.folderDeleted
          ? `Producto eliminado: ${product.modelCode || product.name}`
          : `Producto eliminado de la base. Revisá la carpeta: ${result.folderError}`,
      );
      window.setTimeout(() => setProductNotice(""), result.folderDeleted ? 2200 : 6500);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "No pude eliminar el producto.",
      );
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
      <Button size="sm" onClick={() => setSelectedProduct(product)}>
        <Eye size={14} /> Ver
      </Button>
      <Button
        size="sm"
        variant="danger"
        loading={deletingId === product.id}
        onClick={() => {
          setDeleteError("");
          setDeleteTarget(product);
        }}
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
      {productNotice && (
        <div className="toast">
          <Trash2 size={17} />
          {productNotice}
        </div>
      )}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onOpenFolder={openFolder}
          onEdit={(product) => {
            setSelectedProduct(null);
            onOpen(product);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteProductDialog
          product={deleteTarget}
          loading={deletingId === deleteTarget.id}
          error={deleteError}
          onCancel={() => {
            if (!deletingId) {
              setDeleteTarget(null);
              setDeleteError("");
            }
          }}
          onConfirm={() => void removeProduct(deleteTarget)}
        />
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
  const [selectedProduct, setSelectedProduct] = useState<ProductDraft | null>(null);
  const [viewMode, setViewMode] = useState<SearchViewMode>("list");
  const [pinnedProducts, setPinnedProducts] = useState<PinnedSearchProduct[]>(readPinnedSearchProducts);
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

  useEffect(() => {
    sessionStorage.setItem(SEARCH_PINNED_STORAGE_KEY, JSON.stringify(pinnedProducts));
  }, [pinnedProducts]);

  const isPinned = (product: ProductDraft) => pinnedProducts.some((pinned) => pinned.product.id === product.id);

  const visibleResults = results.filter((product) => !isPinned(product));

  const togglePinned = (product: ProductDraft) => {
    setPinnedProducts((current) =>
      current.some((pinned) => pinned.product.id === product.id)
        ? current.filter((pinned) => pinned.product.id !== product.id)
        : [{ product, viewMode }, ...current],
    );
  };

  const editProduct = (product: ProductDraft) => {
    setSelectedProduct(null);
    onOpen(product);
  };

  return (
    <div className="page">
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onOpenFolder={async (product) => {
            await openProductPackageFolder(product.modelCode);
          }}
          onEdit={editProduct}
        />
      )}
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
      <div className="page-toolbar search-view-toolbar">
        <div className="view-switch" aria-label="Vista del buscador">
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
              onClick={() => setViewMode(mode as SearchViewMode)}
            >
              <Icon size={15} />
              <span>{label as string}</span>
            </button>
          ))}
        </div>
        <StatusDot status="neutral">
          {visibleResults.length} resultados · {pinnedProducts.length} anclados
        </StatusDot>
      </div>
      <Panel title="Resultados" eyebrow={query ? `Consulta: ${query}` : "Ingresá una consulta"}>
        {visibleResults.length ? (
          <div className={`search-results search-results--${viewMode}`}>
            {visibleResults.map((product) => (
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
                  <Button size="sm" onClick={() => setSelectedProduct(product)}>
                    <Eye size={14} /> Ver
                  </Button>
                  <Button size="sm" onClick={() => togglePinned(product)}>
                    {isPinned(product) ? <PinOff size={14} /> : <Pin size={14} />}
                    {isPinned(product) ? "Desanclar" : "Anclar"}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => editProduct(product)}>
                    Editar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title={query ? "Sin coincidencias" : "Empezá a escribir"}
            description={
              results.length
                ? "Los resultados de esta busqueda ya estan anclados abajo."
                : "El buscador consulta productos y variantes guardados localmente."
            }
          />
        )}
      </Panel>
      {pinnedProducts.length > 0 && (
        <Panel
          title="Anclados de trabajo"
          eyebrow={`${pinnedProducts.length} guardados hasta cerrar la app`}
          icon={<Pin size={18} />}
          className="pinned-products-panel"
        >
          <div className="pinned-products">
            {pinnedProducts.map(({ product, viewMode: pinnedViewMode }) => (
              <article className={`pinned-products__item pinned-products__item--${pinnedViewMode}`} key={product.id}>
                <span className="pinned-products__cover">
                  {product.images[0]?.previewUrl ? (
                    <img src={product.images[0].previewUrl} alt="" />
                  ) : (
                    <PackageCheck size={22} />
                  )}
                </span>
                <div>
                  <h3>{product.name || product.modelCode}</h3>
                  <code>{product.modelCode}</code>
                  {pinnedViewMode !== "cards" && (
                    <p>{product.shortDescription || product.longDescription || "Sin descripcion todavia."}</p>
                  )}
                  <div className="pinned-products__meta">
                    <span>{product.variants.length} variantes</span>
                    <span>{formatPrice(product.price)}</span>
                    {pinnedViewMode === "detail" && <span>{product.sizes.join(", ") || "Sin talles"}</span>}
                  </div>
                </div>
                <div className="pinned-products__actions">
                  <Button size="sm" onClick={() => setSelectedProduct(product)}>
                    <Eye size={14} /> Ver
                  </Button>
                  <Button size="sm" onClick={() => editProduct(product)}>
                    Editar <ArrowRight size={14} />
                  </Button>
                  <Button size="sm" onClick={() => togglePinned(product)}>
                    <PinOff size={14} /> Desanclar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}
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
          <Panel title="Crear producto" eyebrow="Interfaz" icon={<PackagePlus size={18} />}>
            <div className="settings-fields">
              <div className="settings-toggle-row">
                <span>
                  <strong>Mostrar nombres en botones</strong>
                  <small>En la cabecera de imágenes: administrar, agregar imágenes y trabajos para impresión.</small>
                </span>
                <Toggle
                  checked={form.creatorActionLabels}
                  onChange={(checked) =>
                    setForm((current) => ({ ...current, creatorActionLabels: checked }))
                  }
                />
              </div>
              <p className="settings-note">
                Apagado muestra solo íconos para dejar más lugar a la carga de imágenes.
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
