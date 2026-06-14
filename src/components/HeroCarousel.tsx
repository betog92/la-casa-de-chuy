"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

const HERO_IMAGES = Array.from({ length: 7 }, (_, i) =>
  `/hero/hero-${String(i + 1).padStart(2, "0")}.jpg`
);

type HeroCarouselProps = {
  reservarHref?: string;
};

export default function HeroCarousel({
  reservarHref = "/reservar",
}: HeroCarouselProps) {
  const swiperRef = useRef<SwiperType | null>(null);
  const [autoplayRunning, setAutoplayRunning] = useState(true);

  const toggleAutoplay = () => {
    if (!swiperRef.current) return;
    if (autoplayRunning) {
      swiperRef.current.autoplay.stop();
    } else {
      swiperRef.current.autoplay.start();
    }
    setAutoplayRunning(!autoplayRunning);
  };

  return (
    <section className="relative w-full">
      <Swiper
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={0}
        slidesPerView={1}
        loop
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        pagination={{
          clickable: true,
          el: ".hero-pagination",
        }}
        navigation={{
          prevEl: ".hero-prev",
          nextEl: ".hero-next",
        }}
        className="hero-swiper relative h-[50vh] min-h-[320px] w-full lg:h-[65vh]"
      >
        {HERO_IMAGES.map((src, index) => (
          <SwiperSlide key={src}>
            <div className="relative h-full w-full">
              <Image
                src={src}
                alt={`La Casa de Chuy el Rico - imagen ${index + 1}`}
                fill
                className="object-cover"
                sizes="100vw"
                priority={index === 0}
              />
              <div
                className="absolute inset-0 bg-black/30"
                aria-hidden
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Overlay: en móvil texto arriba y CTA anclado abajo; en desktop todo centrado */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between gap-0 px-4 pb-8 pt-6 text-center text-white pointer-events-none sm:justify-center sm:gap-8 sm:px-4 sm:py-0">
        <div className="flex flex-1 flex-col items-center justify-center sm:flex-none">
          <div className="pointer-events-auto w-full max-w-xl">
            <h1
              className="mb-2 text-3xl font-bold leading-tight tracking-tight drop-shadow-md sm:mb-3 sm:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              Recuerdos que merecen un gran escenario
            </h1>
            <p className="text-base leading-snug text-white/95 drop-shadow sm:text-xl sm:leading-relaxed lg:text-2xl">
              Locación fotográfica en Monterrey para tus XV años y boda. Tú vives el momento; nosotros lo volvemos inolvidable.
            </p>
          </div>
        </div>
        <div className="pointer-events-auto w-full max-w-[17rem] shrink-0 sm:mt-0 sm:w-auto sm:max-w-none">
          <Link
            href={reservarHref}
            className="block w-full rounded-full bg-white px-8 py-3.5 text-base font-semibold text-[#103948] shadow-lg transition hover:shadow-xl sm:inline-block sm:px-10 sm:py-4 sm:text-lg"
          >
            Agendar mi sesión
          </Link>
        </div>
      </div>

      {/* Controles del carrusel: solo tablet/desktop; en móvil basta swipe + autoplay */}
      <div className="absolute bottom-6 left-0 right-0 z-20 hidden items-center justify-center gap-4 px-6 sm:flex sm:px-8">
        <button
          type="button"
          className="hero-prev flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 p-2 text-[#103948] transition hover:bg-white"
          aria-label="Anterior"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="hero-pagination flex gap-2" />

        <button
          type="button"
          className="hero-next flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 p-2 text-[#103948] transition hover:bg-white"
          aria-label="Siguiente"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleAutoplay}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 p-2 text-[#103948] transition hover:bg-white"
          aria-label={autoplayRunning ? "Pausar" : "Reproducir"}
        >
          {autoplayRunning ? (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
      </div>
    </section>
  );
}
