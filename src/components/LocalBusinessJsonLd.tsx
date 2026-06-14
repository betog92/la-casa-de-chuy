import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site-seo";

export function LocalBusinessJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    image: `${SITE_URL}/hero/hero-01.jpg`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "José María Arteaga #1111 Oriente",
      addressLocality: "Monterrey",
      addressRegion: "Nuevo León",
      postalCode: "64000",
      addressCountry: "MX",
    },
    areaServed: {
      "@type": "City",
      name: "Monterrey",
    },
    priceRange: "$$",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
