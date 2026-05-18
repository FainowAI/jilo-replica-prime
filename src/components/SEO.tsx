import { Helmet } from "react-helmet-async";
import { SITE_URL } from "@/config/site";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  ogType?: "website" | "product" | "article";
  image?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const SEO = ({ title, description, path, ogType = "website", image, jsonLd }: SEOProps) => {
  const url = `${SITE_URL}${path}`;
  const ogImage = image || `${SITE_URL}/og-image.jpg`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  );
};

export default SEO;
