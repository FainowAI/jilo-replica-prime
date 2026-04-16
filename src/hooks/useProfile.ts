import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: TablesUpdate<"profiles">) => {
      if (!user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedProfile) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      // Dispara sync Shopify se ainda não existe shopify_customer_id
      // Fire-and-forget: se falhar, não impacta a UX (perfil já foi salvo)
      if (updatedProfile && !updatedProfile.shopify_customer_id) {
        try {
          const { data, error } = await supabase.functions.invoke("shopify-customer-sync");
          if (error) {
            console.warn("Shopify sync failed:", error);
          } else {
            console.info("Shopify sync result:", data);
            // Re-invalidar profile pra pegar o shopify_customer_id atualizado
            queryClient.invalidateQueries({ queryKey: ["profile"] });
          }
        } catch (err) {
          console.warn("Shopify sync threw:", err);
        }
      }
    },
  });
};
