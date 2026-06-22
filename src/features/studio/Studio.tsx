import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JsBarcode from "jsbarcode";
import {
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  Eye,
  File,
  FileOutput,
  FolderPlus,
  ImagePlus,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Tag,
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
  askMissingQuestions,
  checkOllamaStatus,
  extractProductFieldsFromNaturalInput,
  generateProductDescription,
  RECOMMENDED_OLLAMA_MODELS,
  suggestProductField,
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
    regenerateDescriptions,
    addMessage,
    setTone,
    setSettings,
    setFolderPath,
  } = useProductStore();

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [fieldBusy, setFieldBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [knownSkus, setKnownSkus] = useState<string[]>([]);
  const [knownModelCodes, setKnownModelCodes] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [tagDraft, setTagDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);

  const sheet = useMemo(() => makeProductSheet(draft), [draft]);
  const issues = useMemo(
    () => validateProduct(draft, knownSkus, knownModelCodes),
    [draft, knownSkus, knownModelCodes],
  );
  const errors = issues.filter((issue) => issue.severity === "error");
  const pending = useMemo(() => askMissingQuestions(draft), [draft]);
  const selectedVariant = draft.variants[0];
  const mainImage =
    draft.images.find((image) => image.imageNumber === 1) ?? draft.images[0] ?? null;

  useEffect(() => {
    checkOllamaStatus(settings.ollamaEndpoint).then((status) => setOllamaConnected(status.connected));
  }, [settings.ollamaEndpoint, settings.ollamaModel]);

  useEffect(() => {
    let active = true;
    void listProducts().then(async (products) => {
      if (!active) return;
      const others = products.filter((product) => product.id !== draft.id);
      setKnownSkus(others.flatMap((product) => product.variants.map((variant) => variant.sku)));
      setKnownModelCodes(others.map((product) => product.modelCode));
      if (!products.some((product) => product.id === draft.id)) {
        const next = await suggestNextModel(draft.modelPrefix, draft.garmentType);
        if (active && next !== draft.modelNumber) patchDraft({ modelNumber: next });
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
    },
    [],
  );

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  };

  const addProductImage = async (file: File) => {
    const imageNumber = draft.images.length + 1;
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
      try {
        const paths = await persistProductImage(draft.modelCode, file.name, image.finalFilename, file);
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

  const handleAttachments = async (files: FileList | null, addToGallery = true) => {
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
        if (addToGallery) await addProductImage(file);
      } else if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
        attachment.text = await file.text();
      }
      next.push(attachment);
    }
    setAttachments((current) => [...current, ...next]);
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
      const result = await extractProductFieldsFromNaturalInput(
        [clean, textContents].filter(Boolean).join("\n\n") || "Analizá la imagen del producto.",
        settings,
        images,
      );
      applyExtractedBrief(result.data);
      const found = [
        result.data.garmentType && GARMENT_TYPES[result.data.garmentType],
        result.data.colors?.length && `color ${result.data.colors.join(", ")}`,
        result.data.technique && `técnica ${result.data.technique}`,
        result.data.sizes?.length && `talles ${result.data.sizes.join(", ")}`,
        result.data.price && `precio ${formatPrice(result.data.price)}`,
      ].filter(Boolean);
      addMessage({
        role: "assistant",
        content: found.length
          ? `Perfecto. Detecté ${found.join(", ")} y actualicé la ficha. Revisá los datos de la derecha; abajo te marco lo que todavía falta.`
          : "Revisé el mensaje y los adjuntos. No completé datos dudosos: decime qué prenda es, sus colores, talles o precio y seguimos.",
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

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!isTauri()) {
      notify("El dictado con Whisper funciona en la aplicación de escritorio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunks.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(audioChunks.current, { type: recorder.mimeType || "audio/webm" });
          const context = messages.slice(-4).map((item) => item.content).join(" ");
          const result = await transcribeAudio(blob, context, settings);
          if (result.text) setMessage((current) => `${current}${current ? " " : ""}${result.text}`);
          else notify("No detecté voz en la grabación.");
        } catch (error) {
          notify(error instanceof Error ? error.message : "No pude transcribir el audio.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      notify("Necesito permiso para usar el micrófono.");
    }
  };

  const handleDescriptionGeneration = async (tone = selectedTone) => {
    setActionBusy("description");
    setTone(tone);
    try {
      if (ollamaConnected && settings.ollamaModel) {
        const result = await generateProductDescription(draft, settings, tone);
        patchDraft(result);
        notify("Descripción generada con IA");
      } else {
        regenerateDescriptions(tone);
        notify("Descripción generada localmente");
      }
    } catch {
      regenerateDescriptions(tone);
      notify("Descripción generada localmente");
    } finally {
      setActionBusy(null);
    }
  };

  const suggestField = async (field: keyof ProductDraft) => {
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
    setActionBusy("save");
    try {
      await saveProduct(draft);
      await onSaved();
      notify("Producto guardado");
    } catch {
      notify("No pude guardar el producto");
    } finally {
      setActionBusy(null);
    }
  };

  const handleCreateFolder = async () => {
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

  const addTag = () => {
    const clean = tagDraft.trim().toLowerCase();
    if (clean && !draft.tags.includes(clean)) patchDraft({ tags: [...draft.tags, clean] });
    setTagDraft("");
  };

  return (
    <div className="product-creator">
      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}

      <header className="creator-header">
        <div>
          <span className="creator-kicker">
            <Sparkles size={14} /> Asistente de producto
          </span>
          <h1>Crear producto</h1>
          <p>Contale la idea a la IA. La ficha se completa mientras conversan.</p>
        </div>
        <div className="creator-header__actions">
          <StatusDot status={ollamaConnected ? "success" : "warning"}>
            {ollamaConnected ? settings.ollamaModel : "Asistente local"}
          </StatusDot>
          <Button onClick={() => setPreviewOpen(true)}>
            <Eye size={16} /> Vista previa
          </Button>
          <Button onClick={() => onNavigate("settings")}>
            <Settings2 size={16} /> Ajustes
          </Button>
          <Button variant="primary" loading={actionBusy === "save"} onClick={handleSave}>
            <Save size={16} /> Guardar
          </Button>
        </div>
      </header>

      <div className="creator-layout">
        <div className="creator-left">
          <section className="creator-card conversation-card">
            <div className="creator-card__header">
              <div>
                <span className="live-orb" />
                <strong>Asistente ROXWANA</strong>
                <small>{assistantBusy ? "Analizando producto..." : "Listo para escucharte"}</small>
              </div>
              <label className="model-select">
                <select
                  value={settings.ollamaModel}
                  onChange={(event) => setSettings({ ollamaModel: event.target.value })}
                >
                  {RECOMMENDED_OLLAMA_MODELS.map((model) => (
                    <option value={model.name} key={model.name}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
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
                onChange={(event) => void handleAttachments(event.target.files)}
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
              <button type="button" onClick={() => galleryInput.current?.click()}>
                <UploadCloud size={15} /> Agregar imágenes
              </button>
            </div>
            <div className="product-gallery">
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
              <div className="gallery-thumbs">
                {draft.images
                  .filter((image) => image.id !== mainImage?.id)
                  .slice(0, 4)
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
                  <Plus size={22} />
                  <span>Agregar</span>
                </button>
              </div>
            </div>
            <input
              ref={galleryInput}
              hidden
              multiple
              type="file"
              accept="image/*"
              onChange={(event) => void handleAttachments(event.target.files)}
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
                {Math.max(0, 100 - pending.length * 12)}% completo
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
                    {Object.entries(GARMENT_TYPES).map(([code, name]) => (
                      <option value={code} key={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell label="Género" onSuggest={suggestField} busy={fieldBusy}>
                  <select
                    value={draft.gender}
                    onChange={(event) =>
                      patchDraft({ gender: event.target.value as ProductDraft["gender"] })
                    }
                  >
                    <option value="no_definido">No definido</option>
                    <option value="unisex">Unisex</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
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
                  <div className="money-input">
                    <span>$</span>
                    <input
                      type="number"
                      value={draft.price || ""}
                      onChange={(event) => patchDraft({ price: Number(event.target.value) })}
                    />
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
                    {TECHNIQUES.map((technique) => (
                      <option key={technique}>{technique}</option>
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
                      Generar textos
                    </button>
                    <button type="button" onClick={() => setPreviewOpen(true)}>
                      <Eye size={14} /> Vista previa
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="creator-card tags-card">
            <div className="mini-title">
              <Tag size={16} />
              <strong>Etiquetas</strong>
            </div>
            <div className="tag-list">
              {draft.tags.map((tag) => (
                <span key={tag}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => patchDraft({ tags: draft.tags.filter((item) => item !== tag) })}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <div className="tag-add">
                <input
                  value={tagDraft}
                  placeholder="Nueva etiqueta"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button type="button" onClick={addTag}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </section>

          {pending.length > 0 && (
            <section className="creator-card pending-card">
              <div className="mini-title">
                <CircleHelp size={16} />
                <strong>La IA necesita saber</strong>
                <span>{pending.length}</span>
              </div>
              {pending.slice(0, 3).map((question) => (
                <button
                  type="button"
                  key={question.field}
                  onClick={() => {
                    setMessage(question.question);
                    document.querySelector<HTMLTextAreaElement>(".creator-composer textarea")?.focus();
                  }}
                >
                  <span>{question.question}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}

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
              <strong>{selectedVariant?.sku ?? draft.modelCode}</strong>
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
            <div className="barcode-visual">
              <svg ref={barcodeRef} />
              <span>{selectedVariant?.barcodeValue ?? draft.modelCode}</span>
            </div>
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
        </aside>
      </div>

      <footer className="creator-actions">
        <span>
          {folderPath ? (
            <>
              <CheckCircle2 size={15} /> Carpeta lista
            </>
          ) : (
            "Guardá el producto cuando termines de revisarlo."
          )}
        </span>
        <div>
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
      </footer>

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
                <span>{GARMENT_TYPES[draft.garmentType]}</span>
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
