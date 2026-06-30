import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import JsBarcode from "jsbarcode";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Box,
  CloudCog,
  CloudDownload,
  CloudUpload,
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
  type ProductImage,
  type ProductDraft,
  type ProductVariant,
} from "../../types/product";
import { useProductStore } from "../../store/useProductStore";
import {
  deleteProduct,
  listProducts,
  openProductPackageFolder,
  restartApp,
  saveProduct,
  searchProducts,
} from "../../services/desktopService";
import {
  formatBackupDate,
  formatBackupSize,
  getBackupStatus,
  restoreBackup,
  runBackup,
  latestProductChange,
  type BackupStatus,
} from "../../services/backupService";
import {
  formatStockQuantity,
  formatStockSummary,
  hasDefinedStock,
  hasSellableVariants,
  totalDefinedStock,
} from "../../lib/productLogic";
import {
  checkOllamaStatus,
  RECOMMENDED_OLLAMA_MODELS,
} from "../../services/ollamaService";
import {
  checkForUpdates,
  getInstalledVersion,
  type UpdateCheckResult,
  type UpdateInstallStatus,
} from "../../services/updateService";

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

function coverImage(product: ProductDraft) {
  const isCover = (image: ProductDraft["images"][number]) => image.imageNumber === 1 || image.role === "portada";
  return (
    product.images.find((image) => isCover(image) && image.previewUrl) ??
    product.images.find((image) => image.previewUrl) ??
    product.images.find(isCover) ??
    product.images[0]
  );
}

function imageMimeType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "avif") return "image/avif";
  return "image/webp";
}

function fileUriFromPath(path?: string) {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return `file:///${encodeURI(normalized)}`;
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function imageFilename(product: ProductDraft, image?: ProductImage) {
  return image?.finalFilename || image?.originalName || `${product.modelCode || product.name || "portada"}.webp`;
}

const PUBLICATION_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "web", label: "Web" },
] as const;

type PublicationFilter = "all" | "missingWeb" | "missingWhatsapp" | "missingBoth" | "missingAny";

const PUBLICATION_FILTERS: Array<{ id: PublicationFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "missingWeb", label: "Falta Web" },
  { id: "missingWhatsapp", label: "Falta WhatsApp" },
  { id: "missingBoth", label: "Falta ambos" },
  { id: "missingAny", label: "Falta alguno" },
];

function publicationStatus(product: ProductDraft) {
  return {
    whatsapp: Boolean(product.publication?.whatsapp),
    web: Boolean(product.publication?.web),
  };
}

function matchesPublicationFilter(product: ProductDraft, filter: PublicationFilter) {
  const publication = publicationStatus(product);
  if (filter === "missingWeb") return !publication.web;
  if (filter === "missingWhatsapp") return !publication.whatsapp;
  if (filter === "missingBoth") return !publication.web && !publication.whatsapp;
  if (filter === "missingAny") return !publication.web || !publication.whatsapp;
  return true;
}

function PublicationFilterTabs({
  value,
  onChange,
  products,
}: {
  value: PublicationFilter;
  onChange: (value: PublicationFilter) => void;
  products: ProductDraft[];
}) {
  return (
    <div className="publication-filter-tabs" aria-label="Filtros de publicacion">
      {PUBLICATION_FILTERS.map((filter) => (
        <button
          type="button"
          key={filter.id}
          className={value === filter.id ? "active" : ""}
          onClick={() => onChange(filter.id)}
        >
          <span>{filter.label}</span>
          <strong>{products.filter((product) => matchesPublicationFilter(product, filter.id)).length}</strong>
        </button>
      ))}
    </div>
  );
}

