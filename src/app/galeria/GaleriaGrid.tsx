"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Slide } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/captions.css";

const Lightbox = dynamic(
  () => import("yet-another-react-lightbox"),
  { ssr: false },
);

const lightboxPlugins = [Captions, Counter, Zoom];

export interface GaleriaImage {
  id: string;
  public_url: string;
  caption: string | null;
}

export function GaleriaGrid({ images }: { images: GaleriaImage[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const slides = useMemo<Slide[]>(
    () =>
      images.map((img) => {
        const cap = img.caption?.trim();
        return {
          src: img.public_url,
          alt: cap || "Foto del estudio",
          ...(cap ? { description: cap } : {}),
        };
      }),
    [images],
  );

  const openAt = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  useEffect(() => {
    if (lightboxOpen && slides.length === 0) {
      setLightboxOpen(false);
    }
  }, [lightboxOpen, slides.length]);

  useEffect(() => {
    if (!lightboxOpen || slides.length === 0) return;
    setLightboxIndex((i) =>
      Math.min(Math.max(0, i), slides.length - 1),
    );
  }, [slides.length, lightboxOpen]);

  return (
    <>
      <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, i) => (
          <li
            key={img.id}
            className="flex h-auto flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => openAt(i)}
              className="group block w-full cursor-zoom-in text-left outline-none focus-visible:ring-2 focus-visible:ring-[#103948] focus-visible:ring-offset-2"
              aria-label={
                img.caption?.trim()
                  ? `Ampliar foto: ${img.caption.trim()}`
                  : "Ampliar foto"
              }
            >
              <div className="relative aspect-[4/3] w-full bg-zinc-100">
                <Image
                  src={img.public_url}
                  alt={img.caption?.trim() || "Foto del estudio"}
                  fill
                  priority={i === 0}
                  className="object-cover transition duration-200 group-hover:brightness-[0.97]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            </button>
            {img.caption?.trim() ? (
              <p className="px-3 py-2 text-sm text-zinc-600">
                {img.caption.trim()}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {lightboxOpen ? (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          slides={slides}
          plugins={lightboxPlugins}
          zoom={{ scrollToZoom: true }}
          carousel={{ finite: true }}
          labels={{
            Close: "Cerrar",
            Previous: "Anterior",
            Next: "Siguiente",
          }}
          on={{
            view: ({ index }) => setLightboxIndex(index),
          }}
        />
      ) : null}
    </>
  );
}
