-- Faixas de desconto por quantidade
CREATE TABLE IF NOT EXISTS public.kit_discount_tiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quantity INTEGER NOT NULL UNIQUE,
  discount_pct INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kit_discount_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read kit_discount_tiers" ON public.kit_discount_tiers FOR SELECT USING (true);

INSERT INTO public.kit_discount_tiers (quantity, discount_pct, label) VALUES
  (7, 10, 'Kit de 7'),
  (14, 15, 'Kit de 14'),
  (21, 20, 'Kit de 21'),
  (28, 25, 'Kit de 28');

-- Templates dos kits temáticos (metadata, NÃO preço)
CREATE TABLE IF NOT EXISTS public.kit_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  shopify_product_type TEXT NOT NULL,
  description TEXT,
  positioning TEXT,
  bg_color TEXT DEFAULT '#1e3a1e',
  emoji TEXT DEFAULT '🍱',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kit_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read kit_templates" ON public.kit_templates FOR SELECT USING (true);

INSERT INTO public.kit_templates (name, slug, shopify_product_type, description, positioning, bg_color, emoji, sort_order) VALUES
  ('Kit Leveza', 'kit-leveza', 'Aves e Suinos', '7 preparos — Ave & Suína', 'Sabor do dia a dia, leve e reconfortante', '#1e3a1e', '🍗', 1),
  ('Kit Sabor', 'kit-sabor', 'Peixes e Massas', '7 preparos — Embutidos, Peixe & Massa', 'Variedade e descoberta a cada refeição', '#6b4226', '🐟', 2),
  ('Kit Força', 'kit-forca', 'Bovinos', '7 preparos — Bovinos', 'Proteína de alto valor para quem não abre mão', '#2c3e50', '🥩', 3),
  ('Kit Verde', 'kit-verde', 'Veganos', '7 preparos — Health (plant-based)', 'Alimentação consciente sem abrir mão do sabor', '#4a5c2f', '🌱', 4);