function PublicationBadges({ product }: { product: ProductDraft }) {
  const publication = publicationStatus(product);
  return (
    <div className="publication-badges" aria-label="Estado de publicacion">
      {PUBLICATION_CHANNELS.map((channel) => {
        const active = publication[channel.id];
        return (
          <span
            key={channel.id}
            className={`publication-badge ${active ? "publication-badge--active" : ""}`}
            title={active ? `Publicado en ${channel.label}` : `No publicado en ${channel.label}`}
          >
            {channel.label}
          </span>
        );
      })}
    </div>
  );
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
  onProductUpdated,
}: {
  product: ProductDraft;
  onClose: () => void;
  onEdit: (product: ProductDraft) => void;
  onOpenFolder?: (product: ProductDraft) => void | Promise<void>;
  onProductUpdated?: (product: ProductDraft) => void | Promise<void>;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id || "");
  const [copied, setCopied] = useState("");
  const [publicationBusy, setPublicationBusy] = useState<"whatsapp" | "web" | "">("");
  const [publicationMessage, setPublicationMessage] = useState("");
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) || product.variants[0];
  const cover = coverImage(product);
  const stockSummary = formatStockSummary(product);
  const publication = publicationStatus(product);

  useEffect(() => {
    setSelectedVariantId(product.variants[0]?.id || "");
  }, [product.id, product.variants]);

  const copyText = (label: string, value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1600);
  };

  const togglePublication = async (channel: "whatsapp" | "web", checked: boolean) => {
    if (!onProductUpdated || publicationBusy) return;
    const updated: ProductDraft = {
      ...product,
      publication: {
        ...publication,
        [channel]: checked,
      },
      updatedAt: new Date().toISOString(),
    };
    setPublicationBusy(channel);
    setPublicationMessage("");
    try {
      await onProductUpdated(updated);
      setPublicationMessage(`${channel === "whatsapp" ? "WhatsApp" : "Web"} actualizado`);
      window.setTimeout(() => setPublicationMessage(""), 1800);
    } catch (error) {
      setPublicationMessage(error instanceof Error ? error.message : "No pude guardar el estado.");
    } finally {
      setPublicationBusy("");
    }
  };

  return (
    <div className="product-viewer-backdrop" onMouseDown={onClose}>
      <section className="product-viewer" onMouseDown={(event) => event.stopPropagation()}>
        <header className="product-viewer__header">
          <div>
            <span className="eyebrow">Ficha completa</span>
            <h2>{product.name || product.modelCode || "Producto sin nombre"}</h2>
            <p>{product.shortDescription || product.longDescription || "Sin descripcion cargada."}</p>
            <PublicationBadges product={product} />
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
                <strong>{stockSummary}</strong>
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

            <section className="product-viewer__section">
              <h3>Publicacion</h3>
              <div className="product-viewer__publication">
                {PUBLICATION_CHANNELS.map((channel) => {
                  const active = publication[channel.id];
                  return (
                    <button
                      type="button"
                      key={channel.id}
                      className={`publication-toggle ${active ? "publication-toggle--active" : ""}`}
                      onClick={() => void togglePublication(channel.id, !active)}
                      disabled={Boolean(publicationBusy)}
                    >
                      <span>{channel.label}</span>
                      <strong>{active ? "Publicado" : "No publicado"}</strong>
                      <small>
                        {publicationBusy === channel.id
                          ? "Guardando..."
                          : active
                            ? "Iluminado en la tarjeta"
                            : "Apagado en la tarjeta"}
                      </small>
                    </button>
                  );
                })}
              </div>
              {publicationMessage && <p className="product-viewer__publication-message">{publicationMessage}</p>}
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
                        <span>{formatStockQuantity(variant.stock)}</span>
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

function backupTone(status: BackupStatus | null): "success" | "warning" | "danger" | "neutral" {
  if (!status) return "neutral";
  if (!status.available) return "danger";
  return status.backupExists ? "success" : "warning";
}

function BackupDriveControl({
  backupRoot,
  onRestored,
}: {
  backupRoot?: string;
  onRestored?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState<"status" | "sync" | "">("status");
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    setBusy("status");
    try {
      const next = await getBackupStatus(backupRoot);
      setStatus(next);
      setMessage(next.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pude revisar Google Drive.");
    } finally {
      setBusy((current) => (current === "status" ? "" : current));
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [backupRoot]);

  const updateNow = async () => {
    setBusy("sync");
    try {
      const [nextStatus, products] = await Promise.all([getBackupStatus(backupRoot), listProducts()]);
      setStatus(nextStatus);
      if (!nextStatus.available) {
        setMessage(nextStatus.message);
        return;
      }
      if (!nextStatus.backupExists) {
        if (!products.length) {
          setMessage("No hay productos locales ni backup en Drive para actualizar.");
          return;
        }
        const result = await runBackup(backupRoot, "smart-update-new-backup");
        setStatus(result.status);
        setMessage("No habia backup en Drive. Subi la copia de esta PC.");
        return;
      }

      const driveTime = new Date(nextStatus.lastBackupAt || "").getTime() || 0;
      const localTime = latestProductChange(products);
      if (driveTime > localTime) {
        const result = await restoreBackup(backupRoot);
        setStatus(result.status);
        setMessage("Drive tenia cambios mas nuevos. Esta PC quedo actualizada.");
        await onRestored?.();
        return;
      }

      if (localTime > driveTime || products.length !== nextStatus.productCount) {
        const result = await runBackup(backupRoot, "smart-update-upload");
        setStatus(result.status);
        setMessage("Esta PC tenia cambios. Drive quedo actualizado.");
        return;
      }

      setMessage("Esta PC y Drive ya estan al dia.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pude actualizar el backup.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="backup-drive">
      <div className="backup-drive__summary">
        <span className="backup-drive__icon">
          <CloudCog size={20} />
        </span>
        <div>
          <StatusDot status={backupTone(status)}>
            {!status
              ? "Revisando Drive"
              : status.available
                ? status.backupExists
                  ? "Backup conectado"
                  : "Drive detectado"
                : "Drive no detectado"}
          </StatusDot>
          <strong>{formatBackupDate(status?.lastBackupAt)}</strong>
          <small>{message || "Actualizar decide automaticamente si esta PC sube cambios o baja la copia nueva."}</small>
        </div>
      </div>

      <div className="backup-drive__flow">
        <span>Esta PC</span>
        <strong>Drive</strong>
        <span>Otra PC</span>
      </div>

      <div className="backup-drive__facts">
        <span>
          <small>Productos</small>
          <strong>{status?.productCount || 0}</strong>
        </span>
        <span>
          <small>Archivos</small>
          <strong>{status?.fileCount || 0}</strong>
        </span>
        <span>
          <small>Tamano</small>
          <strong>{formatBackupSize(status?.totalBytes || 0)}</strong>
        </span>
      </div>

      <div className="backup-drive__path">
        <Folder size={14} />
        <span>{status?.backupPath || backupRoot || "Carpeta de Google Drive pendiente"}</span>
      </div>

      <div className="backup-drive__actions">
        <Button onClick={updateNow} loading={busy === "sync"} disabled={busy !== ""} variant="primary">
          <RefreshCw size={15} /> Actualizar ahora
        </Button>
        <Button onClick={loadStatus} loading={busy === "status"} disabled={busy !== ""} size="sm">
          <RefreshCw size={14} /> Revisar
        </Button>
      </div>
    </div>
  );
}

export function DashboardView({
  products,
  onNavigate,
}: {
  products: ProductDraft[];
  onNavigate: (view: AppView) => void;
}) {
  const stock = products.reduce((sum, product) => sum + totalDefinedStock(product), 0);
  const drafts = products.filter((product) => product.status === "draft").length;
  const ready = products.filter(
    (product) => product.status !== "draft" && hasSellableVariants(product),
  ).length;
  const madeToOrder = products.filter((product) => hasSellableVariants(product) && !hasDefinedStock(product)).length;
  const recentProducts = [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const attentionProducts = products
        .filter((product) => product.status === "draft" || !hasSellableVariants(product))
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
        <StatCard label="A pedido" value={madeToOrder} note="Stock indefinido" icon={<AlertTriangle />} tone="orange" />
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
                      {product.status === "draft" ? "Borrador" : "Sin variantes cargadas"} - {product.modelCode || "Sin codigo"}
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
              description="Los productos guardados tienen variantes o ya salieron de borrador."
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

export function BackupView({
  onProductsChanged,
}: {
  onProductsChanged: () => void | Promise<void>;
}) {
  const settings = useProductStore((state) => state.settings);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Google Drive</span>
          <h1>Backup</h1>
          <p>Sincronizacion automatica entre esta PC, Drive y otra computadora.</p>
        </div>
      </div>

      <div className="backup-page-grid">
        <Panel title="Sincronizacion principal" eyebrow="Automatico" icon={<CloudCog size={18} />}>
          <BackupDriveControl backupRoot={settings.backupRoot} onRestored={onProductsChanged} />
        </Panel>

        <Panel title="Como usarlo" eyebrow="Por turnos" icon={<CloudUpload size={18} />}>
          <div className="backup-guide">
            <div>
              <strong>1. Al abrir</strong>
              <span>La app revisa Drive y actualiza esta PC o sube cambios locales, segun corresponda.</span>
            </div>
            <div>
              <strong>2. Al guardar o eliminar</strong>
              <span>El cambio local dispara un backup automatico para que llegue a la otra computadora.</span>
            </div>
            <div>
              <strong>3. Actualizar ahora</strong>
              <span>Usalo si queres forzar una revision inmediata sin elegir subir o bajar.</span>
            </div>
          </div>
        </Panel>

        <Panel title="Regla importante" eyebrow="Evitar pisadas" icon={<AlertTriangle size={18} />}>
          <p className="backup-warning">
            No trabajes en dos computadoras al mismo tiempo. El sistema esta pensado para una sola persona
            moviendo la copia por turnos entre PCs.
          </p>
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
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list" | "detail">("cards");
  const [copiedMessage, setCopiedMessage] = useState("");
  const [productNotice, setProductNotice] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingFolderId, setOpeningFolderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductDraft | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const dragImageFiles = useRef(new Map<string, File>());
  const visible = products.filter((product) => {
    const matchesText = `${product.name} ${product.modelCode} ${product.status}`
      .toLowerCase()
      .includes(filter.toLowerCase());
    return matchesText && matchesPublicationFilter(product, publicationFilter);
  });

  useEffect(() => {
    let cancelled = false;
    visible.forEach((product) => {
      const cover = coverImage(product);
      if (!cover?.previewUrl || dragImageFiles.current.has(cover.id)) return;
      fetch(cover.previewUrl)
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (!blob || cancelled) return;
          const filename = imageFilename(product, cover);
          dragImageFiles.current.set(
            cover.id,
            new File([blob], filename, { type: blob.type || imageMimeType(filename) }),
          );
        })
        .catch(() => {
          // Dragging still falls back to URL data when the image cannot be preloaded as a File.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "No pude eliminar el producto.";
      if (message.startsWith("El cambio se guardo localmente")) {
        await onRefresh();
        setDeleteTarget(null);
        setProductNotice(message);
        window.setTimeout(() => setProductNotice(""), 6500);
      } else {
        setDeleteError(message);
      }
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

  const updateProduct = async (product: ProductDraft) => {
    await saveProduct(product);
    setSelectedProduct(product);
    await onRefresh();
    setProductNotice(`Publicacion actualizada: ${product.modelCode || product.name}`);
    window.setTimeout(() => setProductNotice(""), 2200);
  };

  const copyProductValue = (label: string, value: string) => {
    const text = value.trim();
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedMessage(`${label} copiado`);
    window.setTimeout(() => setCopiedMessage((current) => (current === `${label} copiado` ? "" : current)), 1800);
  };

  const handleCoverDragStart = (
    event: DragEvent<HTMLImageElement>,
    product: ProductDraft,
    cover: ProductImage,
  ) => {
    const filename = imageFilename(product, cover);
    const fileUri = fileUriFromPath(cover.finalPath || cover.originalPath);
    const source = fileUri || cover.previewUrl || "";
    if (!source) return;

    event.dataTransfer.effectAllowed = "copy";
    const file = dragImageFiles.current.get(cover.id);
    if (file) {
      event.dataTransfer.items.add(file);
    }
    event.dataTransfer.setData("text/plain", source);
    event.dataTransfer.setData("text/uri-list", source);
    event.dataTransfer.setData(
      "text/html",
      `<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(product.name || product.modelCode)}">`,
    );
    event.dataTransfer.setData("DownloadURL", `${imageMimeType(filename)}:${filename}:${source}`);
    if (cover.previewUrl) event.dataTransfer.setData("URL", cover.previewUrl);
    event.dataTransfer.setDragImage(event.currentTarget, event.currentTarget.width / 2, event.currentTarget.height / 2);
  };

  const productCover = (product: ProductDraft) => {
    const cover = coverImage(product);
    return (
      <div className="product-card__cover">
        {cover?.previewUrl ? (
          <img
            src={cover.previewUrl}
            alt={product.name}
            draggable
            onDragStart={(event) => handleCoverDragStart(event, product, cover)}
            title="Arrastrar portada"
          />
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
  };

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

  const inlineCopyButton = (label: string, value: string) => (
    <button
      type="button"
      className="product-inline-copy"
      onClick={() => copyProductValue(label, value)}
      disabled={!value.trim()}
      title={`Copiar ${label.toLowerCase()}`}
      aria-label={`Copiar ${label.toLowerCase()}`}
    >
      <Copy size={13} />
    </button>
  );

  const productCode = (product: ProductDraft) => (
    <div className="product-code-copy">
      <code>{product.modelCode || "Sin codigo"}</code>
      {inlineCopyButton("Codigo", product.modelCode)}
    </div>
  );

  const copyDescriptionButton = (product: ProductDraft) => {
    const description = product.shortDescription || product.longDescription;
    return (
      <button
        type="button"
        className="product-description-copy"
        onClick={() => copyProductValue("Descripcion", description)}
        disabled={!description.trim()}
      >
        <Copy size={12} />
        Copiar descripcion
      </button>
    );
  };

  const productPrice = (product: ProductDraft) => {
    const price = formatPrice(product.price);
    return (
      <div className="product-price-copy">
        <strong>{price}</strong>
        {inlineCopyButton("Precio", price)}
      </div>
    );
  };

  return (
    <div className="page">
      {copiedMessage && (
        <div className="toast">
          <Copy size={17} />
          {copiedMessage}
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
          onProductUpdated={updateProduct}
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
        <PublicationFilterTabs value={publicationFilter} onChange={setPublicationFilter} products={products} />
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
                <div className="product-card__title">
                  <h3>{product.name}</h3>
                  {inlineCopyButton("Nombre", product.name)}
                </div>
                {productCode(product)}
                <PublicationBadges product={product} />
                {copyDescriptionButton(product)}
                <div className="product-card__meta">
                  <span>{product.variants.length} variantes</span>
                  <span>{formatStockSummary(product)}</span>
                  {viewMode === "detail" && (
                    <>
                      <span>{product.colors.length} colores</span>
                      <span>{product.sizes.join(", ") || "Sin talles"}</span>
                    </>
                  )}
                </div>
                <div className="product-card__footer">
                  {productPrice(product)}
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

export function SearchView({
  onOpen,
  onProductsChanged,
}: {
  onOpen: (product: ProductDraft) => void;
  onProductsChanged?: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDraft | null>(null);
  const [viewMode, setViewMode] = useState<SearchViewMode>("list");
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [pinnedProducts, setPinnedProducts] = useState<PinnedSearchProduct[]>(readPinnedSearchProducts);
  const searchRequest = useRef(0);

  const runSearch = async () => {
    const requestId = ++searchRequest.current;
    const normalized = query.trim();
    if (!normalized && publicationFilter === "all") {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const next = normalized ? await searchProducts(normalized) : await listProducts();
    if (requestId === searchRequest.current) {
      setResults(next);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!query.trim() && publicationFilter === "all") {
      searchRequest.current += 1;
      setResults([]);
      setBusy(false);
      return;
    }
    const timer = window.setTimeout(() => void runSearch(), 220);
    return () => window.clearTimeout(timer);
  }, [query, publicationFilter]);

  useEffect(() => {
    sessionStorage.setItem(SEARCH_PINNED_STORAGE_KEY, JSON.stringify(pinnedProducts));
  }, [pinnedProducts]);

  const isPinned = (product: ProductDraft) => pinnedProducts.some((pinned) => pinned.product.id === product.id);

  const visibleResults = results
    .filter((product) => matchesPublicationFilter(product, publicationFilter))
    .filter((product) => !isPinned(product));
  const hasActiveSearch = Boolean(query.trim()) || publicationFilter !== "all";

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

  const updateProduct = async (product: ProductDraft) => {
    await saveProduct(product);
    setSelectedProduct(product);
    setResults((current) => current.map((item) => (item.id === product.id ? product : item)));
    setPinnedProducts((current) =>
      current.map((item) => (item.product.id === product.id ? { ...item, product } : item)),
    );
    await onProductsChanged?.();
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
          onProductUpdated={updateProduct}
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
        <Button variant="primary" loading={busy} disabled={!query.trim() && publicationFilter === "all"} onClick={runSearch}>
          Buscar
        </Button>
      </div>
      <div className="page-toolbar search-view-toolbar">
        <PublicationFilterTabs value={publicationFilter} onChange={setPublicationFilter} products={results} />
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
            {visibleResults.map((product) => {
              const cover = coverImage(product);
              return (
                <article key={product.id}>
                  <span className="search-result__cover">
                    {cover?.previewUrl ? (
                      <img src={cover.previewUrl} alt="" />
                    ) : (
                      <PackageCheck size={24} />
                    )}
                  </span>
                <div>
                  <h3>{product.name}</h3>
                  <code>{product.modelCode}</code>
                  <PublicationBadges product={product} />
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
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title={hasActiveSearch ? "Sin coincidencias" : "Empezá a escribir"}
            description={
              results.length
                ? "Los resultados de esta busqueda ya estan anclados abajo."
                : publicationFilter === "all"
                  ? "El buscador consulta productos y variantes guardados localmente."
                  : "No hay productos pendientes para ese filtro de publicacion."
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
            {pinnedProducts.map(({ product, viewMode: pinnedViewMode }) => {
              const cover = coverImage(product);
              return (
                <article className={`pinned-products__item pinned-products__item--${pinnedViewMode}`} key={product.id}>
                  <span className="pinned-products__cover">
                    {cover?.previewUrl ? (
                      <img src={cover.previewUrl} alt="" />
                    ) : (
                      <PackageCheck size={22} />
                    )}
                  </span>
                <div>
                  <h3>{product.name || product.modelCode}</h3>
                  <code>{product.modelCode}</code>
                  <PublicationBadges product={product} />
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
              );
            })}
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
  const [filter, setFilter] = useState<"all" | "draft" | "made_to_order" | "active">("all");
  const [copiedCode, setCopiedCode] = useState("");

  const timeline = [...products]
    .filter((product) => {
      if (filter === "draft" && product.status !== "draft") return false;
      if (filter === "made_to_order" && (hasDefinedStock(product) || !hasSellableVariants(product))) return false;
      if (filter === "active" && (product.status === "draft" || !hasSellableVariants(product))) return false;
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
    ["made_to_order", "A pedido", products.filter((product) => hasSellableVariants(product) && !hasDefinedStock(product)).length],
    ["active", "Activos", products.filter((product) => product.status !== "draft" && hasSellableVariants(product)).length],
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
              const madeToOrder = hasSellableVariants(product) && !hasDefinedStock(product);
              return (
                <article key={product.id} className="history-item">
                  <div className="history-item__mark">
                    <i className={madeToOrder ? "warning" : product.status === "draft" ? "draft" : "ready"} />
                  </div>
                  <div className="history-item__main">
                    <div className="history-item__title">
                      <span>
                        <strong>{product.name || "Producto sin nombre"}</strong>
                        <small>Modificado {new Date(product.updatedAt).toLocaleString("es-AR")}</small>
                      </span>
                      <StatusDot status={product.status === "draft" || madeToOrder ? "warning" : "success"}>
                        {madeToOrder ? "a pedido" : product.status}
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
                      <span>{formatStockSummary(product)}</span>
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
export function SettingsView({
  appMode,
  onProductsChanged,
  onInstallUpdate,
}: {
  appMode: "desktop" | "browser";
  onProductsChanged: () => void | Promise<void>;
  onInstallUpdate: (update: Extract<UpdateCheckResult, { status: "available" }>) => Promise<void>;
}) {
  const { settings, setSettings } = useProductStore();
  const [form, setForm] = useState<AppSettings>(settings);
  const [ollama, setOllama] = useState<{ connected: boolean; models: string[] }>({
    connected: false,
    models: [],
  });
  const [saved, setSaved] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [installedVersion, setInstalledVersion] = useState("");
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [updateInstall, setUpdateInstall] = useState<UpdateInstallStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const selectableModels = useMemo(() => {
    const names = new Set([...ollama.models, ...RECOMMENDED_OLLAMA_MODELS.map((model) => model.name)]);
    return [...names];
  }, [ollama.models]);
  const selectedModelReady = Boolean(form.ollamaModel && ollama.models.includes(form.ollamaModel));

  const modelLabel = (name: string) => {
    const known = RECOMMENDED_OLLAMA_MODELS.find((model) => model.name === name);
    if (!known) return name;
    return `${known.label} · ${known.kind === "cloud" ? "Cloud" : "Local"}`;
  };
  const defaultModelLabel = settings.ollamaModel ? modelLabel(settings.ollamaModel) : "Sin modelo";

  const saveSettings = () => {
    setSettings(form);
    setSaved(true);
    setSettingsMessage(`Predeterminado actual: ${form.ollamaModel ? modelLabel(form.ollamaModel) : "sin modelo"}.`);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const saveSettingsAndRestart = async () => {
    setRestartBusy(true);
    saveSettings();
    try {
      await restartApp();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "No pude reiniciar la app.");
      setRestartBusy(false);
    }
  };

  const testOllama = async () => {
    const status = await checkOllamaStatus(form.ollamaEndpoint);
    setOllama({ connected: status.connected, models: status.models });
    if (status.connected && !form.ollamaModel && status.models[0]) {
      setForm((current) => ({ ...current, ollamaModel: status.models[0] }));
    }
  };

  const runUpdateCheck = async () => {
    setUpdateBusy(true);
    setUpdateInstall(null);
    setUpdateCheck({
      status: "unavailable",
      message: "Buscando actualizacion...",
      currentVersion: installedVersion,
    });
    const result = await checkForUpdates();
    setUpdateCheck(result);
    if (result.currentVersion) setInstalledVersion(result.currentVersion);
    setUpdateBusy(false);
  };

  const installAvailableUpdate = async () => {
    if (updateCheck?.status !== "available") return;
    setUpdateBusy(true);
    setUpdateInstall({
      status: "downloading",
      message: "Abriendo instalador de actualizacion...",
      progress: 0,
    });
    await onInstallUpdate(updateCheck);
    setUpdateBusy(false);
  };

  useEffect(() => {
    void testOllama();
    void getInstalledVersion().then(setInstalledVersion).catch(() => setInstalledVersion(""));
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
          onClick={saveSettings}
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
          <Panel title="Backup en Google Drive" eyebrow="Drive local" icon={<CloudCog size={18} />}>
            <div className="settings-fields">
              <BackupDriveControl backupRoot={form.backupRoot} onRestored={onProductsChanged} />
              <div className="settings-toggle-row">
                <span>
                  <strong>Backup automatico</strong>
                  <small>Revisa al abrir, sube al guardar o eliminar y hace un ultimo backup al cerrar.</small>
                </span>
                <Toggle
                  checked={form.backupEnabled}
                  onChange={(checked) => setForm((current) => ({ ...current, backupEnabled: checked }))}
                />
              </div>
              <label>
                <span>Carpeta de backup opcional</span>
                <input
                  value={form.backupRoot}
                  placeholder="Vacio = detectar Google Drive automaticamente"
                  onChange={(event) => setForm((current) => ({ ...current, backupRoot: event.target.value }))}
                />
              </label>
              <p className="settings-note">
                Flujo por turnos: trabaja en una PC por vez. La app sincroniza automaticamente con Drive,
                pero Google Drive igual necesita terminar de subir o bajar sus archivos.
              </p>
            </div>
          </Panel>
          <Panel title="Actualizaciones" eyebrow="GitHub Releases" icon={<CloudDownload size={18} />}>
            <div className="settings-fields">
              <div className="settings-toggle-row">
                <span>
                  <strong>Version instalada</strong>
                  <small>{installedVersion || "Sin detectar"}</small>
                </span>
                <StatusDot status={appMode === "desktop" ? "success" : "warning"}>
                  {appMode === "desktop" ? "Escritorio" : "Solo escritorio"}
                </StatusDot>
              </div>
              <div className="settings-actions">
                <Button onClick={() => void runUpdateCheck()} loading={updateBusy}>
                  <RefreshCw size={15} /> Buscar actualizacion
                </Button>
                {updateCheck?.status === "available" && (
                  <Button variant="primary" onClick={() => void installAvailableUpdate()} loading={updateBusy}>
                    <CloudDownload size={15} /> Instalar version {updateCheck.version}
                  </Button>
                )}
              </div>
              {updateCheck && (
                <p className="settings-note">
                  {updateCheck.message}
                  {updateCheck.status === "available" && updateCheck.notes ? ` ${updateCheck.notes}` : ""}
                </p>
              )}
              {updateInstall && (
                <p className="settings-note">
                  {updateInstall.message}
                  {typeof updateInstall.progress === "number" ? ` ${updateInstall.progress}%` : ""}
                </p>
              )}
              <p className="settings-note">
                ROXWANA avisa antes de instalar. Si aceptas, Windows instala la build completa y la app se reinicia.
              </p>
            </div>
          </Panel>
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
              <StatusDot status={selectedModelReady ? "success" : "warning"}>
                {selectedModelReady ? "Modelo seleccionado disponible" : "El modelo seleccionado no esta detectado"}
              </StatusDot>
              <p className="settings-note">Predeterminado actual: {defaultModelLabel}</p>
              <div className="settings-actions">
                <Button onClick={saveSettingsAndRestart} loading={restartBusy} disabled={!form.ollamaModel || restartBusy}>
                  <RefreshCw size={15} /> Guardar modelo y reiniciar
                </Button>
              </div>
              {settingsMessage && <p className="settings-note">{settingsMessage}</p>}
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
