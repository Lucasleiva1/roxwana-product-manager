import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import JsBarcode from "jsbarcode";
import {
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Eye,
  File,
  FileOutput,
  FolderPlus,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button, StatusDot } from "../../components/ui";
import {
  COLOR_CATALOG,
  GARMENT_TYPES,
  SIZE_CODES,
  TECHNIQUES,
  type ColorCode,
  type ImageRole,
  type ProductDraft,
  type ProductImage,
  type ProductVariant,
  type SizeCode,
} from "../../types/product";
import {
  formatStockQuantity,
  formatStockSummary,
  generateDescriptions,
  imageFilename,
  makeProductSheet,
  makeWebProductInfo,
  parsePriceInput,
  roleForImageNumber,
  uid,
  validateProduct,
} from "../../lib/productLogic";
import { useProductStore } from "../../store/useProductStore";
import {
  checkWhisperStatus,
  exportProductJson,
  isTauri,
  listProducts,
  openProductFolder,
  openProductPackageFolder,
  persistProductImage,
  savePrintFiles,
  saveBarcodeFiles,
  saveProduct,
  saveProductPackage,
  saveProductFiles,
  suggestNextModel,
  transcribeAudio,
  type ProductPackageBarcode,
  type ProductPackageImage,
  type ProductPackageImageResult,
  type ProductPackagePrintFile,
  type ProductPackageWhatsAppImage,
} from "../../services/desktopService";
import {
  checkOllamaStatus,
  generateProductDescription,
  runProductAssistant,
  suggestProductField,
  warmOllamaModel,
} from "../../services/ollamaService";
import { runBackup } from "../../services/backupService";
import type { AppView } from "../../app/App";

interface StudioProps {
  onSaved: () => void | Promise<void>;
  onNavigate: (view: AppView) => void;
  appMode: "desktop" | "browser";
}

interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  imageBase64?: string;
  text?: string;
}

interface PrintWorkFile {
  id: string;
  name: string;
  type: string;
  size: number;
  savedPath?: string;
}

const IMAGE_ROLE_OPTIONS: ImageRole[] = [
  "portada",
  "frente",
  "espalda remera",
  "hover",
  "costado",
  "espalda modelo",
  "detalle",
];

const IMAGE_DEVICE_OPTIONS: ProductImage["device"][] = ["desktop", "mobile", "base"];

function friendlyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  try {
    const text = JSON.stringify(error);
    return text && text !== "{}" ? text : fallback;
  } catch {
    return fallback;
  }
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value || 0);

const PRODUCT_NAME_SUGGESTIONS = [
  "Remera blanca lisa",
  "Remera negra lisa",
  "Remera negra estampada",
  "Remera blanca estampada",
  "Remera oversize negra",
  "Remera oversize blanca",
  "Buzo negro liso",
  "Buzo negro estampado",
  "Campera negra urbana",
  "Gorra negra bordada",
];

const MATERIAL_OPTIONS = [
  "Algodón",
  "Algodón peinado",
  "Mezcla algodón/poliéster",
  "Poliéster",
  "Frisa",
  "Jersey",
  "Modal",
  "Denim",
];

function FieldShell({
  label,
  field,
  onSuggest,
  busy,
  children,
}: {
  label: string;
  field?: keyof ProductDraft;
  onSuggest: (field: keyof ProductDraft) => void;
  busy: string | null;
  children: ReactNode;
}) {
  return (
    <label className="creator-field">
      <span>
        {label}
        {field && (
          <button
            type="button"
            className="field-ai"
            title={`Sugerir ${label.toLowerCase()} con IA`}
            onClick={() => onSuggest(field)}
            disabled={busy === field}
          >
            {busy === field ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />}
          </button>
        )}
      </span>
      {children}
    </label>
  );
}

function BarcodeLabel({
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
  }, [variant, svgRef]);

  return (
    <article className="barcode-label">
      <div className="barcode-label__header">
        <span className="brand-word">ROXWANA</span>
        <small>WEAR THE ROCK</small>
      </div>
      <strong>{product.name || product.modelCode || "Producto ROXWANA"}</strong>
      <span>{COLOR_CATALOG[variant.colorCode].name} - Talle {variant.sizeCode}</span>
      <svg ref={svgRef} />
    </article>
  );
}

