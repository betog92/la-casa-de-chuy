import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthErrorMessage } from "@/utils/auth-error-messages";
import { syncUserToDatabase } from "@/lib/supabase/user-sync";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");

  // Determinar la URL de redirección según el tipo
  // Si type=recovery, es reset de contraseña; de lo contrario, es verificación de email
  const redirectUrl =
    type === "recovery" ? "/auth/reset-password" : "/auth/email-verified";

  // Validar que hay código
  if (!code) {
    const errorMessage = "Código de verificación faltante";
    const errorRedirect =
      type === "recovery"
        ? `/auth/reset-password?error=${encodeURIComponent(errorMessage)}`
        : `/auth/login?error=${encodeURIComponent(errorMessage)}`;
    return NextResponse.redirect(new URL(errorRedirect, request.url));
  }

  let supabaseResponse = NextResponse.redirect(
    new URL(redirectUrl, request.url)
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Crear nueva respuesta y establecer cookies correctamente en la respuesta
          supabaseResponse = NextResponse.redirect(
            new URL(redirectUrl, request.url)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Traducir el error antes de redirigir
    const translatedError = getAuthErrorMessage(error.message);
    const errorRedirect =
      type === "recovery"
        ? `/auth/reset-password?error=${encodeURIComponent(translatedError)}`
        : `/auth/login?error=${encodeURIComponent(translatedError)}`;
    return NextResponse.redirect(new URL(errorRedirect, request.url));
  }

  // Sincronizar usuario después de autenticación exitosa
  // Solo si no es recovery (cuando es recovery, aún no tienen sesión establecida)
  if (type !== "recovery") {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.email) {
        // Sincronizar usuario usando función helper
        // No interrumpimos el flujo si falla, solo logueamos
        await syncUserToDatabase(user);
      }
    } catch (syncError) {
      // No interrumpimos el flujo si falla la sincronización
      // El usuario ya está autenticado y puede usar la app
      console.error("Error syncing user in callback:", syncError);
    }
  }

  // Retornar la respuesta con las cookies establecidas
  return supabaseResponse;
}
