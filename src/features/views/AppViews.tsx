import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import JsBarcode from "jsbarcode";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Box,
  CheckCircle2,
  Clipboard,
  CloudCog,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileOutput,
  Folder,
  Image as ImageIcon,
  Images,
  Layers3,
  Mic,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import type { AppView } from "../../app/App";
import { Button, EmptyState, Panel, StatCard, StatusDot } from "../../components/ui";
import {
  COLOR_CATALOG,
  type AppSettings,
  type ProductDraft,
  type ProductImage,
  type ProductVariant,
} from "../../types/product";
import {
  imageFilename,
  makeProductSheet,
  roleForImageNumber,
  uid,
  validateProduct,
} from "../../lib/productLogic";
import { useProductStore } from "../../store/useProductStore";
import {
  createProductFolder,
  exportProductJson,
  isTauri,
  openProductFolder,
  persistProductImage,
  saveBarcodeFiles,
  saveProductFiles,
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
  const withoutStock = products.filter((product) => product.variants.every((variant) => !variant.stock)).length;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Resumen local</span>
          <h1>Dashboard</h1>
          <p>Productos, producción y tareas del estudio en un solo vistazo.</p>
        </div>
        <Button variant="primary" onClick={() => onNavigate("studio")}>
          <PackagePlus size={17} /> Nuevo producto
        </Button>
      </div>

      <div className="stats-grid">
        <StatCard label="Productos" value={products.length} note="Guardados en esta base" icon={<Box />} />
        <StatCard label="Borradores" value={drafts} note="Listos para continuar" icon={<FileOutput />} tone="blue" />
        <StatCard label="Stock total" value={stock} note="Unidades registradas" icon={<Database />} tone="green" />
        <StatCard label="Sin producir" value={withoutStock} note="Requieren atención" icon={<AlertTriangle />} tone="orange" />
      </div>

      <div className="dashboard-grid">
        <Panel title="Productos recientes" eyebrow="Actividad" icon={<PackageOpen size={18} />}>
          {products.length ? (
            <div className="product-list compact">
              {products.slice(0, 6).map((product) => (
                <article key={product.id}>
                  <span className="product-thumb">{product.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{product.name}</strong>
                    <small>{product.modelCode}</small>
                  </div>
                  <StatusDot status={product.status === "draft" ? "warning" : "success"}>
                    {product.status}
                  </StatusDot>
                  <strong>{formatPrice(product.price)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<PackagePlus />}
              title="Todavía no hay productos guardados"
              description="El primer borrador está listo en Crear producto."
              action={<Button onClick={() => onNavigate("studio")}>Abrir estudio</Button>}
            />
          )}
        </Panel>

        <Panel title="Flujo recomendado" eyebrow="Próximo paso" icon={<Layers3 size={18} />}>
          <div className="workflow-list">
            {[
              ["1", "Escribí el brief", "Prenda, diseño, talles, precio y stock."],
              ["2", "Revisá el SKU", "La base valida el modelo y cada variante."],
              ["3", "Asigná imágenes", "01 portada, 03 hover, 05 espalda modelo."],
              ["4", "Exportá la ficha", "TXT y JSON listos para Product Studio."],
            ].map(([number, title, description]) => (
              <div key={number}>
                <span>{number}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{description}</small>
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
  const visible = products.filter((product) =>
    `${product.name} ${product.modelCode} ${product.status}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="page">
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
        <StatusDot status="neutral">{visible.length} resultados</StatusDot>
      </div>
      {visible.length ? (
        <div className="product-grid">
          {visible.map((product) => (
            <article className="product-card" key={product.id}>
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
              <div className="product-card__body">
                <span className="eyebrow">{product.category}</span>
                <h3>{product.name}</h3>
                <code>{product.modelCode}</code>
                <div className="product-card__meta">
                  <span>{product.variants.length} variantes</span>
                  <span>{product.variants.reduce((sum, variant) => sum + variant.stock, 0)} unidades</span>
                </div>
                <div className="product-card__footer">
                  <strong>{formatPrice(product.price)}</strong>
                  <Button size="sm" variant="primary" onClick={() => onOpen(product)}>
                    Abrir <ArrowRight size={14} />
                  </Button>
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

  const runSearch = async () => {
    setBusy(true);
    setResults(await searchProducts(query));
    setBusy(false);
  };

  useEffect(() => {
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
        <Button variant="primary" loading={busy} onClick={runSearch}>
          Buscar
        </Button>
      </div>
      <Panel title="Resultados" eyebrow={query ? `Consulta: ${query}` : "Toda la base"}>
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
                    Abrir producto
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

export function ImagesView() {
  const { draft, addImage, patchImage, removeImage } = useProductStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file, index) => {
      const imageNumber = draft.images.length + index + 1;
      const colorCode = draft.colors[0] ?? "NEG";
      const image: ProductImage = {
        id: uid("image"),
        colorCode,
        imageNumber,
        device: "desktop",
        role: roleForImageNumber(imageNumber),
        originalName: file.name,
        finalFilename: imageFilename(colorCode, imageNumber, "desktop"),
        previewUrl: URL.createObjectURL(file),
        approved: false,
      };
      addImage(image);
      if (isTauri()) {
        void persistProductImage(draft.modelCode, file.name, image.finalFilename, file)
          .then((paths) => patchImage(image.id, paths))
          .catch(() => undefined);
      }
    });
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Biblioteca del producto</span>
          <h1>Imágenes</h1>
          <p>Ordená, asigná roles y prepará nombres para {draft.modelCode}.</p>
        </div>
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={17} /> Agregar imágenes
        </Button>
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*" hidden onChange={(e) => addFiles(e.target.files)} />
      <div
        className="image-manager"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        {draft.images.length ? (
          draft.images.map((image) => (
            <article className="managed-image" key={image.id}>
              <div className="managed-image__preview">
                {image.previewUrl ? <img src={image.previewUrl} alt={image.role} /> : <ImageIcon />}
                <span>{String(image.imageNumber).padStart(2, "0")}</span>
              </div>
              <div className="managed-image__body">
                <strong>{image.role}</strong>
                <small>{image.originalName}</small>
                <code>{image.finalFilename}</code>
                <div className="field-row">
                  <label>
                    <span>Número</span>
                    <select
                      value={image.imageNumber}
                      onChange={(event) => {
                        const imageNumber = Number(event.target.value);
                        patchImage(image.id, {
                          imageNumber,
                          role: roleForImageNumber(imageNumber),
                          finalFilename: imageFilename(image.colorCode, imageNumber, image.device),
                        });
                      }}
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => (
                        <option value={number} key={number}>
                          {String(number).padStart(2, "0")} · {roleForImageNumber(number)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Color</span>
                    <select
                      value={image.colorCode}
                      onChange={(event) => {
                        const colorCode = event.target.value as ProductImage["colorCode"];
                        patchImage(image.id, {
                          colorCode,
                          finalFilename: imageFilename(colorCode, image.imageNumber, image.device),
                        });
                      }}
                    >
                      {draft.colors.map((color) => (
                        <option key={color}>{color}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Device</span>
                    <select
                      value={image.device}
                      onChange={(event) => {
                        const device = event.target.value as ProductImage["device"];
                        patchImage(image.id, {
                          device,
                          finalFilename: imageFilename(image.colorCode, image.imageNumber, device),
                        });
                      }}
                    >
                      <option>desktop</option>
                      <option>mobile</option>
                      <option>base</option>
                    </select>
                  </label>
                </div>
                <div className="managed-image__actions">
                  <label className="approval-check">
                    <input
                      type="checkbox"
                      checked={image.approved}
                      onChange={(event) => patchImage(image.id, { approved: event.target.checked })}
                    />
                    Aprobada
                  </label>
                  <Button variant="danger" size="sm" onClick={() => removeImage(image.id)}>
                    <Trash2 size={14} /> Quitar
                  </Button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <button className="large-drop-zone" onClick={() => inputRef.current?.click()}>
            <Images size={38} />
            <strong>Soltá acá las fotos del producto</strong>
            <span>Después asignamos 01 portada, 02 espalda, 03 hover y el resto.</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function DescriptionsView() {
  const { draft, patchDraft, regenerateDescriptions, selectedTone, setTone } = useProductStore();
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Voz de marca</span>
          <h1>Descripciones IA</h1>
          <p>Editá cada salida por separado y mantené el contenido fiel a los datos confirmados.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            regenerateDescriptions();
          }}
        >
          <Sparkles size={17} /> Regenerar todo
        </Button>
      </div>
      <div className="description-workbench">
        <Panel title="Contexto confirmado" eyebrow={draft.modelCode} icon={<Database size={18} />}>
          <dl className="context-list">
            <div><dt>Producto</dt><dd>{draft.name}</dd></div>
            <div><dt>Material</dt><dd>{draft.material}</dd></div>
            <div><dt>Técnica</dt><dd>{draft.technique}</dd></div>
            <div><dt>Colores</dt><dd>{draft.colors.join(", ")}</dd></div>
            <div><dt>Etiquetas</dt><dd>{draft.tags.join(", ")}</dd></div>
          </dl>
          <div className="tone-selector">
            <span>Tono activo</span>
            {(["rockera", "comercial", "minimal"] as const).map((tone) => (
              <button
                className={selectedTone === tone ? "active" : ""}
                key={tone}
                onClick={() => {
                  setTone(tone);
                  regenerateDescriptions(tone);
                }}
              >
                {tone}
              </button>
            ))}
          </div>
        </Panel>
        <div className="description-editors">
          <Panel title="Descripción corta" eyebrow="Tienda / grilla">
            <textarea
              value={draft.shortDescription}
              onChange={(event) => patchDraft({ shortDescription: event.target.value })}
              placeholder="Hasta 160 caracteres funciona bien."
            />
            <small>{draft.shortDescription.length} caracteres</small>
          </Panel>
          <Panel title="WhatsApp" eyebrow="Consulta rápida">
            <textarea
              value={draft.whatsappText}
              onChange={(event) => patchDraft({ whatsappText: event.target.value })}
            />
            <Button size="sm" onClick={() => navigator.clipboard.writeText(draft.whatsappText)}>
              <Copy size={14} /> Copiar
            </Button>
          </Panel>
          <Panel className="wide" title="Descripción larga" eyebrow="Página de producto">
            <textarea
              value={draft.longDescription}
              onChange={(event) => patchDraft({ longDescription: event.target.value })}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function BarcodePreview({
  variant,
  product,
  svgRef,
}: {
  variant: ProductVariant;
  product: ProductDraft;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, variant.barcodeValue, {
      format: "CODE128",
      background: "#ffffff",
      lineColor: "#111111",
      width: 1.45,
      height: 68,
      margin: 10,
      displayValue: true,
      font: "monospace",
      fontSize: 12,
    });
  }, [variant]);
  return (
    <article className="barcode-label">
      <div className="barcode-label__header">
        <span className="brand-word">ROXWANA</span>
        <small>WEAR THE ROCK</small>
      </div>
      <strong>{product.name}</strong>
      <span>{COLOR_CATALOG[variant.colorCode].name} · Talle {variant.sizeCode}</span>
      <svg ref={svgRef} />
    </article>
  );
}

export function BarcodeView() {
  const draft = useProductStore((state) => state.draft);
  const [selectedSku, setSelectedSku] = useState(draft.variants[0]?.sku ?? "");
  const [notice, setNotice] = useState("");
  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const selected = draft.variants.find((variant) => variant.sku === selectedSku) ?? draft.variants[0];

  const exportBarcode = async () => {
    if (!selected || !barcodeSvgRef.current) return;
    const svg = new XMLSerializer().serializeToString(barcodeSvgRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = document.createElement("img");
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(800, image.naturalWidth * 3);
    canvas.height = Math.max(300, image.naturalHeight * 3);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    await saveBarcodeFiles(draft.modelCode, selected.sku, svg, canvas.toDataURL("image/png"));
    setNotice("SVG y PNG guardados");
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="page">
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}</div>}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Etiquetas internas</span>
          <h1>Códigos de barras</h1>
          <p>Code 128 basado en el SKU completo. Sin EAN externo en esta versión.</p>
        </div>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={17} /> Imprimir etiqueta
        </Button>
      </div>
      <div className="barcode-workspace">
        <Panel title="Variantes" eyebrow={draft.modelCode} icon={<Barcode size={18} />}>
          <div className="barcode-variant-list">
            {draft.variants.map((variant) => (
              <button
                className={variant.sku === selected?.sku ? "active" : ""}
                key={variant.sku}
                onClick={() => setSelectedSku(variant.sku)}
              >
                <span>
                  <strong>{variant.sizeCode} · {variant.colorCode}</strong>
                  <code>{variant.sku}</code>
                </span>
                <em>{variant.stock} u.</em>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Vista de impresión" eyebrow="Etiqueta 70 × 40 mm">
          {selected ? (
            <BarcodePreview variant={selected} product={draft} svgRef={barcodeSvgRef} />
          ) : (
            <p>Sin variantes.</p>
          )}
          <div className="barcode-actions">
            <Button onClick={() => navigator.clipboard.writeText(selected?.sku ?? "")}>
              <Copy size={15} /> Copiar SKU
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer size={15} /> Imprimir
            </Button>
            <Button variant="primary" onClick={exportBarcode}>
              <Download size={15} /> Guardar SVG + PNG
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ExportView({ appMode }: { appMode: "desktop" | "browser" }) {
  const { draft, folderPath, setFolderPath } = useProductStore();
  const [notice, setNotice] = useState("");
  const sheet = useMemo(() => makeProductSheet(draft), [draft]);
  const issues = useMemo(() => validateProduct(draft), [draft]);
  const errors = issues.filter((issue) => issue.severity === "error");

  const run = async (action: "copy" | "folder" | "txt" | "json") => {
    try {
      if (action === "copy") await navigator.clipboard.writeText(sheet);
      if (action === "folder") {
        const result = await createProductFolder(draft, sheet);
        setFolderPath(result.folderPath);
      }
      if (action === "txt") await saveProductFiles(draft, sheet);
      if (action === "json") exportProductJson(draft);
      setNotice("Acción completada");
    } catch {
      setNotice("No se pudo completar la acción");
    }
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="page">
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}</div>}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Salida para Product Studio</span>
          <h1>Exportar ficha</h1>
          <p>Revisión final del modelo, variantes, imágenes y archivos locales.</p>
        </div>
        <Button variant="primary" disabled={errors.length > 0} onClick={() => run("txt")}>
          <Download size={17} /> Guardar .txt
        </Button>
      </div>
      <div className="export-layout">
        <Panel title="ROXWANA Product Sheet v1" eyebrow={draft.modelCode} icon={<FileCheck2 size={18} />}>
          <pre className="export-sheet">{sheet}</pre>
          <div className="export-actions">
            <Button onClick={() => run("copy")}><Copy size={15} /> Copiar texto</Button>
            <Button onClick={() => run("json")}><Download size={15} /> Producto JSON</Button>
            <Button variant="primary" disabled={errors.length > 0} onClick={() => run("txt")}>
              <FileOutput size={15} /> Guardar ficha
            </Button>
          </div>
        </Panel>
        <div className="export-side">
          <Panel title="Validación" eyebrow="Antes de exportar">
            <div className="validation-list">
              {issues.length ? (
                issues.map((issue, index) => (
                  <div key={`${issue.field}-${index}`} className={issue.severity}>
                    {issue.severity === "error" ? <AlertTriangle size={16} /> : <Settings2 size={16} />}
                    <span><strong>{issue.field}</strong><small>{issue.message}</small></span>
                  </div>
                ))
              ) : (
                <div className="success">
                  <CheckCircle2 size={17} />
                  <span><strong>Producto listo</strong><small>No hay bloqueos de exportación.</small></span>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Carpeta local" eyebrow={appMode === "desktop" ? "Sistema de archivos" : "Vista web"}>
            <div className="folder-preview">
              <Folder size={28} />
              <strong>{folderPath || `product-files/${draft.modelCode}`}</strong>
              <code>ficha / imagenes / estampas / mockups / codigos-barra / notas</code>
              <Button onClick={() => run("folder")}>
                <Folder size={15} /> Crear estructura
              </Button>
              {folderPath && appMode === "desktop" && (
                <Button variant="primary" onClick={() => openProductFolder(folderPath)}>
                  <ExternalLink size={15} /> Abrir carpeta
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </div>
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
  const timeline = [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Registro local</span>
          <h1>Historial</h1>
          <p>Últimos productos guardados y modificados.</p>
        </div>
      </div>
      <Panel title="Actividad" eyebrow={`${timeline.length} elementos`}>
        {timeline.length ? (
          <div className="timeline">
            {timeline.map((product) => (
              <button key={product.id} onClick={() => onOpen(product)}>
                <i />
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {new Date(product.updatedAt).toLocaleString("es-AR")} · {product.modelCode}
                  </small>
                </span>
                <StatusDot status={product.status === "draft" ? "warning" : "success"}>
                  {product.status}
                </StatusDot>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Database />} title="Historial vacío" description="Los borradores guardados aparecerán acá." />
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
              <label>
                <span>Python de Whisper</span>
                <input
                  value={form.whisperPythonPath}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, whisperPythonPath: event.target.value }))
                  }
                />
              </label>
              <div className="field-row">
                <label>
                  <span>Modelo</span>
                  <select
                    value={form.whisperModel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, whisperModel: event.target.value }))
                    }
                  >
                    <option value="tiny">Tiny</option>
                    <option value="base">Base</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
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
                  ? "Transcripción local disponible"
                  : "Se activa en la aplicación de escritorio"}
              </StatusDot>
              <p className="settings-note">
                El audio se procesa en tu computadora. No se envía a un servicio de voz externo.
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
