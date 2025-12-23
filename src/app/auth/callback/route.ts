import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Crear respuesta de redirección
  const redirectUrl = "/auth/email-verified";
  let supabaseResponse = NextResponse.redirect(new URL(redirectUrl, request.url));

  if (code) {
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
            supabaseResponse = NextResponse.redirect(new URL(redirectUrl, request.url));
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      // Si hay error, redirigir a login con mensaje de error
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }
  }

  // Retornar la respuesta con las cookies establecidas
  return supabaseResponse;
}

