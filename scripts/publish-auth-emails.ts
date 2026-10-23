// Publica os templates de e-mail de autenticação (supabase/templates/*.html) no projeto Supabase.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:emails
import { readFileSync } from "node:fs";

const PROJECT_REF = "hofohxvizlmawgkinwwz";
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN não está definido (token pessoal sbp_ do Supabase).");
  process.exit(1);
}

// template → assunto. As notificações de segurança (password_changed etc.) estão desligadas no projeto.
const EMAILS: Record<string, string> = {
  confirmation: "Confirmar conta - JILO",
  recovery: "Redefinir senha - JILO",
  magic_link: "Seu link de acesso - JILO",
  email_change: "Confirmar troca de e-mail - JILO",
  invite: "Seu convite para a Jiló - JILO",
  reauthentication: "Seu código de confirmação - JILO",
};

const payload: Record<string, string> = {};
for (const [name, subject] of Object.entries(EMAILS)) {
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = readFileSync(`supabase/templates/${name}.html`, "utf8");
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const res = await fetch(URL, { method: "PATCH", headers, body: JSON.stringify(payload) });
if (!res.ok) {
  console.error(`PATCH falhou: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const live = await (await fetch(URL, { headers })).json();
let ok = true;
for (const [key, value] of Object.entries(payload)) {
  const match = live[key] === value;
  if (!match) ok = false;
  console.log(`${match ? "ok  " : "DIFF"} ${key}`);
}
process.exit(ok ? 0 : 1);