function Studio({ onSaved, onNavigate, appMode }: StudioProps) {
  const {
    draft,
    messages,
    settings,
    selectedTone,
    folderPath,
    patchDraft,
    setColors,
    setSizes,
    setVariantStock,
    addImage,
    replaceImages,
    patchImage,
    removeImage,
    addMessage,
    setTone,
    setFolderPath,
    resetDraft,
  } = useProductStore();

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [fieldBusy, setFieldBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [ollamaState, setOllamaState] = useState<
    "checking" | "warming" | "ready" | "unavailable"
  >("checking");
  const [ollamaError, setOllamaError] = useState("");
  const [knownSkus, setKnownSkus] = useState<string[]>([]);
  const [knownModelCodes, setKnownModelCodes] = useState<string[]>([]);
  const [knownProductIds, setKnownProductIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [selectedBarcodeSku, setSelectedBarcodeSku] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const [lastSavedFolder, setLastSavedFolder] = useState("");
  const [pendingBackup, setPendingBackup] = useState<{ modelCode: string; message: string } | null>(null);
  const [printWorkFiles, setPrintWorkFiles] = useState<PrintWorkFile[]>([]);
  const [imageBoardZoom, setImageBoardZoom] = useState(0.58);
  const [boardPanelWeight, setBoardPanelWeight] = useState(72);

  const creatorLeftRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const printWorkInput = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const barcodePrintRef = useRef<SVGSVGElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunks = useRef<Float32Array[]>([]);
  const imageFiles = useRef(new Map<string, File>());
  const printWorkFileMap = useRef(new Map<string, File>());
  const openingEmptyDraft = useRef(false);

  const sheet = useMemo(() => makeProductSheet(draft), [draft]);
  const webInfo = useMemo(() => makeWebProductInfo(draft), [draft]);
  const issues = useMemo(
    () => validateProduct(draft, knownSkus, knownModelCodes),
    [draft, knownSkus, knownModelCodes],
  );
  const draftHasContent = Boolean(
    draft.modelCode ||
      draft.name ||
      draft.price ||
      draft.colors.length ||
      draft.sizes.length ||
      draft.images.length ||
      draft.notes,
  );
  const [draftOpen, setDraftOpen] = useState(draftHasContent);
  const lastDraftId = useRef(draft.id);
  const errors = issues.filter((issue) => issue.severity === "error");
  const ollamaConnected = ollamaState === "ready";
  const selectedVariant = draft.variants[0];
  const selectedBarcodeVariant =
    draft.variants.find((variant) => variant.sku === selectedBarcodeSku) ?? selectedVariant;
  const completionFields = [
    Boolean(draft.garmentType),
    Boolean(draft.name.trim()),
    Boolean(draft.gender),
    Boolean(draft.technique),
    Boolean(draft.colors.length),
    Boolean(draft.sizes.length),
    draft.price > 0,
    draft.variants.length > 0,
  ];
  const completion = Math.round(
    (completionFields.filter(Boolean).length / completionFields.length) * 100,
  );
  const mainImage =
    draft.images.find((image) => image.imageNumber === 1) ?? draft.images[0] ?? null;
  const sortedImages = useMemo(
    () => [...draft.images].sort((left, right) => left.imageNumber - right.imageNumber),
    [draft.images],
  );
  const showCreatorActionLabels = settings.creatorActionLabels;
  const productAlreadySaved = knownProductIds.includes(draft.id);
  const imageBoardStyle = {
    "--image-board-card-width": `${Math.round(252 * imageBoardZoom)}px`,
    "--image-board-preview-height": `${Math.round(235 * imageBoardZoom)}px`,
  } as CSSProperties;
  const creatorLeftStyle = {
    "--board-panel-size": `${boardPanelWeight}fr`,
    "--ai-panel-size": `${100 - boardPanelWeight}fr`,
  } as CSSProperties;
  const imageBoardColorChoices = useMemo<ColorCode[]>(
    () => Array.from(new Set<ColorCode>([...draft.colors, "BLA", "NEG", "GRI"])),
    [draft.colors],
  );

  useEffect(() => {
    if (lastDraftId.current === draft.id) return;
    lastDraftId.current = draft.id;
    if (openingEmptyDraft.current) {
      openingEmptyDraft.current = false;
      setDraftOpen(true);
      return;
    }
    setDraftOpen(draftHasContent);
  }, [draft.id, draftHasContent]);

  useEffect(() => {
    let active = true;
    setOllamaState("checking");
    setOllamaError("");
    void checkOllamaStatus(settings.ollamaEndpoint).then(async (status) => {
      if (!active) return;
      if (!status.connected || !status.models.includes(settings.ollamaModel)) {
        setOllamaError(
          status.error ||
            (status.connected
              ? `El modelo ${settings.ollamaModel} no está instalado.`
              : "Ollama no está conectado."),
        );
        setOllamaState("unavailable");
        return;
      }
      setOllamaState("warming");
      try {
        await warmOllamaModel(settings);
        if (active) setOllamaState("ready");
      } catch (error) {
        if (active) {
          setOllamaError(error instanceof Error ? error.message : "No se pudo cargar el modelo.");
          setOllamaState("unavailable");
        }
      }
    });
    const refreshWhisper = () =>
      checkWhisperStatus().then((ready) => {
        if (active) setWhisperReady(ready);
      });
    void refreshWhisper();
    const timer = window.setInterval(refreshWhisper, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [settings.ollamaEndpoint, settings.ollamaModel]);

  useEffect(() => {
    let active = true;
    void listProducts().then(async (products) => {
      if (!active) return;
      const others = products.filter((product) => product.id !== draft.id);
      setKnownProductIds(products.map((product) => product.id));
      setKnownSkus(others.flatMap((product) => product.variants.map((variant) => variant.sku)));
      setKnownModelCodes(others.map((product) => product.modelCode));
      if (draft.garmentType && !products.some((product) => product.id === draft.id)) {
        const prefix = draft.modelPrefix || "RCK";
        const next = await suggestNextModel(prefix, draft.garmentType);
        if (active && (prefix !== draft.modelPrefix || next !== draft.modelNumber)) {
          patchDraft({ modelPrefix: prefix, modelNumber: next });
        }
      }
    });
    return () => {
      active = false;
    };
  }, [draft.id, draft.modelPrefix, draft.garmentType]);

  useEffect(() => {
    if (chatBox.current) {
      chatBox.current.scrollTo({ top: chatBox.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, assistantBusy]);

  useEffect(() => {
    if (!barcodeRef.current || !selectedVariant) return;
    JsBarcode(barcodeRef.current, selectedVariant.barcodeValue, {
      format: "CODE128",
      background: "transparent",
      lineColor: "#e9e4d9",
      width: 1.25,
      height: 54,
      margin: 0,
      displayValue: false,
    });
  }, [selectedVariant?.barcodeValue]);

  useEffect(() => {
    if (!draft.variants.length) {
      setSelectedBarcodeSku("");
      setBarcodeOpen(false);
      return;
    }
    if (!draft.variants.some((variant) => variant.sku === selectedBarcodeSku)) {
      setSelectedBarcodeSku(draft.variants[0].sku);
    }
  }, [draft.variants, selectedBarcodeSku]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    },
    [],
  );

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  };

  const addProductImage = async (file: File) => {
    const currentDraft = useProductStore.getState().draft;
    const imageNumber = currentDraft.images.length + 1;
    const colorCode = currentDraft.colors[0] ?? "NEG";
    const previewUrl = await fileAsDataUrl(file);
    const image: ProductImage = {
      id: uid("image"),
      colorCode,
      imageNumber,
      device: "desktop",
      role: roleForImageNumber(imageNumber),
      originalName: file.name,
      finalFilename: imageFilename(colorCode, imageNumber, "desktop"),
      previewUrl,
      approved: false,
    };
    imageFiles.current.set(image.id, file);
    addImage(image);
    if (isTauri() && currentDraft.modelCode) {
      try {
        const paths = await persistProductImage(
          currentDraft.modelCode,
          numberedOriginalFilename(image),
          image.finalFilename,
          file,
        );
        patchImage(image.id, paths);
      } catch {
        notify(`No pude guardar ${file.name}`);
      }
    }
  };

  const filenameForImage = (image: ProductImage, patch: Partial<ProductImage> = {}) =>
    imageFilename(
      patch.colorCode ?? image.colorCode,
      patch.imageNumber ?? image.imageNumber,
      patch.device ?? image.device,
    );

  const numberedOriginalFilename = (image: Pick<ProductImage, "imageNumber" | "originalName">) =>
    `${String(image.imageNumber).padStart(2, "0")}-${image.originalName}`;

  const updateBoardImage = (
    image: ProductImage,
    patch: Partial<ProductImage>,
    recomputeFilename = true,
  ) => {
    const currentAutomaticFilename = imageFilename(image.colorCode, image.imageNumber, image.device);
    patchImage(image.id, {
      ...patch,
      finalFilename:
        patch.finalFilename ??
        (recomputeFilename && image.finalFilename === currentAutomaticFilename
          ? filenameForImage(image, patch)
          : image.finalFilename),
    });
  };

  const normalizeImageOrder = (images: ProductImage[]) =>
    images.map((image, index) => {
      const imageNumber = index + 1;
      const previousAutomaticFilename = imageFilename(
        image.colorCode,
        image.imageNumber,
        image.device,
      );
      const nextAutomaticFilename = imageFilename(image.colorCode, imageNumber, image.device);
      const role =
        index === 0
          ? "portada"
          : image.role === "portada"
            ? roleForImageNumber(imageNumber)
            : image.role;
      return {
        ...image,
        imageNumber,
        role,
        finalFilename:
          image.finalFilename === previousAutomaticFilename ? nextAutomaticFilename : image.finalFilename,
      };
    });

  const setCoverImage = (imageId: string) => {
    const currentImages = [...useProductStore.getState().draft.images].sort(
      (left, right) => left.imageNumber - right.imageNumber,
    );
    const selected = currentImages.find((image) => image.id === imageId);
    if (!selected) return;
    replaceImages(normalizeImageOrder([selected, ...currentImages.filter((image) => image.id !== imageId)]));
  };

  const moveImageToNumber = (imageId: string, imageNumber: number) => {
    const currentImages = [...useProductStore.getState().draft.images].sort(
      (left, right) => left.imageNumber - right.imageNumber,
    );
    const selected = currentImages.find((image) => image.id === imageId);
    if (!selected) return;
    const next = currentImages.filter((image) => image.id !== imageId);
    next.splice(Math.max(0, imageNumber - 1), 0, selected);
    replaceImages(normalizeImageOrder(next));
  };

  const changeImageBoardZoom = (delta: number) => {
    setImageBoardZoom((current) => Math.min(1.34, Math.max(0.46, Number((current + delta).toFixed(2)))));
  };

  const resizeCreatorPanels = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const container = creatorLeftRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const update = (clientY: number) => {
      const relative = clientY - rect.top;
      const next = Math.round((relative / Math.max(1, rect.height)) * 100);
      setBoardPanelWeight(Math.min(84, Math.max(48, next)));
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => update(pointerEvent.clientY);
    const stop = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("is-resizing-panels");
    };
    document.body.classList.add("is-resizing-panels");
    update(event.clientY);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const fileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const blobAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const isPrintWorkFile = (file: File) =>
    /\.(ai|psd|psb|png|pdf|eps|svg|tif|tiff|jpg|jpeg|webp)$/i.test(file.name);

  const buildPrintFilePayloads = async (items: PrintWorkFile[]): Promise<ProductPackagePrintFile[]> =>
    Promise.all(
      items.map(async (item) => {
        const file = printWorkFileMap.current.get(item.id);
        return {
          id: item.id,
          originalName: item.name,
          dataUrl: file ? await fileAsDataUrl(file) : undefined,
        };
      }),
    );

  const fileAsWebpDataUrl = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pude preparar la copia WebP.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("No pude convertir la imagen."))),
        "image/webp",
        0.9,
      ),
    );
    return blobAsDataUrl(blob);
  };

  const imageSourceAsDataUrl = async (image: ProductImage) => {
    const file = imageFiles.current.get(image.id);
    if (file) return fileAsDataUrl(file);
    if (image.previewUrl?.startsWith("data:")) return image.previewUrl;
    if (image.previewUrl) {
      const response = await fetch(image.previewUrl);
      if (!response.ok) throw new Error("No pude leer la imagen de portada.");
      return blobAsDataUrl(await response.blob());
    }
    throw new Error("No pude encontrar la imagen de portada.");
  };

  const loadImageElement = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No pude preparar la imagen de WhatsApp."));
      image.src = src;
    });

  const buildWhatsappImage = async (product: ProductDraft): Promise<ProductPackageWhatsAppImage | undefined> => {
    const coverImage = product.images.find((image) => image.imageNumber === 1) ?? product.images[0];
    if (!coverImage || !product.modelCode) return undefined;

    const sourceDataUrl = await imageSourceAsDataUrl(coverImage);
    const source = await loadImageElement(sourceDataUrl);
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / Math.max(1, source.naturalWidth || source.width));
    const imageWidth = Math.max(1, Math.round((source.naturalWidth || source.width) * scale));
    const imageHeight = Math.max(1, Math.round((source.naturalHeight || source.height) * scale));
    const labelHeight = Math.max(140, Math.min(280, Math.round(imageHeight * 0.18)));
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight + labelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pude generar la imagen de WhatsApp.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, imageWidth, imageHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(0, imageHeight, imageWidth, labelHeight);
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.max(52, Math.min(120, Math.round(labelHeight * 0.48)))}px Arial, sans-serif`;
    context.fillText(product.modelCode, imageWidth / 2, imageHeight + labelHeight / 2, imageWidth * 0.88);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("No pude convertir la imagen de WhatsApp."))),
        "image/jpeg",
        0.92,
      ),
    );
    return {
      originalName: `${product.modelCode}-whatsapp.jpg`,
      dataUrl: await blobAsDataUrl(blob),
    };
  };

  const buildPackageImages = async (product: ProductDraft): Promise<ProductPackageImage[]> =>
    Promise.all(
      product.images.map(async (image) => {
        const file = imageFiles.current.get(image.id);
        const payload: ProductPackageImage = {
          id: image.id,
          originalName: numberedOriginalFilename(image),
          finalFilename: image.finalFilename,
          approved: image.approved,
          originalPath: image.originalPath,
          finalPath: image.finalPath,
        };
        if (file) {
          payload.originalDataUrl = await fileAsDataUrl(file);
          payload.webpDataUrl = await fileAsWebpDataUrl(file);
        }
        return payload;
      }),
    );

  const mergePackageImagePaths = (
    product: ProductDraft,
    imageResults: ProductPackageImageResult[] | undefined,
  ): ProductDraft => {
    if (!imageResults?.length) return product;
    const pathsById = new Map(imageResults.map((image) => [image.id, image]));
    return {
      ...product,
      images: product.images.map((image) => {
        const paths = pathsById.get(image.id);
        if (!paths) return image;
        return {
          ...image,
          originalPath: paths.originalPath,
          finalPath: paths.finalPath,
        };
      }),
    };
  };

  const buildPackagePrintFiles = () => buildPrintFilePayloads(printWorkFiles);

  const buildPackageBarcodes = async (product: ProductDraft): Promise<ProductPackageBarcode[]> =>
    Promise.all(
      product.variants.map(async (variant) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, variant.barcodeValue, {
          format: "CODE128",
          background: "#ffffff",
          lineColor: "#111111",
          width: 2,
          height: 88,
          margin: 18,
          displayValue: true,
          font: "monospace",
          fontSize: 15,
        });
        const svgText = new XMLSerializer().serializeToString(svg);
        const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
        try {
          const image = document.createElement("img");
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(900, image.naturalWidth * 3);
          canvas.height = Math.max(320, image.naturalHeight * 3);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("No pude generar el PNG del código de barras.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return {
            sku: variant.sku,
            svg: svgText,
            pngDataUrl: canvas.toDataURL("image/png"),
          };
        } finally {
          URL.revokeObjectURL(url);
        }
      }),
    );

  const handleChatAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      const attachment: ChatAttachment = {
        id: uid("attachment"),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      };
      if (file.type.startsWith("image/")) {
        const dataUrl = await fileAsDataUrl(file);
        attachment.previewUrl = dataUrl;
        attachment.imageBase64 = dataUrl.split(",")[1];
      } else if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
        attachment.text = await file.text();
      }
      next.push(attachment);
    }
    setAttachments((current) => [...current, ...next]);
  };

  const isGalleryImageFile = (file: File) =>
    file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name);

  const handleGalleryImages = async (files: FileList | null) => {
    if (!files?.length) return;
    let added = 0;
    for (const file of Array.from(files)) {
      if (isGalleryImageFile(file)) {
        await addProductImage(file);
        added += 1;
      }
    }
    if (added > 0) {
      notify(`${added} imagen${added === 1 ? "" : "es"} cargada${added === 1 ? "" : "s"}.`);
    } else {
      notify("No encontre imagenes en esos archivos.");
    }
  };

  const removeProductImage = (imageId: string) => {
    imageFiles.current.delete(imageId);
    removeImage(imageId);
  };

  const handlePrintWorkFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter(isPrintWorkFile);
    if (!accepted.length) {
      notify("Elegí archivos AI, PSD, PNG, PDF, EPS, SVG, TIFF, JPG o WebP.");
      return;
    }
    const next = accepted.map((file) => {
      const id = uid("print");
      printWorkFileMap.current.set(id, file);
      return {
        id,
        name: file.name,
        type: file.type || "archivo de impresion",
        size: file.size,
      } satisfies PrintWorkFile;
    });
    setPrintWorkFiles((current) => [...current, ...next]);
    const modelCode = useProductStore.getState().draft.modelCode;
    if (modelCode) {
      try {
        await savePrintFiles(modelCode, await buildPrintFilePayloads(next));
        notify(`${next.length} archivo${next.length === 1 ? "" : "s"} guardado${next.length === 1 ? "" : "s"} en impresion.`);
      } catch {
        notify("Los archivos quedaron listos para guardarse con la carpeta.");
      }
    } else {
      notify(`${next.length} archivo${next.length === 1 ? "" : "s"} listo${next.length === 1 ? "" : "s"} para impresion.`);
    }
  };

  const removePrintWorkFile = (id: string) => {
    printWorkFileMap.current.delete(id);
    setPrintWorkFiles((current) => current.filter((file) => file.id !== id));
  };

  const toneFromInstruction = (instruction: string) => {
    const normalized = instruction.toLowerCase();
    if (/(minimal|simple|breve|corta|directa)/.test(normalized)) return "minimal" as const;
    if (/(comercial|vendedora|venta|atractiva)/.test(normalized)) return "comercial" as const;
    if (/(rockera|rock|fuerte|cruda|rebelde)/.test(normalized)) return "rockera" as const;
    return selectedTone;
  };

  const createDescriptionTexts = async (
    sourceDraft: ProductDraft,
    tone: "rockera" | "comercial" | "minimal",
    instruction = "",
  ) => {
    if (!ollamaConnected || !settings.ollamaModel) {
      throw new Error("El modelo de Ollama todavía no está listo.");
    }
    return generateProductDescription(sourceDraft, settings, tone, instruction);
  };

  const sendMessage = async () => {
    const clean = message.trim();
    if ((!clean && !attachments.length) || assistantBusy) return;
    const attachmentSummary = attachments.length
      ? `\nAdjuntos: ${attachments.map((item) => item.name).join(", ")}`
      : "";
    addMessage({
      role: "user",
      content: `${clean || "Analizá los archivos adjuntos."}${attachmentSummary}`,
    });
    setMessage("");
    setAssistantBusy(true);
    try {
      const textContents = attachments
        .filter((item) => item.text)
        .map((item) => `Contenido de ${item.name}:\n${item.text}`)
        .join("\n\n");
      const images = attachments
        .map((item) => item.imageBase64)
        .filter((value): value is string => Boolean(value));
      const assistantInput =
        [clean, textContents].filter(Boolean).join("\n\n") || "Analizá la imagen del producto.";
      const products = await listProducts();
      const result = await runProductAssistant(
        assistantInput,
        settings,
        {
          currentDraft: draft,
          products,
          messages: [
            ...messages,
            {
              id: "current-user-message",
              role: "user",
              content: assistantInput,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        images,
      );
      const descriptionPatch: Partial<ProductDraft> = {};
      if (result.data.shortDescription?.trim()) {
        descriptionPatch.shortDescription = result.data.shortDescription.trim();
      }
      if (result.data.longDescription?.trim()) {
        descriptionPatch.longDescription = result.data.longDescription.trim();
      }
      if (Object.keys(descriptionPatch).length) patchDraft(descriptionPatch);
      setTone(toneFromInstruction(clean || result.reply));
      addMessage({
        role: "assistant",
        content: result.reply,
        source: result.source,
        model: result.model,
      });
      setAttachments([]);
    } catch {
      addMessage({
        role: "assistant",
        content:
          "No pude analizar eso ahora. El borrador quedó intacto; podés volver a intentar o completar un dato a la derecha.",
      });
    } finally {
      setAssistantBusy(false);
    }
  };

  const encodeWav = (chunks: Float32Array[], sourceRate: number) => {
    const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const source = new Float32Array(sourceLength);
    let sourceOffset = 0;
    chunks.forEach((chunk) => {
      source.set(chunk, sourceOffset);
      sourceOffset += chunk.length;
    });
    const targetRate = 16000;
    const ratio = sourceRate / targetRate;
    const outputLength = Math.max(1, Math.round(source.length / ratio));
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(source.length, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let cursor = start; cursor < end; cursor += 1) sum += source[cursor];
      output[index] = sum / Math.max(1, end - start);
    }
    const buffer = new ArrayBuffer(44 + output.length * 2);
    const view = new DataView(buffer);
    const writeText = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + output.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, output.length * 2, true);
    output.forEach((sample, index) => {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    });
    return new Blob([buffer], { type: "audio/wav" });
  };

  const stopRecording = async () => {
    const context = audioContextRef.current;
    audioProcessorRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
    if (!context) return;
    const wav = encodeWav(pcmChunks.current, context.sampleRate);
    await context.close();
    audioContextRef.current = null;
    setTranscribing(true);
    try {
      const conversationContext = messages.slice(-4).map((item) => item.content).join(" ");
      const result = await transcribeAudio(wav, conversationContext, settings);
      if (result.text) setMessage((current) => `${current}${current ? " " : ""}${result.text}`);
      else notify("No detecté voz en la grabación.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No pude transcribir el audio.");
    } finally {
      setTranscribing(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      await stopRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify("El navegador bloquea el micrófono. Abrí la app en localhost o en la versión de escritorio.");
      return;
    }
    const ready = whisperReady || (await checkWhisperStatus());
    if (!ready) {
      setWhisperReady(false);
      notify("El motor Whisper no está iniciado. Reiniciá el servidor de la aplicación.");
      return;
    }
    setWhisperReady(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      pcmChunks.current = [];
      processor.onaudioprocess = (event) => {
        pcmChunks.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(context.destination);
      streamRef.current = stream;
      audioContextRef.current = context;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      setRecording(true);
    } catch {
      notify("Necesito permiso para usar el micrófono.");
    }
  };

  const handleDescriptionGeneration = async (tone = selectedTone) => {
    setActionBusy("description");
    setTone(tone);
    try {
      const result = await createDescriptionTexts(
        draft,
        tone,
        "Regeneré los textos con una versión diferente de la actual.",
      );
      patchDraft(result);
      notify("Descripciones regeneradas con IA");
    } catch {
      patchDraft(generateDescriptions(draft, tone));
      notify("Ollama no respondió; apliqué una descripción comercial local.");
    } finally {
      setActionBusy(null);
    }
  };

  const suggestField = async (field: keyof ProductDraft) => {
    if (field === "shortDescription" || field === "longDescription" || field === "whatsappText") {
      await handleDescriptionGeneration();
      return;
    }
    setFieldBusy(field);
    try {
      const value = await suggestProductField(field, draft, settings);
      if (field === "price") patchDraft({ price: parsePriceInput(value) });
      else if (field === "tags") {
        patchDraft({ tags: String(value).split(",").map((item) => item.trim()).filter(Boolean) });
      } else patchDraft({ [field]: value } as Partial<ProductDraft>);
      notify("Sugerencia aplicada");
    } catch {
      notify("La IA no pudo sugerir ese campo.");
    } finally {
      setFieldBusy(null);
    }
  };

  const handleSave = async () => {
    if (!draft.modelCode) {
      notify("Elegí primero el tipo de producto para generar un código único.");
      return;
    }
    setActionBusy("save");
    try {
      const products = await listProducts();
      const duplicateModel = products.some(
        (product) => product.id !== draft.id && product.modelCode === draft.modelCode,
      );
      if (duplicateModel) {
        const nextModelNumber = await suggestNextModel(draft.modelPrefix, draft.garmentType);
        patchDraft({ modelNumber: nextModelNumber });
      }
      const productToSave = useProductStore.getState().draft;
      const productSheet = makeProductSheet(productToSave);
      const productWebInfo = makeWebProductInfo(productToSave);
      let whatsappImage: ProductPackageWhatsAppImage | undefined;
      try {
        whatsappImage = await buildWhatsappImage(productToSave);
      } catch (error) {
        console.warn("No pude preparar la imagen de WhatsApp.", error);
      }
      const packageResult = await saveProductPackage({
        product: productToSave,
        productSheet,
        webInfo: productWebInfo,
        images: await buildPackageImages(productToSave),
        whatsappImage,
        barcodes: await buildPackageBarcodes(productToSave),
        printFiles: await buildPackagePrintFiles(),
      });
      const productWithSavedImages = mergePackageImagePaths(productToSave, packageResult.images);
      const saveResult = await saveProduct(productWithSavedImages);
      await onSaved();
      if (saveResult.backupError) {
        setPendingBackup({ modelCode: productWithSavedImages.modelCode, message: saveResult.backupError });
      } else {
        setPendingBackup(null);
      }
      setFolderPath(packageResult.folderPath);
      setLastSavedFolder(packageResult.folderPath);
      setPreviewOpen(false);
      setGalleryExpanded(false);
      setBarcodeOpen(false);
      setDetailsOpen(true);
      imageFiles.current.clear();
      printWorkFileMap.current.clear();
      setPrintWorkFiles([]);
      resetDraft();
      setDraftOpen(false);
      notify(
        saveResult.backupError
          ? "Producto guardado. Drive queda pendiente para subir despues."
          : "Producto guardado con carpeta, imágenes y códigos. Ya podés crear otro.",
      );
    } catch (error) {
      notify(friendlyErrorMessage(error, "No pude guardar el producto"));
    } finally {
      setActionBusy(null);
    }
  };

  const handleOpenProductFolder = async () => {
    if (!productAlreadySaved) {
      notify("Primero guarda el producto. Despues vas a poder abrir su carpeta.");
      return;
    }
    if (!draft.modelCode) {
      notify("Todavia no hay un codigo de producto para abrir la carpeta.");
      return;
    }
    setActionBusy("folder");
    try {
      const result = await openProductPackageFolder(draft.modelCode);
      setFolderPath(result.folderPath);
      setLastSavedFolder(result.folderPath);
      notify("Carpeta abierta");
    } catch {
      notify("No pude abrir la carpeta. Guarda el producto para crear sus archivos.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleUploadPendingBackup = async () => {
    if (!pendingBackup) {
      notify("No hay backup pendiente.");
      return;
    }
    setActionBusy("backup");
    try {
      const result = await runBackup(settings.backupRoot, `manual-pending-${pendingBackup.modelCode}`);
      if (!result.backedUp) throw new Error(result.message || "Drive todavia no pudo recibir el backup.");
      setPendingBackup(null);
      notify("Backup subido a Drive.");
    } catch (error) {
      setPendingBackup({
        ...pendingBackup,
        message: friendlyErrorMessage(error, "Drive todavia no pudo recibir el backup."),
      });
      notify("Drive todavia no pudo recibir el backup.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleCopyWebInfo = async () => {
    await navigator.clipboard.writeText(webInfo);
    notify("Informacion web copiada");
  };

  const handleDownloadWebInfo = () => {
    const blob = new Blob([webInfo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.modelCode || "producto"}-info-web.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Archivo info-web.txt generado");
  };

  const handleExport = async () => {
    if (errors.length) {
      notify(`Quedan ${errors.length} datos obligatorios`);
      return;
    }
    setActionBusy("export");
    try {
      await saveProduct(draft);
      await saveProductFiles(draft, sheet);
      notify("Ficha exportada");
    } catch {
      notify("No pude exportar la ficha");
    } finally {
      setActionBusy(null);
    }
  };

  const handleExportJson = () => {
    if (!draft.modelCode) {
      notify("Todavia no hay un codigo de producto para exportar.");
      return;
    }
    exportProductJson(draft);
    notify("Producto JSON exportado");
  };

  const handlePrintSheet = () => {
    setBarcodeOpen(false);
    window.print();
  };

  const exportSelectedBarcode = async () => {
    if (!selectedBarcodeVariant || !barcodePrintRef.current) {
      notify("Todavia no hay una etiqueta para guardar.");
      return;
    }
    if (!draft.modelCode) {
      notify("Primero hace falta generar el codigo del producto.");
      return;
    }
    setActionBusy("barcode");
    try {
      const svg = new XMLSerializer().serializeToString(barcodePrintRef.current);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      const image = document.createElement("img");
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(800, image.naturalWidth * 3);
      canvas.height = Math.max(300, image.naturalHeight * 3);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No pude preparar el PNG.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      await saveBarcodeFiles(
        draft.modelCode,
        selectedBarcodeVariant.sku,
        svg,
        canvas.toDataURL("image/png"),
      );
      notify("Etiqueta guardada como SVG y PNG");
    } catch {
      notify("No pude guardar la etiqueta.");
    } finally {
      setActionBusy(null);
    }
  };

  const updateColor = (color: ColorCode) =>
    setColors(
      draft.colors.includes(color)
        ? draft.colors.filter((item) => item !== color)
        : [...draft.colors, color],
    );

  const updateSize = (size: SizeCode) =>
    setSizes(
      draft.sizes.includes(size)
        ? draft.sizes.filter((item) => item !== size)
        : [...draft.sizes, size],
    );

  const handleDiscardDraft = () => {
    const hasContent =
      Boolean(draft.modelCode || draft.name || draft.price || draft.colors.length || draft.sizes.length);
    if (hasContent && !window.confirm("¿Descartar esta ficha y empezar un producto vacío?")) return;
    imageFiles.current.clear();
    printWorkFileMap.current.clear();
    setPrintWorkFiles([]);
    resetDraft();
    setPreviewOpen(false);
    setGalleryExpanded(false);
    setBarcodeOpen(false);
    setDetailsOpen(true);
    setDraftOpen(false);
    notify("Ficha descartada");
  };

  const handleStartNewProduct = () => {
    openingEmptyDraft.current = true;
    imageFiles.current.clear();
    printWorkFileMap.current.clear();
    setPrintWorkFiles([]);
    resetDraft();
    setPreviewOpen(false);
    setGalleryExpanded(false);
    setBarcodeOpen(false);
    setDetailsOpen(true);
    setDraftOpen(true);
  };

  if (!draftOpen) {
    return (
      <div className="product-creator product-creator--start">
        {toast && (
          <div className="toast">
            <CheckCircle2 size={17} />
            {toast}
          </div>
        )}

        <header className="creator-header">
          <h1>Crear producto</h1>
          <p>Empezá una ficha nueva o buscá un producto guardado para editarlo.</p>
        </header>

        <section className="creator-start" aria-label="Crear producto">
          <button type="button" className="creator-start__button" onClick={handleStartNewProduct}>
            <span>
              <Plus size={42} strokeWidth={1.8} />
            </span>
            <strong>Nuevo producto</strong>
          </button>
          {lastSavedFolder && (
            <div className="creator-start__last-folder">
              <span>Última carpeta creada</span>
              <code>{lastSavedFolder}</code>
              <Button onClick={() => openProductFolder(lastSavedFolder)}>
                <FolderPlus size={15} /> Abrir carpeta
              </Button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="product-creator">
      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}

      <header className="creator-header">
        <h1>Crear producto</h1>
        <p>Carga imagenes en el tablero y revisa la ficha a la derecha.</p>
      </header>

      <div className="creator-layout">
        <div className="creator-left" ref={creatorLeftRef} style={creatorLeftStyle}>
          <section className="creator-card image-board-card">
            <div className="section-title image-board-title">
              <div>
                <ImagePlus size={18} />
                <span>
                  <strong>Tablero de imagenes</strong>
                  <small>Arrastra varias imagenes juntas y elegi portada, rol y nombre.</small>
                </span>
              </div>
              <div className={`gallery-header-actions ${showCreatorActionLabels ? "" : "is-icon-only"}`}>
                <span className="image-board-zoom">
                  <button
                    type="button"
                    onClick={() => changeImageBoardZoom(-0.08)}
                    title="Achicar imagenes"
                    aria-label="Achicar imagenes"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <small>{Math.round(imageBoardZoom * 100)}%</small>
                  <button
                    type="button"
                    onClick={() => changeImageBoardZoom(0.08)}
                    title="Agrandar imagenes"
                    aria-label="Agrandar imagenes"
                  >
                    <ZoomIn size={14} />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setGalleryExpanded(true)}
                  title="Administrar imagenes"
                  aria-label="Administrar imagenes"
                >
                  <Maximize2 size={15} />
                  {showCreatorActionLabels && <span>Administrar</span>}
                </button>
                <label
                  htmlFor="product-gallery-input"
                  title="Agregar imagenes"
                  aria-label="Agregar imagenes"
                >
                  <UploadCloud size={15} />
                  {showCreatorActionLabels && <span>Agregar imagenes</span>}
                </label>
                <button
                  type="button"
                  onClick={() => printWorkInput.current?.click()}
                  title="Trabajos para impresion"
                  aria-label="Trabajos para impresion"
                >
                  <File size={15} />
                  {showCreatorActionLabels && <span>Trabajos para impresion</span>}
                </button>
                {printWorkFiles.length > 0 && (
                  <span className="print-work-mini-status">
                    <File size={12} />
                    {printWorkFiles.length} impresion
                  </span>
                )}
              </div>
            </div>

            <div
              className={`image-board ${sortedImages.length ? "" : "is-empty"}`}
              style={imageBoardStyle}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleGalleryImages(event.dataTransfer.files);
              }}
            >
              {sortedImages.length ? (
                <div className="image-board-canvas">
                  {sortedImages.map((image) => (
                    <article
                      className={`image-board-tile ${image.imageNumber === 1 ? "is-cover" : ""}`}
                      key={image.id}
                    >
                      <div className="image-board-preview">
                        {image.previewUrl ? (
                          <img src={image.previewUrl} alt={image.role} />
                        ) : (
                          <span>
                            <ImagePlus size={24} />
                          </span>
                        )}
                        <strong>{String(image.imageNumber).padStart(2, "0")}</strong>
                        <button
                          type="button"
                          className={image.imageNumber === 1 ? "image-cover-chip active" : "image-cover-chip"}
                          onClick={() => setCoverImage(image.id)}
                          disabled={image.imageNumber === 1}
                          title={image.imageNumber === 1 ? "Imagen de portada" : "Usar como portada"}
                        >
                          <Check size={13} />
                          {image.imageNumber === 1 ? "Portada" : "Usar"}
                        </button>
                        <button
                          type="button"
                          className="image-delete-chip"
                          onClick={() => removeProductImage(image.id)}
                          title="Quitar imagen"
                          aria-label="Quitar imagen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="image-board-controls">
                        <label>
                          <span>Tipo</span>
                          <select
                            value={image.imageNumber === 1 ? "portada" : image.role}
                            disabled={image.imageNumber === 1}
                            onChange={(event) => {
                              const role = event.target.value as ImageRole;
                              if (role === "portada") setCoverImage(image.id);
                              else updateBoardImage(image, { role }, false);
                            }}
                          >
                            {IMAGE_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="image-color-swatches" aria-label="Color de la imagen">
                          {Array.from(new Set([image.colorCode, ...imageBoardColorChoices])).map((color) => (
                            <button
                              type="button"
                              key={color}
                              className={image.colorCode === color ? "active" : ""}
                              title={COLOR_CATALOG[color].name}
                              aria-label={COLOR_CATALOG[color].name}
                              onClick={() =>
                                updateBoardImage(image, {
                                  colorCode: color,
                                })
                              }
                            >
                              <i style={{ backgroundColor: COLOR_CATALOG[color].hex }} />
                            </button>
                          ))}
                        </div>

                        <small className="image-board-filename" title={image.finalFilename}>
                          {image.finalFilename}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <label
                  htmlFor="product-gallery-input"
                  className="image-board-empty"
                >
                  <UploadCloud size={28} />
                  <strong>Solta aca todas las imagenes del producto</strong>
                  <small>La primera que entre queda como portada. Despues podes cambiarla.</small>
                </label>
              )}
            </div>

            <input
              id="product-gallery-input"
              ref={galleryInput}
              className="visually-hidden-input"
              multiple
              type="file"
              accept="image/*,.avif,.gif,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                void handleGalleryImages(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={printWorkInput}
              hidden
              multiple
              type="file"
              accept=".ai,.psd,.psb,.png,.pdf,.eps,.svg,.tif,.tiff,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => {
                void handlePrintWorkFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </section>

          <button
            type="button"
            className="creator-panel-resizer"
            onPointerDown={resizeCreatorPanels}
            title="Arrastrar para ajustar imagenes e IA"
            aria-label="Ajustar alto del tablero y la IA"
          >
            <span />
          </button>

          <section className="creator-card conversation-card description-ai-card">
            <div className="creator-card__header">
              <div>
                <span className={`live-orb live-orb--${ollamaState}`} />
                <strong>IA de descripciones</strong>
              </div>
              <span
                className={`assistant-runtime assistant-runtime--${ollamaState}`}
                title={ollamaError || undefined}
              >
                {ollamaState === "ready"
                  ? `IA real - ${settings.ollamaModel}`
                  : ollamaState === "warming"
                    ? `Cargando ${settings.ollamaModel}&`
                    : ollamaState === "checking"
                      ? "Comprobando Ollama&"
                      : "IA no disponible"}
              </span>
            </div>

            <div className="creator-chat" ref={chatBox}>
              <div className="chat-day">Hoy</div>
              {messages.map((item) => (
                <div className={`creator-message creator-message--${item.role}`} key={item.id}>
                  {item.role === "assistant" && (
                    <span className="creator-message__avatar">
                      <Sparkles size={15} />
                    </span>
                  )}
                  <div>
                    <p>{item.content}</p>
                    <time>
                      {new Date(item.timestamp).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {item.role === "assistant" && item.source === "ollama" && (
                        <em>{item.model ?? "Ollama"}</em>
                      )}
                      {item.role === "assistant" && item.source === "local" && (
                        <em>reglas locales</em>
                      )}
                    </time>
                  </div>
                </div>
              ))}
              {assistantBusy && (
                <div className="creator-message creator-message--assistant">
                  <span className="creator-message__avatar">
                    <Sparkles size={15} />
                  </span>
                  <div className="creator-typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </div>

            <div className="composer-wrap">
              {attachments.length > 0 && (
                <div className="attachment-tray">
                  {attachments.map((item) => (
                    <div className="attachment-chip" key={item.id}>
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" />
                      ) : (
                        <File size={17} />
                      )}
                      <span>
                        <strong>{item.name}</strong>
                        <small>{Math.max(1, Math.round(item.size / 1024))} KB</small>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((current) => current.filter((file) => file.id !== item.id))
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={`creator-composer ${recording ? "is-recording" : ""}`}>
                <button
                  type="button"
                  className="composer-tool"
                  title="Adjuntar imagen o archivo"
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus size={20} />
                </button>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={
                    recording
                      ? "Te estoy escuchando..."
                      : transcribing
                        ? "Transcribiendo con Whisper..."
                        : "Pedime una descripcion corta o larga para este producto..."
                  }
                  rows={1}
                />
                <button
                  type="button"
                  className={`composer-tool microphone ${recording ? "active" : ""}`}
                  title={recording ? "Detener grabación" : "Hablar con Whisper"}
                  onClick={toggleRecording}
                  disabled={transcribing}
                >
                  {transcribing ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : recording ? (
                    <MicOff size={19} />
                  ) : (
                    <Mic size={19} />
                  )}
                </button>
                <button
                  type="button"
                  className="composer-send"
                  onClick={sendMessage}
                  disabled={assistantBusy || (!message.trim() && !attachments.length)}
                >
                  <Send size={18} />
                </button>
              </div>
              <input
                ref={fileInput}
                hidden
                multiple
                type="file"
                accept="image/*,.txt,.pdf,.doc,.docx"
                onChange={(event) => {
                  void handleChatAttachments(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <small className="composer-hint">
                Enter para enviar - trabaja sobre descripcion corta y larga
              </small>
            </div>
          </section>

          {false && (
          <section className="creator-card gallery-card">
            <div className="section-title">
              <div>
                <ImagePlus size={18} />
                <span>
                  <strong>Imágenes del producto</strong>
                  <small>La primera imagen será la portada</small>
                </span>
              </div>
              <div className={`gallery-header-actions ${showCreatorActionLabels ? "" : "is-icon-only"}`}>
                <button
                  type="button"
                  onClick={() => setGalleryExpanded(true)}
                  title="Administrar imágenes"
                  aria-label="Administrar imágenes"
                >
                  <Maximize2 size={15} />
                  {showCreatorActionLabels && <span>Administrar</span>}
                </button>
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  title="Agregar imágenes"
                  aria-label="Agregar imágenes"
                >
                  <UploadCloud size={15} />
                  {showCreatorActionLabels && <span>Agregar imágenes</span>}
                </button>
                <button
                  type="button"
                  onClick={() => printWorkInput.current?.click()}
                  title="Trabajos para impresión"
                  aria-label="Trabajos para impresión"
                >
                  <File size={15} />
                  {showCreatorActionLabels && <span>Trabajos para impresión</span>}
                </button>
                {printWorkFiles.length > 0 && (
                  <span className="print-work-mini-status">
                    <File size={12} />
                    {printWorkFiles.length} impresión
                  </span>
                )}
              </div>
            </div>
            <div className={`product-gallery ${mainImage ? "" : "is-empty"}`}>
              <button
                type="button"
                className="gallery-main"
                onClick={() => galleryInput.current?.click()}
              >
                {mainImage?.previewUrl ? (
                  <img src={mainImage.previewUrl} alt={mainImage.role} />
                ) : (
                  <span>
                    <ImagePlus size={30} />
                    <strong>Subí la imagen principal</strong>
                    <small>JPG, PNG o WebP</small>
                  </span>
                )}
                {mainImage && <em>01 - Portada</em>}
              </button>
              {mainImage && (
                <div className="gallery-thumbs">
                  {draft.images
                    .filter((image) => image.id !== mainImage.id)
                    .map((image) => (
                      <article key={image.id}>
                        {image.previewUrl ? <img src={image.previewUrl} alt={image.role} /> : null}
                        <span>{String(image.imageNumber).padStart(2, "0")}</span>
                        <button type="button" onClick={() => removeProductImage(image.id)}>
                          <Trash2 size={13} />
                        </button>
                      </article>
                    ))}
                  <button
                    type="button"
                    className="gallery-add"
                    onClick={() => galleryInput.current?.click()}
                  >
                    <Plus size={20} />
                    <span>Agregar</span>
                  </button>
                </div>
              )}
            </div>
            <input
              ref={galleryInput}
              hidden
              multiple
              type="file"
              accept="image/*"
              onChange={(event) => {
                void handleGalleryImages(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={printWorkInput}
              hidden
              multiple
              type="file"
              accept=".ai,.psd,.psb,.png,.pdf,.eps,.svg,.tif,.tiff,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => {
                void handlePrintWorkFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </section>
          )}
        </div>

        <aside className="creator-right">
          <section className="creator-card product-data-card">
            <div className="section-title">
              <div>
                <Sparkles size={18} />
                <span>
                  <strong>Datos del producto</strong>
                  <small>Podés corregir cualquier sugerencia</small>
                </span>
              </div>
              <span className="completion-pill">
                {completion}% completo
              </span>
            </div>

            <div className="creator-fields">
              <FieldShell label="Nombre del producto" field="name" onSuggest={suggestField} busy={fieldBusy}>
                <input
                  value={draft.name}
                  list="product-name-suggestions"
                  onChange={(event) => patchDraft({ name: event.target.value })}
                />
                <datalist id="product-name-suggestions">
                  {PRODUCT_NAME_SUGGESTIONS.map((name) => (
                    <option value={name} key={name} />
                  ))}
                </datalist>
              </FieldShell>

              <div className="creator-field-row">
                <FieldShell label="Tipo de prenda" onSuggest={suggestField} busy={fieldBusy}>
                  <select
                    value={draft.garmentType}
                    onChange={(event) =>
                      patchDraft({ garmentType: event.target.value as ProductDraft["garmentType"] })
                    }
                  >
                    <option value="">Seleccionar</option>
                    {Object.entries(GARMENT_TYPES).map(([code, name]) => (
                      <option value={code} key={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell label="Género" onSuggest={suggestField} busy={fieldBusy}>
                  <div className="field-with-shortcuts">
                    <select
                      value={draft.gender}
                      onChange={(event) =>
                        patchDraft({ gender: event.target.value as ProductDraft["gender"] })
                      }
                    >
                      <option value="">Seleccionar</option>
                      <option value="unisex">Unisex</option>
                      <option value="hombre">Hombre</option>
                      <option value="mujer">Mujer</option>
                      <option value="no_definido">No definido</option>
                    </select>
                    <div className="field-shortcuts" aria-label="Opciones rápidas de género">
                      {(["hombre", "mujer", "unisex"] as const).map((gender) => (
                        <button
                          type="button"
                          key={gender}
                          className={draft.gender === gender ? "active" : ""}
                          onClick={() => patchDraft({ gender })}
                        >
                          {gender[0].toUpperCase() + gender.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </FieldShell>
              </div>

              <div className="creator-field-row">
                <FieldShell label="Categoría" field="category" onSuggest={suggestField} busy={fieldBusy}>
                  <input
                    value={draft.category}
                    onChange={(event) => patchDraft({ category: event.target.value })}
                  />
                </FieldShell>
                <FieldShell label="Precio" field="price" onSuggest={suggestField} busy={fieldBusy}>
                  <div className="field-with-shortcuts">
                    <div className="money-input">
                      <span>$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.price ? new Intl.NumberFormat("es-AR").format(draft.price) : ""}
                        onChange={(event) =>
                          patchDraft({ price: parsePriceInput(event.target.value) })
                        }
                      />
                    </div>
                    <div className="field-shortcuts field-shortcuts--prices" aria-label="Precios rápidos">
                      {[19000, 29000, 39000, 49000].map((price) => (
                        <button
                          type="button"
                          key={price}
                          className={draft.price === price ? "active" : ""}
                          onClick={() => patchDraft({ price })}
                        >
                          {new Intl.NumberFormat("es-AR").format(price)}
                        </button>
                      ))}
                    </div>
                  </div>
                </FieldShell>
              </div>

              <FieldShell label="Material" field="material" onSuggest={suggestField} busy={fieldBusy}>
                <input
                  value={draft.material}
                  list="material-options"
                  onChange={(event) => patchDraft({ material: event.target.value })}
                />
                <datalist id="material-options">
                  {MATERIAL_OPTIONS.map((material) => (
                    <option value={material} key={material} />
                  ))}
                </datalist>
              </FieldShell>

              <div className="creator-field-row">
                <FieldShell label="Técnica" onSuggest={suggestField} busy={fieldBusy}>
                  <select
                    value={draft.technique}
                    onChange={(event) =>
                      patchDraft({ technique: event.target.value as ProductDraft["technique"] })
                    }
                  >
                    <option value="">Seleccionar</option>
                    {TECHNIQUES.map((technique) => (
                      <option value={technique} key={technique}>{technique}</option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell
                  label="Colección / Drop"
                  field="collectionDrop"
                  onSuggest={suggestField}
                  busy={fieldBusy}
                >
                  <input
                    value={draft.collectionDrop}
                    placeholder="Opcional"
                    onChange={(event) => patchDraft({ collectionDrop: event.target.value })}
                  />
                </FieldShell>
              </div>

              <FieldShell label="Colores" onSuggest={suggestField} busy={fieldBusy}>
                <div className="creator-colors">
                  {(Object.keys(COLOR_CATALOG) as ColorCode[]).map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={draft.colors.includes(color) ? "selected" : ""}
                      title={COLOR_CATALOG[color].name}
                      onClick={() => updateColor(color)}
                    >
                      <i style={{ background: COLOR_CATALOG[color].hex }} />
                      {draft.colors.includes(color) && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </FieldShell>

              <FieldShell label="Talles" onSuggest={suggestField} busy={fieldBusy}>
                <div className="creator-sizes">
                  {SIZE_CODES.map((size) => (
                    <button
                      type="button"
                      key={size}
                      className={draft.sizes.includes(size) ? "selected" : ""}
                      onClick={() => updateSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </FieldShell>

              <FieldShell
                label="Descripción corta"
                field="shortDescription"
                onSuggest={suggestField}
                busy={fieldBusy}
              >
                <textarea
                  value={draft.shortDescription}
                  placeholder="La IA puede escribirla por vos"
                  onChange={(event) => patchDraft({ shortDescription: event.target.value })}
                />
              </FieldShell>

              <div className="description-tools">
                <div>
                  {(["rockera", "comercial", "minimal"] as const).map((tone) => (
                    <button
                      type="button"
                      key={tone}
                      className={selectedTone === tone ? "active" : ""}
                      onClick={() => handleDescriptionGeneration(tone)}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleDescriptionGeneration()}
                  disabled={actionBusy === "description"}
                >
                  <RefreshCw size={14} className={actionBusy === "description" ? "spin" : ""} />
                  Regenerar descripciones
                </button>
                <button type="button" onClick={() => setPreviewOpen(true)}>
                  <Eye size={14} /> Vista previa
                </button>
              </div>

              <button
                type="button"
                className="details-toggle"
                onClick={() => setDetailsOpen((open) => !open)}
              >
                Más detalles
                <ChevronDown size={15} className={detailsOpen ? "rotate" : ""} />
              </button>
              {detailsOpen && (
                <div className="extra-details">
                  <FieldShell
                    label="Descripción larga"
                    field="longDescription"
                    onSuggest={suggestField}
                    busy={fieldBusy}
                  >
                    <textarea
                      value={draft.longDescription}
                      onChange={(event) => patchDraft({ longDescription: event.target.value })}
                    />
                  </FieldShell>
                </div>
              )}
            </div>
          </section>

          <section className="creator-card barcode-card">
            <div className="section-title">
              <div>
                <Barcode size={18} />
                <span>
                  <strong>SKU y código de barras</strong>
                  <small>Generados automáticamente</small>
                </span>
              </div>
              <div className="section-title-actions">
                <Button
                  size="sm"
                  disabled={!selectedVariant}
                  onClick={() => {
                    if (selectedVariant) {
                      setSelectedBarcodeSku(selectedVariant.sku);
                      setBarcodeOpen(true);
                    }
                  }}
                >
                  <Maximize2 size={14} /> Ver etiqueta
                </Button>
                <StatusDot status={errors.length ? "warning" : "success"}>
                  {errors.length ? "Revisar" : "Válido"}
                </StatusDot>
              </div>
            </div>
            <div className="sku-code">
              <span>SKU principal</span>
              <strong>{(selectedVariant?.sku ?? draft.modelCode) || "Pendiente"}</strong>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedVariant?.sku ?? draft.modelCode);
                  notify("SKU copiado");
                }}
              >
                <Copy size={14} />
              </button>
            </div>
            {selectedVariant ? (
              <div className="barcode-visual">
                <svg ref={barcodeRef} />
                <span>{selectedVariant.barcodeValue}</span>
              </div>
            ) : (
              <div className="sku-placeholder">
                <Barcode size={24} />
                <span>
                  Elegí tipo de producto, color y talle. El sistema consultará la base y generará
                  un SKU único.
                </span>
              </div>
            )}
            <div className="variant-summary">
              <span>{draft.variants.length} variantes</span>
              <strong>{formatStockSummary(draft)}</strong>
            </div>
            <div className="stock-strip">
              {draft.variants.slice(0, 6).map((variant) => (
                <label key={variant.sku}>
                  <span>{variant.sizeCode}</span>
                  <input
                    type="number"
                    min="0"
                    value={variant.stock}
                    onChange={(event) => setVariantStock(variant.sku, Number(event.target.value))}
                  />
                  <small>{variant.stock > 0 ? "Stock" : "Indef."}</small>
                </label>
              ))}
            </div>
          </section>

          <section className="creator-card creator-actions">
            <span>
              {folderPath ? (
                <>
                  <CheckCircle2 size={15} /> Carpeta lista
                </>
              ) : (
                "Acciones del producto"
              )}
            </span>
            {pendingBackup && (
              <div className="backup-pending-alert">
                <strong>Drive pendiente</strong>
                <small>{pendingBackup.message}</small>
                <Button
                  size="sm"
                  loading={actionBusy === "backup"}
                  disabled={actionBusy !== null}
                  onClick={handleUploadPendingBackup}
                >
                  <RefreshCw size={14} /> Subir a Drive
                </Button>
              </div>
            )}
            <div>
              <Button variant="danger" onClick={handleDiscardDraft}>
                <Trash2 size={16} /> Descartar
              </Button>
              <Button onClick={() => onNavigate("settings")}>
                <Settings2 size={16} /> Ajustes
              </Button>
              <Button
                loading={actionBusy === "folder"}
                onClick={handleOpenProductFolder}
                disabled={!productAlreadySaved}
                title={productAlreadySaved ? "Abrir carpeta del producto" : "Disponible despues de guardar el producto"}
              >
                <FolderPlus size={16} /> Abrir carpeta
              </Button>
              <Button onClick={() => setPreviewOpen(true)}>
                <Eye size={16} /> Vista previa
              </Button>
              <Button loading={actionBusy === "export"} onClick={handleExport}>
                <FileOutput size={16} /> Exportar ficha
              </Button>
              <Button onClick={handleCopyWebInfo}>
                <Copy size={16} /> Copiar info web
              </Button>
              <Button variant="primary" loading={actionBusy === "save"} onClick={handleSave}>
                <Save size={16} /> Guardar producto
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {galleryExpanded && (
        <div className="image-manager-backdrop" onMouseDown={() => setGalleryExpanded(false)}>
          <section className="image-manager-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="eyebrow">Biblioteca del producto</span>
                <h2>Imágenes - {draft.modelCode}</h2>
                <p>Ordená, asigná roles, colores y prepará los archivos del producto.</p>
              </div>
              <div>
                <span className="image-board-zoom image-board-zoom--modal">
                  <button
                    type="button"
                    onClick={() => changeImageBoardZoom(-0.08)}
                    title="Achicar imagenes"
                    aria-label="Achicar imagenes"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <small>{Math.round(imageBoardZoom * 100)}%</small>
                  <button
                    type="button"
                    onClick={() => changeImageBoardZoom(0.08)}
                    title="Agrandar imagenes"
                    aria-label="Agrandar imagenes"
                  >
                    <ZoomIn size={14} />
                  </button>
                </span>
                <Button
                  variant="primary"
                  onClick={() => galleryInput.current?.click()}
                  title="Agregar imágenes"
                >
                  <UploadCloud size={16} />
                  {showCreatorActionLabels && "Agregar imágenes"}
                </Button>
                <Button onClick={() => printWorkInput.current?.click()} title="Trabajos para impresión">
                  <File size={16} />
                  {showCreatorActionLabels && "Trabajos para impresión"}
                </Button>
                <button
                  type="button"
                  className="image-manager-close"
                  onClick={() => setGalleryExpanded(false)}
                  title="Volver a la vista compacta"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </header>

            <div
              className="image-manager image-manager--embedded"
              style={imageBoardStyle}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleGalleryImages(event.dataTransfer.files);
              }}
            >
              {sortedImages.length ? (
                sortedImages.map((image) => (
                  <article className="managed-image" key={image.id}>
                    <div className="managed-image__preview">
                      {image.previewUrl ? (
                        <img src={image.previewUrl} alt={image.role} />
                      ) : (
                        <ImagePlus size={30} />
                      )}
                      <span>{String(image.imageNumber).padStart(2, "0")}</span>
                    </div>
                    <div className="managed-image__body">
                      <strong>{image.role}</strong>
                      <small>{image.originalName}</small>
                      <code>{image.finalFilename}</code>
                      <button
                        type="button"
                        className={image.imageNumber === 1 ? "managed-cover-button active" : "managed-cover-button"}
                        onClick={() => setCoverImage(image.id)}
                        disabled={image.imageNumber === 1}
                      >
                        <Check size={13} />
                        {image.imageNumber === 1 ? "Portada activa" : "Usar como portada"}
                      </button>
                      <div className="field-row">
                        <label>
                          <span>Número</span>
                          <select
                            value={image.imageNumber}
                            onChange={(event) => {
                              const imageNumber = Number(event.target.value);
                              moveImageToNumber(image.id, imageNumber);
                            }}
                          >
                            {sortedImages.map((_, index) => index + 1).map((number) => (
                              <option value={number} key={number}>
                                {String(number).padStart(2, "0")} - {roleForImageNumber(number)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Rol</span>
                          <select
                            value={image.imageNumber === 1 ? "portada" : image.role}
                            disabled={image.imageNumber === 1}
                            onChange={(event) => {
                              const role = event.target.value as ImageRole;
                              if (role === "portada") setCoverImage(image.id);
                              else updateBoardImage(image, { role }, false);
                            }}
                          >
                            {IMAGE_ROLE_OPTIONS.map((role) => (
                              <option value={role} key={role}>
                                {role}
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
                              updateBoardImage(image, { colorCode });
                            }}
                          >
                            {(Object.keys(COLOR_CATALOG) as ColorCode[]).map((color) => (
                              <option value={color} key={color}>
                                {COLOR_CATALOG[color].name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Dispositivo</span>
                          <select
                            value={image.device}
                            onChange={(event) => {
                              const device = event.target.value as ProductImage["device"];
                              updateBoardImage(image, { device });
                            }}
                          >
                            <option value="desktop">desktop</option>
                            <option value="mobile">mobile</option>
                            <option value="base">base</option>
                          </select>
                        </label>
                        <label>
                          <span>Archivo final</span>
                          <input
                            value={image.finalFilename}
                            onChange={(event) =>
                              updateBoardImage(image, { finalFilename: event.target.value }, false)
                            }
                          />
                        </label>
                      </div>
                      <div className="managed-image__actions">
                        <label className="approval-check">
                          <input
                            type="checkbox"
                            checked={image.approved}
                            onChange={(event) =>
                              patchImage(image.id, { approved: event.target.checked })
                            }
                          />
                          Aprobada
                        </label>
                        <Button variant="danger" size="sm" onClick={() => removeProductImage(image.id)}>
                          <Trash2 size={14} /> Quitar
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <label
                  htmlFor="product-gallery-input"
                  className="large-drop-zone"
                >
                  <ImagePlus size={38} />
                  <strong>Soltá acá las fotos del producto</strong>
                  <span>La primera será portada; después podés ordenar y asignar roles.</span>
                </label>
              )}
            </div>

            <footer>
              <Button onClick={() => setGalleryExpanded(false)}>
                <Minimize2 size={16} /> Volver a vista compacta
              </Button>
            </footer>
          </section>
        </div>
      )}

      {barcodeOpen && (
        <div className="barcode-print-backdrop" onMouseDown={() => setBarcodeOpen(false)}>
          <section className="barcode-print-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="eyebrow">Etiquetas del producto</span>
                <h2>Codigos de barras - {draft.modelCode || "sin codigo"}</h2>
                <p>Elegis la variante, revisas la etiqueta y la imprimis desde este producto.</p>
              </div>
              <button
                type="button"
                className="image-manager-close"
                onClick={() => setBarcodeOpen(false)}
                title="Volver a la ficha"
              >
                <Minimize2 size={18} />
              </button>
            </header>

            <div className="barcode-print-content">
              <aside className="barcode-print-variants">
                {draft.variants.length ? (
                  draft.variants.map((variant) => (
                    <button
                      type="button"
                      className={variant.sku === selectedBarcodeVariant?.sku ? "active" : ""}
                      key={variant.sku}
                      onClick={() => setSelectedBarcodeSku(variant.sku)}
                    >
                      <span>
                        <strong>{variant.sizeCode} - {variant.colorCode}</strong>
                        <code>{variant.sku}</code>
                      </span>
                      <em>{formatStockQuantity(variant.stock)}</em>
                    </button>
                  ))
                ) : (
                  <div className="sku-placeholder">
                    <Barcode size={24} />
                    <span>Elegi tipo de producto, color y talle para generar variantes.</span>
                  </div>
                )}
              </aside>

              <main className="barcode-print-preview">
                {selectedBarcodeVariant ? (
                  <BarcodeLabel
                    variant={selectedBarcodeVariant}
                    product={draft}
                    svgRef={barcodePrintRef}
                  />
                ) : (
                  <div className="sku-placeholder">
                    <Barcode size={24} />
                    <span>Todavia no hay etiqueta para mostrar.</span>
                  </div>
                )}
                <div className="barcode-actions">
                  <Button onClick={() => void navigator.clipboard.writeText(selectedBarcodeVariant?.sku ?? "")}>
                    <Copy size={15} /> Copiar SKU
                  </Button>
                  <Button variant="primary" disabled={!selectedBarcodeVariant} onClick={() => window.print()}>
                    <Printer size={15} /> Imprimir
                  </Button>
                  <Button
                    variant="primary"
                    loading={actionBusy === "barcode"}
                    disabled={!selectedBarcodeVariant}
                    onClick={exportSelectedBarcode}
                  >
                    <Download size={15} /> Guardar SVG + PNG
                  </Button>
                </div>
              </main>
            </div>

            <footer>
              <Button onClick={() => setBarcodeOpen(false)}>
                <Minimize2 size={16} /> Volver a la ficha
              </Button>
            </footer>
          </section>
        </div>
      )}

      {previewOpen && (
        <div className="preview-backdrop" onMouseDown={() => setPreviewOpen(false)}>
          <section className="product-preview" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="eyebrow">Vista previa</span>
                <h2>Ficha de producto</h2>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)}>
                <X size={19} />
              </button>
            </header>
            <div className="product-preview__content">
              <div className="preview-product">
                <div className="preview-cover">
                  {mainImage?.previewUrl ? (
                    <img src={mainImage.previewUrl} alt={draft.name} />
                  ) : (
                    <ImagePlus size={36} />
                  )}
                </div>
                <span>{draft.garmentType ? GARMENT_TYPES[draft.garmentType] : "Sin tipo"}</span>
                <h3>{draft.name}</h3>
                <strong>{formatPrice(draft.price)}</strong>
                <p>{draft.shortDescription || "Todavía no hay una descripción corta."}</p>
                <div className="preview-tags">
                  {draft.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </div>
              <div className="preview-sheet">
                <div>
                  <strong>Product Sheet v1</strong>
                  <div className="preview-sheet-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(sheet);
                        notify("Ficha copiada");
                      }}
                    >
                      <Copy size={14} /> Copiar
                    </button>
                    <button type="button" onClick={handleCopyWebInfo}>
                      <Copy size={14} /> Info web
                    </button>
                    <button type="button" onClick={handleDownloadWebInfo}>
                      <Download size={14} /> TXT web
                    </button>
                    <button type="button" onClick={handlePrintSheet}>
                      <Printer size={14} /> Imprimir
                    </button>
                    <button type="button" onClick={handleExportJson}>
                      <Download size={14} /> JSON
                    </button>
                    <button
                      type="button"
                      disabled={errors.length > 0 || actionBusy === "export"}
                      onClick={handleExport}
                    >
                      <FileOutput size={14} /> Guardar ficha
                    </button>
                  </div>
                </div>
                <pre>{sheet}</pre>
              </div>
            </div>
            <footer>
              <Button onClick={() => setPreviewOpen(false)}>Seguir editando</Button>
              <Button
                loading={actionBusy === "folder"}
                onClick={handleOpenProductFolder}
                disabled={!productAlreadySaved}
                title={productAlreadySaved ? "Abrir carpeta del producto" : "Disponible despues de guardar el producto"}
              >
                <FolderPlus size={16} /> Abrir carpeta
              </Button>
              <Button variant="primary" onClick={handleSave}>
                <Save size={16} /> Guardar producto
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

export default Studio;

