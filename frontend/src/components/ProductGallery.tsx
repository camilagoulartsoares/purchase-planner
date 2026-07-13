import { useEffect, useRef, useState, type TouchEvent, type MouseEvent } from "react";
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
  const current = list[Math.min(index, list.length - 1)];
  const src = mediaUrl(current?.imageUrl);
  const hasCarousel = list.length > 1;

  useEffect(() => {
    setIndex(0);
  }, [images]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
      if (event.key === "ArrowLeft" && hasCarousel) {
        setIndex((i) => (i - 1 + list.length) % list.length);
      }
      if (event.key === "ArrowRight" && hasCarousel) {
        setIndex((i) => (i + 1) % list.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasCarousel, list.length, zoomed]);

  const prev = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setIndex((i) => (i - 1 + list.length) % list.length);
  };
  const next = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setIndex((i) => (i + 1) % list.length);
  };

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current == null || !hasCarousel) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (dx > 40) setIndex((i) => (i - 1 + list.length) % list.length);
    if (dx < -40) setIndex((i) => (i + 1) % list.length);
    touchX.current = null;
  };

  const arrowClass = compact
    ? "gallery-arrow absolute top-1/2 z-10 -translate-y-1/2"
    : "gallery-arrow absolute top-1/2 z-10 -translate-y-1/2";

  return (
    <>
      <div className={`relative overflow-hidden bg-cream-deep ${className}`}>
        <div
          className="relative aspect-[3/4] w-full select-none"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {src ? (
            <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">Sem foto</div>
          )}

          {hasCarousel ? (
            <>
              <button
                type="button"
                className={`${arrowClass} left-2`}
                onClick={prev}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={compact ? 16 : 18} />
              </button>
              <button
                type="button"
                className={`${arrowClass} right-2`}
                onClick={next}
                aria-label="Próxima foto"
              >
                <ChevronRight size={compact ? 16 : 18} />
              </button>
            </>
          ) : null}

          {src ? (
            <button
              type="button"
              className="gallery-zoom absolute right-2 bottom-2 z-20"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setZoomed(true);
              }}
              aria-label="Ampliar"
            >
              <ZoomIn size={16} />
            </button>
          ) : null}

          {hasCarousel ? (
            <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {list.map((img, i) => (
                <button
                  key={img.id || i}
                  type="button"
                  className={`h-1.5 rounded-full transition ${
                    i === index ? "w-4 bg-rose" : "w-1.5 bg-white/80"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIndex(i);
                  }}
                  aria-label={`Foto ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {!compact && hasCarousel ? (
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
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
            }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
          {hasCarousel ? (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2"
                onClick={prev}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2"
                onClick={next}
                aria-label="Próxima foto"
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
