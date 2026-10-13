/**
 * `cielo-reconcile` — varre `authorizing` (idade > SAFE_RELEASE_MIN) e `void_failed` (H1/H2/H3).
 * Guardada por Authorization Bearer == service key OU `CIELO_RECONCILE_SECRET` (tempo constante).
 * Sem CORS (chamada servidor-a-servidor, cron). NÃO checa ALELO_ENABLED: pendências devem
 * resolver mesmo com o kill-switch desligado.
 * Alerta sem PII: só merchantOrderId, evento, status e idade.
 *
 * ponytail: lote de 50 por execução, sequencial; cron a cada 1-5 min (deploy = sessão principal).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { findSalesByMerchantOrderId, getSale, voidSale, type CieloSale } from "../_shared/cielo-client.ts";
import { deleteDraftOrder } from "../_shared/shopify-draft-order.ts";
import { classifySale, defaultSendAlert, findIdsOrEmpty, getDraftOrderStatus, isSameBrtDay, SAFE_RELEASE_MIN, type DraftStatus, type SendAlert } from "../_shared/cielo-support.ts";

export interface PendingRow {
  id: string;
  merchant_order_id: string;
  cielo_payment_id: string | null;
  status: string; // authorizing | void_failed
  shopify_draft_order_id: string | null;
  created_at: string;
}

export interface ReconcileDeps {
  secrets: { serviceKey: string | null; reconcileSecret: string | null };
  db: {
    listPending(olderThanIso: string, limit: number): Promise<PendingRow[]>;
    update(id: string, patch: Record<string, unknown>): Promise<void>;
  };
  cielo: {
    findSalesByMerchantOrderId(id: string): Promise<string[]>;
    getSale(paymentId: string): Promise<CieloSale>;
    voidSale(paymentId: string, amountCents: number): Promise<CieloSale>;
  };
  draft: { getStatus(id: string): Promise<DraftStatus>; delete(id: string): Promise<void> };
  sendAlert: SendAlert;
  now(): Date;
}

export interface ReconcileSummary {
  checked: number;
  approved: number;
  voided: number;
  alerted: number;
}

/** Comparação em tempo constante via SHA-256 (tamanho fixo => sem vazar comprimento). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function authorized(req: Request, s: ReconcileDeps["secrets"]): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  let ok = false;
  for (const secret of [s.serviceKey, s.reconcileSecret]) {
    if (secret && (await safeEqual(token, secret))) ok = true;
  }
  return ok;
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handleCieloReconcile(req: Request, deps: ReconcileDeps): Promise<Response> {
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  if (!(await authorized(req, deps.secrets))) return json({ code: "unauthorized" }, 401);

  const now = deps.now();
  const cutoff = new Date(now.getTime() - SAFE_RELEASE_MIN * 60_000).toISOString();
  const rows = await deps.db.listPending(cutoff, 50);
  const sum: ReconcileSummary = { checked: 0, approved: 0, voided: 0, alerted: 0 };

  for (const row of rows) {
    sum.checked++;
    const ageMin = Math.round((now.getTime() - new Date(row.created_at).getTime()) / 60_000);
    const alert = async (event: string, status?: string) => {
      sum.alerted++;
      try {
        await deps.sendAlert({ merchantOrderId: row.merchant_order_id, event, status, ageMin });
      } catch {
        /* nunca derruba a varredura */
      }
    };

    try {
      // 1. Descobrir a venda
      let paymentId = row.cielo_payment_id;
      if (!paymentId) {
        const ids = await findIdsOrEmpty(deps.cielo.findSalesByMerchantOrderId, row.merchant_order_id);
        if (ids.length === 0) {
          // H1: lista vazia + idade > SAFE_RELEASE_MIN (garantida pelo filtro) => libera o cart
          await deps.db.update(row.id, { status: "error", error: "cielo_reconcile_empty:0" });
          if (row.shopify_draft_order_id) await deps.draft.delete(row.shopify_draft_order_id);
          console.log(`[cielo-reconcile] released empty ${row.merchant_order_id}`);
          continue;
        }
        if (ids.length > 1) {
          await alert("multiple_payments", row.status);
          continue;
        }
        paymentId = ids[0];
      }
      const sale = await deps.cielo.getSale(paymentId);
      await deps.db.update(row.id, { cielo_payment_id: sale.paymentId, cielo_status: sale.status, cielo_return_code: sale.returnCode });

      const kind = classifySale(sale);
      const sameDay = isSameBrtDay(new Date(row.created_at), now);
      const voidAuto = async (error: string) => {
        try {
          await deps.cielo.voidSale(sale.paymentId, sale.amountCents);
          await deps.db.update(row.id, { status: "voided_auto", error });
          if (row.shopify_draft_order_id) await deps.draft.delete(row.shopify_draft_order_id);
          sum.voided++;
        } catch {
          await deps.db.update(row.id, { status: "void_failed", error: "void_failed:0" });
          await alert("void_failed", "void_failed");
        }
      };

      // 2. Já anulada fora do nosso fluxo
      if (kind === "voided") {
        await deps.db.update(row.id, { status: "voided_manual" });
        if (row.shopify_draft_order_id) await deps.draft.delete(row.shopify_draft_order_id);
        continue;
      }
      // 3. Recusada
      if (kind === "declined") {
        await deps.db.update(row.id, { status: "declined" });
        if (row.shopify_draft_order_id) await deps.draft.delete(row.shopify_draft_order_id);
        continue;
      }
      // 4. Não terminal (0/1/12/desconhecido): mantém e alerta. M4: Authorized (1) retém saldo —
      // linha `authorizing` (já > SAFE_RELEASE_MIN pelo filtro) em D0 é anulada; após D0 só alerta.
      if (kind === "pending") {
        if (sale.status === 1 && row.status === "authorizing" && sameDay) {
          await alert("authorized_voided", "1");
          await voidAuto("reconcile_void_authorized:0");
        } else {
          await alert("non_terminal", String(sale.status));
        }
        continue;
      }

      // 5. Aprovada sem pedido: draft COMPLETED => approved; senão D0 => void; senão alerta
      if (row.shopify_draft_order_id) {
        try {
          const st = await deps.draft.getStatus(row.shopify_draft_order_id);
          if (st.status === "COMPLETED" && st.order) {
            await deps.db.update(row.id, { status: "approved", shopify_order_id: st.order.id, shopify_order_name: st.order.name });
            sum.approved++;
            continue;
          }
        } catch {
          // H3: não sabemos se virou pedido => não anula
          await alert("draft_status_unknown", row.status);
          continue;
        }
      }
      if (!sameDay) {
        await alert("past_d0_manual", row.status); // só Alelo estorna depois de D0
        continue;
      }
      await voidAuto("reconcile_void:0");
    } catch {
      console.error(`[cielo-reconcile] lookup failed ${row.merchant_order_id}`);
      await alert("lookup_failed", row.status);
    }
  }
  return json(sum, 200);
}

export function buildDefaultDeps(): ReconcileDeps {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return {
    secrets: {
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null,
      reconcileSecret: Deno.env.get("CIELO_RECONCILE_SECRET") ?? null,
    },
    db: {
      async listPending(olderThanIso, limit) {
        const { data, error } = await client
          .from("cielo_transactions")
          .select("id, merchant_order_id, cielo_payment_id, status, shopify_draft_order_id, created_at")
          .or(`and(status.eq.authorizing,created_at.lt.${olderThanIso}),status.eq.void_failed`)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) throw new Error("cielo_reconcile_list_failed");
        return (data ?? []) as PendingRow[];
      },
      async update(id, patch) {
        const { error } = await client.from("cielo_transactions").update(patch).eq("id", id);
        if (error) console.error(`[cielo-reconcile] update_failed ${id}`);
      },
    },
    cielo: { findSalesByMerchantOrderId, getSale, voidSale },
    draft: { getStatus: getDraftOrderStatus, delete: deleteDraftOrder },
    sendAlert: defaultSendAlert,
    now: () => new Date(),
  };
}
