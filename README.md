This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Configuración de Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_supabase_aqui
# Service Role Key - Solo para uso en API routes del servidor (NUNCA exponer en frontend)
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_supabase_aqui

# Conekta - Public Key (MODO PRUEBA - para frontend)
# Obtén tu Public Key desde el dashboard de Conekta: https://admin.conekta.com
# Asegúrate de estar en modo Test/Sandbox para obtener las keys de prueba
NEXT_PUBLIC_CONEKTA_PUBLIC_KEY=tu_public_key_conekta_aqui

# Conekta - Private Key (MODO PRUEBA - SOLO para backend, NUNCA exponer en frontend)
# Esta key se usa únicamente en las API routes del servidor
CONEKTA_PRIVATE_KEY=tu_private_key_conekta_aqui
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
