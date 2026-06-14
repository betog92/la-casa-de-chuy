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

const HERO_EYEBROW = "XV años y boda · Monterrey";
const HERO_TITLE = "Recuerdos que merecen un gran escenario";
const HERO_SUBTITLE =
  "Locación fotográfica en Monterrey para tus XV años y boda. Tú vives el momento; nosotros lo volvemos inolvidable.";

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

      {/* Desktop: bloque centrado, texto alineado a la izquierda (editorial) */}
      <div className="absolute inset-0 z-10 hidden items-center justify-center px-4 text-white pointer-events-none sm:flex">
        <div className="pointer-events-auto w-full max-w-xl text-left lg:max-w-2xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-[#E8B89A] drop-shadow-sm md:text-sm">
            {HERO_EYEBROW}
          </p>
          <h1
            className="mb-4 text-4xl font-bold leading-[1.12] tracking-tight drop-shadow-md md:text-5xl lg:text-[3.25rem] lg:leading-[1.08]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            {HERO_TITLE}
          </h1>
          <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/90 drop-shadow lg:text-xl">
            {HERO_SUBTITLE}
          </p>
          <Link
            href={reservarHref}
            className="inline-block rounded-full bg-white px-10 py-4 text-lg font-semibold text-[#103948] shadow-lg transition hover:shadow-xl"
          >
            Agendar mi sesión
          </Link>
        </div>
      </div>

      {/* Móvil: bloque centrado, texto a la izquierda; CTA abajo */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between px-4 pb-8 pt-6 text-white pointer-events-none sm:hidden">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="pointer-events-auto w-full max-w-xl text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#E8B89A]">
              {HERO_EYEBROW}
            </p>
            <h1
              className="mb-2 text-3xl font-bold leading-tight tracking-tight drop-shadow-md"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              {HERO_TITLE}
            </h1>
            <p className="text-base leading-snug text-white/95 drop-shadow">
              {HERO_SUBTITLE}
            </p>
          </div>
        </div>
        <Link
          href={reservarHref}
          className="pointer-events-auto block w-full max-w-xl shrink-0 rounded-full bg-white px-8 py-3.5 text-center text-base font-semibold text-[#103948] shadow-lg transition hover:shadow-xl"
        >
          Agendar mi sesión
        </Link>
      </div>

      {/* Controles del carrusel: solo tablet/desktop */}
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
