import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JsBarcode from "jsbarcode";
import {
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
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
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button, StatusDot } from "../../components/ui";
import {
  COLOR_CATALOG,
  GARMENT_TYPES,
  SIZE_CODES,
  TECHNIQUES,
  type ColorCode,
  type ProductDraft,
  type ProductImage,
  type SizeCode,
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
  checkWhisperStatus,
  createProductFolder,
  isTauri,
  listProducts,
  persistProductImage,
  saveProduct,
  saveProductFiles,
  suggestNextModel,
  transcribeAudio,
} from "../../services/desktopService";
import {
  checkOllamaStatus,
  generateProductDescription,
  runProductAssistant,
  suggestProductField,
  warmOllamaModel,
} from "../../services/ollamaService";
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

const formatPrice = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value || 0);

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

function Studio({ onSaved, onNavigate, appMode }: StudioProps) {
  const {
    draft,
    messages,
    settings,
    selectedTone,
    folderPath,
    patchDraft,
    applyExtractedBrief,
    setColors,
    setSizes,
    setVariantStock,
    addImage,
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunks = useRef<Float32Array[]>([]);
  const openingEmptyDraft = useRef(false);

  const sheet = useMemo(() => makeProductSheet(draft), [draft]);
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
  const completionFields = [
    Boolean(draft.garmentType),
    Boolean(draft.name.trim()),
    Boolean(draft.gender),
    Boolean(draft.technique),
    Boolean(draft.colors.length),
    Boolean(draft.sizes.length),
    draft.price > 0,
    draft.variants.some((variant) => variant.stock > 0),
  ];
  const completion = Math.round(
    (completionFields.filter(Boolean).length / completionFields.length) * 100,
  );
  const mainImage =
    draft.images.find((image) => image.imageNumber === 1) ?? draft.images[0] ?? null;

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
    if (!currentDraft.colors.length) {
      notify("Elegí primero el color del producto");
      return;
    }
    const imageNumber = currentDraft.images.length + 1;
    const colorCode = currentDraft.colors[0];
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
      try {
        const paths = await persistProductImage(
          currentDraft.modelCode,
          file.name,
          image.finalFilename,
          file,
        );
        patchImage(image.id, paths);
      } catch {
        notify(`No pude guardar ${file.name}`);
      }
    }
  };

  const fileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

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

  const handleGalleryImages = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) await addProductImage(file);
    }
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
      const nextGarment = result.data.garmentType ?? draft.garmentType;
      const systemPrefix =
        (result.data.modelPrefix ?? draft.modelPrefix) || (nextGarment ? "RCK" : "");
      const needsSkuAssignment =
        Boolean(nextGarment && systemPrefix) &&
        (draft.modelNumber <= 0 ||
          draft.garmentType !== nextGarment ||
          draft.modelPrefix !== systemPrefix);
      const systemModelNumber = needsSkuAssignment
        ? await suggestNextModel(systemPrefix, nextGarment)
        : draft.modelNumber;
      applyExtractedBrief({ ...result.data, modelPrefix: systemPrefix || undefined });
      if (systemModelNumber > 0) patchDraft({ modelNumber: systemModelNumber });
      setTone(toneFromInstruction(clean));
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
        "Regenerá los textos con una versión diferente de la actual.",
      );
      patchDraft(result);
      notify("Descripciones regeneradas con IA");
    } catch {
      notify("Ollama todavía no está listo para generar descripciones.");
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
      if (field === "price") patchDraft({ price: Number(String(value).replace(/\D/g, "")) });
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
      await saveProduct(productToSave);
      await onSaved();
      setPreviewOpen(false);
      setGalleryExpanded(false);
      setDetailsOpen(true);
      resetDraft();
      setDraftOpen(false);
      notify(
        duplicateModel
          ? "Producto guardado con un nuevo SKU único. Ya podés crear otro."
          : "Producto guardado. Ya podés crear otro.",
      );
    } catch {
      notify("No pude guardar el producto");
    } finally {
      setActionBusy(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!draft.modelCode) {
      notify("Todavía no hay un código de producto para crear la carpeta.");
      return;
    }
    setActionBusy("folder");
    try {
      const result = await createProductFolder(draft, sheet);
      setFolderPath(result.folderPath);
      notify(appMode === "desktop" ? "Carpeta creada" : "La carpeta se crea en la app de escritorio");
    } catch {
      notify("No pude crear la carpeta");
    } finally {
      setActionBusy(null);
    }
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
    resetDraft();
    setPreviewOpen(false);
    setGalleryExpanded(false);
    setDetailsOpen(true);
    setDraftOpen(false);
    notify("Ficha descartada");
  };

  const handleStartNewProduct = () => {
    openingEmptyDraft.current = true;
    resetDraft();
    setPreviewOpen(false);
    setGalleryExpanded(false);
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
        <p>Conversá a la izquierda y revisá la ficha a la derecha.</p>
      </header>

      <div className="creator-layout">
        <div className="creator-left">
          <section className="creator-card conversation-card">
            <div className="creator-card__header">
              <div>
                <span className={`live-orb live-orb--${ollamaState}`} />
                <strong>Asistente ROXWANA</strong>
              </div>
              <span
                className={`assistant-runtime assistant-runtime--${ollamaState}`}
                title={ollamaError || undefined}
              >
                {ollamaState === "ready"
                  ? `IA real · ${settings.ollamaModel}`
                  : ollamaState === "warming"
                    ? `Cargando ${settings.ollamaModel}…`
                    : ollamaState === "checking"
                      ? "Comprobando Ollama…"
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
                        : "Describí el producto, adjuntá una imagen o hablame..."
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
                Enter para enviar · Shift + Enter para nueva línea · la IA puede cometer errores
              </small>
            </div>
          </section>

          <section className="creator-card gallery-card">
            <div className="section-title">
              <div>
                <ImagePlus size={18} />
                <span>
                  <strong>Imágenes del producto</strong>
                  <small>La primera imagen será la portada</small>
                </span>
              </div>
              <div className="gallery-header-actions">
                <button type="button" onClick={() => setGalleryExpanded(true)}>
                  <Maximize2 size={15} /> Administrar
                </button>
                <button type="button" onClick={() => galleryInput.current?.click()}>
                  <UploadCloud size={15} /> Agregar imágenes
                </button>
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
                {mainImage && <em>01 · Portada</em>}
              </button>
              {mainImage && (
                <div className="gallery-thumbs">
                  {draft.images
                    .filter((image) => image.id !== mainImage.id)
                    .map((image) => (
                      <article key={image.id}>
                        {image.previewUrl ? <img src={image.previewUrl} alt={image.role} /> : null}
                        <span>{String(image.imageNumber).padStart(2, "0")}</span>
                        <button type="button" onClick={() => removeImage(image.id)}>
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
          </section>
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
                <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
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
                        type="number"
                        value={draft.price || ""}
                        onChange={(event) => patchDraft({ price: Number(event.target.value) })}
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
                  onChange={(event) => patchDraft({ material: event.target.value })}
                />
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
              <StatusDot status={errors.length ? "warning" : "success"}>
                {errors.length ? "Revisar" : "Válido"}
              </StatusDot>
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
              <strong>{draft.variants.reduce((total, variant) => total + variant.stock, 0)} unidades</strong>
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
            <div>
              <Button variant="danger" onClick={handleDiscardDraft}>
                <Trash2 size={16} /> Descartar
              </Button>
              <Button onClick={() => onNavigate("settings")}>
                <Settings2 size={16} /> Ajustes
              </Button>
              <Button loading={actionBusy === "folder"} onClick={handleCreateFolder}>
                <FolderPlus size={16} /> Crear carpeta
              </Button>
              <Button onClick={() => setPreviewOpen(true)}>
                <Eye size={16} /> Vista previa
              </Button>
              <Button loading={actionBusy === "export"} onClick={handleExport}>
                <FileOutput size={16} /> Exportar ficha
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
                <h2>Imágenes · {draft.modelCode}</h2>
                <p>Ordená, asigná roles, colores y prepará los archivos del producto.</p>
              </div>
              <div>
                <Button variant="primary" onClick={() => galleryInput.current?.click()}>
                  <UploadCloud size={16} /> Agregar imágenes
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
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleGalleryImages(event.dataTransfer.files);
              }}
            >
              {draft.images.length ? (
                draft.images.map((image) => (
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
                                finalFilename: imageFilename(
                                  image.colorCode,
                                  imageNumber,
                                  image.device,
                                ),
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
                                finalFilename: imageFilename(
                                  colorCode,
                                  image.imageNumber,
                                  image.device,
                                ),
                              });
                            }}
                          >
                            {draft.colors.map((color) => (
                              <option value={color} key={color}>
                                {color}
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
                              patchImage(image.id, {
                                device,
                                finalFilename: imageFilename(
                                  image.colorCode,
                                  image.imageNumber,
                                  device,
                                ),
                              });
                            }}
                          >
                            <option value="desktop">desktop</option>
                            <option value="mobile">mobile</option>
                            <option value="base">base</option>
                          </select>
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
                        <Button variant="danger" size="sm" onClick={() => removeImage(image.id)}>
                          <Trash2 size={14} /> Quitar
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <button
                  className="large-drop-zone"
                  onClick={() => galleryInput.current?.click()}
                >
                  <ImagePlus size={38} />
                  <strong>Soltá acá las fotos del producto</strong>
                  <span>La primera será portada; después podés ordenar y asignar roles.</span>
                </button>
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
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(sheet);
                      notify("Ficha copiada");
                    }}
                  >
                    <Copy size={14} /> Copiar
                  </button>
                </div>
                <pre>{sheet}</pre>
              </div>
            </div>
            <footer>
              <Button onClick={() => setPreviewOpen(false)}>Seguir editando</Button>
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
