import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { mediaUrl } from "../types";

type Img = { imageUrl: string; id?: string };

type Props = {
  images: Img[];
  alt: string;
  className?: string;
  compact?: boolean;
};

export function ProductGallery({ images, alt, className = "", compact }: Props) {
  const list = images.length ? images : [{ imageUrl: "" }];
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  const current = list[Math.min(index, list.length - 1)];
  const src = mediaUrl(current?.imageUrl);

  const prev = () => setIndex((i) => (i - 1 + list.length) % list.length);
  const next = () => setIndex((i) => (i + 1) % list.length);

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current == null || list.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (dx > 40) prev();
    if (dx < -40) next();
    touchX.current = null;
  };

  return (
    <>
      <div className={`relative overflow-hidden bg-cream-deep ${className}`}>
        <div
          className="relative aspect-[3/4] w-full"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {src ? (
            <img src={src} alt={alt} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">Sem foto</div>
          )}

          {list.length > 1 && !compact ? (
            <>
              <button
                type="button"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 p-1.5 shadow"
                onClick={prev}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 p-1.5 shadow"
                onClick={next}
                aria-label="Próxima foto"
              >
                <ChevronRight size={18} />
              </button>
            </>
          ) : null}

          {src ? (
            <button
              type="button"
              className="absolute right-2 bottom-2 rounded-full bg-surface/90 p-1.5 shadow"
              onClick={() => setZoomed(true)}
              aria-label="Ampliar"
            >
              <ZoomIn size={16} />
            </button>
          ) : null}

          {list.length > 1 ? (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {list.map((img, i) => (
                <button
                  key={img.id || i}
                  type="button"
                  className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-rose" : "bg-white/80"}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Foto ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {!compact && list.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto p-2">
            {list.map((img, i) => (
              <button
                key={img.id || i}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-16 w-12 shrink-0 overflow-hidden rounded-md border ${
                  i === index ? "border-rose" : "border-line"
                }`}
              >
                <img src={mediaUrl(img.imageUrl)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {zoomed && src ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setZoomed(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/90 p-2"
            onClick={() => setZoomed(false)}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
          {list.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
              >
                <ChevronRight size={22} />
              </button>
            </>
          ) : null}
          <img
            src={mediaUrl(list[index]?.imageUrl)}
            alt={alt}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
