

## Plan: Authentication + User Profile Page

### Overview
Create a login/signup flow using Supabase Auth and a profile page where users can manage their delivery information (address, CEP, phone, etc.). No card storage — the checkout happens via Shopify.

### Database

**Migration: Create `profiles` table**
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  cpf TEXT,
  cep TEXT,
  address TEXT,
  address_number TEXT,
  address_complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### New Files

1. **`src/hooks/useAuth.ts`** — Auth context hook: `useAuth()` returning `{ user, loading, signIn, signUp, signOut }` using `supabase.auth.onAuthStateChange` + `getSession`.

2. **`src/pages/Login.tsx`** — Login/Signup page with tabs:
   - Email + password login
   - Email + password signup
   - Uses Supabase `signInWithPassword` and `signUp`
   - Redirects to `/perfil` on success
   - Styled with existing DM Sans font, primary green colors, matching site design

3. **`src/pages/Profile.tsx`** — Profile/account page (protected):
   - Header + AnnouncementBar (consistent with other pages)
   - Form with fields: nome completo, telefone, CPF, CEP (with auto-fill via ViaCEP API), endereço, número, complemento, bairro, cidade, estado
   - Fetches and saves to `profiles` table
   - Logout button
   - No card information (checkout is via Shopify)

4. **`src/components/ProtectedRoute.tsx`** — Wrapper that redirects to `/login` if not authenticated.

### Modified Files

5. **`src/App.tsx`** — Add routes: `/login`, `/perfil` (wrapped in ProtectedRoute). Wrap app in auth provider.

6. **`src/components/sections/Header.tsx`** — Wire the User icon button: if logged in, navigate to `/perfil`; if not, navigate to `/login`.

### Flow
- User clicks the User icon in header → goes to `/login` or `/perfil`
- After login/signup, redirected to `/perfil`
- Profile form auto-fills CEP data from ViaCEP (`viacep.com.br/ws/{cep}/json`)
- All profile data persisted in Supabase `profiles` table with RLS

