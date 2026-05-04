import RegisterForm from "@/components/auth/RegisterForm";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ redirect?: string; email?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const redirectTo = params.redirect ?? undefined;
  const defaultEmail = params.email?.trim() || undefined;
  const loginHref = redirectTo
    ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}`
    : "/auth/login";

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Crear cuenta
          </h1>
          <p className="text-zinc-600">
            Regístrate para acceder a todos los beneficios
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          <RegisterForm
            redirectTo={redirectTo}
            defaultEmail={defaultEmail}
          />

          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-600">
              ¿Ya tienes una cuenta?{" "}
              <Link
                href={loginHref}
                className="text-[#103948] hover:text-[#0d2d38] font-medium"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
