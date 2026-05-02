import { Check, X, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";

const PREVIEW_SIZE = 240;
const OUTPUT_SIZE = 512;

interface AvatarCropModalProps {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export function AvatarCropModal({ src, onConfirm, onCancel }: AvatarCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [minScale, setMinScale] = useState(0.1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function onLoad() {
    const img = imgRef.current;
    if (!img) return;
    const ms = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight);
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setMinScale(ms);
    setScale(ms);
    setOffset({ x: 0, y: 0 });
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    let lastX = e.clientX;
    let lastY = e.clientY;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Touch drag
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    let lastX = e.touches[0].clientX;
    let lastY = e.touches[0].clientY;

    function onMove(ev: TouchEvent) {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const dx = ev.touches[0].clientX - lastX;
      const dy = ev.touches[0].clientY - lastY;
      lastX = ev.touches[0].clientX;
      lastY = ev.touches[0].clientY;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale((prev) => Math.min(Math.max(prev * factor, minScale), 10));
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || naturalSize.w === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Screen→image mapping:
    // background left = (PREVIEW_SIZE - nW*scale)/2 + offset.x
    // screen pixel sx → image pixel: (sx - bgLeft) / scale
    // For sx=0 (left edge of crop square):
    //   srcX = (0 - bgLeft) / scale = nW/2 - (PREVIEW_SIZE/2 + offset.x) / scale
    const srcSize = PREVIEW_SIZE / scale;
    const srcX = naturalSize.w / 2 - (PREVIEW_SIZE / 2 + offset.x) / scale;
    const srcY = naturalSize.h / 2 - (PREVIEW_SIZE / 2 + offset.y) / scale;

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }

  const loaded = naturalSize.w > 0;

  // Background position expressed as absolute px so there is no ambiguity
  // with how browsers resolve % inside calc() for background-position.
  // bgLeft = (PREVIEW_SIZE - nW*scale)/2 + offset.x  → image is centered + shifted
  const bgX = (PREVIEW_SIZE - naturalSize.w * scale) / 2 + offset.x;
  const bgY = (PREVIEW_SIZE - naturalSize.h * scale) / 2 + offset.y;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-semibold">Ajuster l'image</span>
          <button className="text-slate-400 hover:text-white" onClick={onCancel} type="button">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Crop area */}
          <div
            className="mx-auto select-none overflow-hidden rounded-full"
            style={{
              width: PREVIEW_SIZE,
              height: PREVIEW_SIZE,
              backgroundImage: loaded ? `url(${src})` : "none",
              backgroundSize: `${naturalSize.w * scale}px ${naturalSize.h * scale}px`,
              backgroundPosition: `${bgX}px ${bgY}px`,
              backgroundRepeat: "no-repeat",
              backgroundColor: "#111",
              cursor: "grab",
            }}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            onWheel={onWheel}
          >
            {!loaded && (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Chargement…
              </div>
            )}
          </div>

          {/* Hidden img – used only for natural dimensions + canvas.drawImage */}
          <img ref={imgRef} src={src} alt="" className="hidden" onLoad={onLoad} />

          {/* Zoom slider */}
          <div className="mt-4 flex items-center gap-2">
            <ZoomOut className="shrink-0 text-slate-400" size={16} />
            <input
              className="flex-1"
              max="5"
              min={String(minScale.toFixed(3))}
              onChange={(e) => setScale(Number(e.target.value))}
              step="0.01"
              type="range"
              value={scale}
            />
            <ZoomIn className="shrink-0 text-slate-400" size={16} />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            Glissez pour repositionner · Molette ou curseur pour zoomer
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button className="btn-ghost" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary" disabled={!loaded} onClick={confirm} type="button">
            <Check size={16} />
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
