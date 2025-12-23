"use client";

import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Iniciar sesión
          </h1>
          <p className="text-zinc-600">
            Accede a tu cuenta para gestionar tus reservas
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          <LoginForm />

          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-600">
              ¿No tienes una cuenta?{" "}
              <Link
                href="/auth/register"
                className="text-[#103948] hover:text-[#0d2d38] font-medium"
              >
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
