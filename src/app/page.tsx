import Link from "next/link";
import HeroCarousel from "@/components/HeroCarousel";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      {/* Hero carrusel */}
      <HeroCarousel />

      {/* Información del Estudio */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-4xl font-bold text-zinc-900">
            Sobre Nuestro Estudio
          </h2>
          
          <div className="grid gap-8 md:grid-cols-2">
            {/* Horarios */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-2xl font-semibold text-zinc-900">
                Horarios
              </h3>
              <div className="space-y-3 text-zinc-700">
                <div>
                  <p className="font-semibold">Lunes a Sábado</p>
                  <p className="text-zinc-600">11:00 AM - 7:00 PM</p>
                </div>
                <div>
                  <p className="font-semibold">Domingo</p>
                  <p className="text-zinc-600">11:00 AM - 4:00 PM</p>
                </div>
                <p className="mt-4 text-sm text-zinc-500">
                  Sesiones de 1 hora (45 min interior + 15 min jardín)
                </p>
              </div>
            </div>

            {/* Precios */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-2xl font-semibold text-zinc-900">
                Precios
              </h3>
              <div className="space-y-3 text-zinc-700">
                <div>
                  <p className="font-semibold">Horario regular</p>
                  <p className="text-zinc-600">Lunes a sábado: $1,500 MXN por hora</p>
                </div>
                <div>
                  <p className="font-semibold">Domingos y días festivos</p>
                  <p className="text-zinc-600">$1,500 MXN por hora + $500 MXN por hora adicional ($2,000 MXN por hora)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Características */}
      <section className="bg-zinc-50 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 text-center text-4xl font-bold text-zinc-900">
              ¿Por qué elegirnos?
            </h2>
            
            <div className="grid gap-6 md:grid-cols-3">
              <div className="text-center">
                <div className="mb-4 text-4xl">📸</div>
                <h3 className="mb-2 text-xl font-semibold text-zinc-900">
                  Espacios Únicos
                </h3>
                <p className="text-zinc-600">
                  Ambientes interiores y jardín diseñados para tus proyectos
                </p>
              </div>
              
              <div className="text-center">
                <div className="mb-4 text-4xl">⏰</div>
                <h3 className="mb-2 text-xl font-semibold text-zinc-900">
                  Reserva Fácil
                </h3>
                <p className="text-zinc-600">
                  Sistema de reservas en línea simple y rápido
                </p>
              </div>
              
              <div className="text-center">
                <div className="mb-4 text-4xl">💰</div>
                <h3 className="mb-2 text-xl font-semibold text-zinc-900">
                  Precios Transparentes
                </h3>
                <p className="text-zinc-600">
                  Sin sorpresas, precios claros desde el inicio
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-zinc-900">
            ¿Listo para tu sesión?
          </h2>
          <p className="mb-8 text-lg text-zinc-600">
            Reserva tu espacio ahora y asegura tu fecha preferida
          </p>
          <Link
            href="/reservar"
            className="inline-block rounded-lg bg-zinc-900 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-zinc-800 hover:shadow-lg"
          >
            Iniciar Reserva
          </Link>
        </div>
      </section>
    </div>
  );
}
