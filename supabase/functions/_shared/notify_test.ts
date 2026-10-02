import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildEmail, escapeHtml, sendEmail, sendExpoPush, sendUnconfigured, webLink, type OutboxRow } from "./notify.ts";

const row = (o: Partial<OutboxRow> = {}): OutboxRow => ({
  outbox_id: 1, notification_id: "n1", user_id: "u1", channel: "email", attempts: 1,
  title: "Paiement confirmé", body: "90 000 FCFA reçus", route: "/mes-voyages/abc", meta: {}, email: "awa@x.ci", phone: null, ...o,
});

Deno.test("escapeHtml neutralise le HTML", () => {
  assertEquals(escapeHtml(`<script>"x"&'y'</script>`), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
});

Deno.test("webLink : chemins internes uniquement", () => {
  assertEquals(webLink("/mes-voyages/1", "https://s.ci/"), "https://s.ci/mes-voyages/1");
  assertEquals(webLink("//evil.com", "https://s.ci"), null);
  assertEquals(webLink("https://evil.com", "https://s.ci"), null);
  assertEquals(webLink("/(tabs)/wallet", "https://s.ci"), null);
  assertEquals(webLink(null, "https://s.ci"), null);
});

Deno.test("buildEmail échappe titre/corps et ajoute le lien", () => {
  const { subject, html } = buildEmail(row({ title: "<b>Hack</b>", body: `"><img src=x>` }), "https://s.ci");
  assertEquals(subject, "<b>Hack</b>");
  assert(!html.includes("<img src=x>"));
  assert(!html.includes("<b>Hack</b>"));
  assert(html.includes('href="https://s.ci/mes-voyages/abc"'));
});

Deno.test("sendEmail : sans clé -> skipped ; avec clé -> appel Resend", async () => {
  Deno.env.delete("RESEND_API_KEY");
  assertEquals((await sendEmail(row(), "https://s.ci")).status, "skipped");

  Deno.env.set("RESEND_API_KEY", "re_test");
  const orig = globalThis.fetch;
  let seen: { url: string; body: Record<string, unknown>; auth: string | null } | null = null;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    seen = { url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("Authorization") };
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    assertEquals((await sendEmail(row(), "https://s.ci")).status, "sent");
    assertEquals(seen!.url, "https://api.resend.com/emails");
    assertEquals(seen!.auth, "Bearer re_test");
    assertEquals(seen!.body.to, ["awa@x.ci"]);
    assertEquals((await sendEmail(row({ email: null }), "https://s.ci")).status, "skipped");

    globalThis.fetch = (() => Promise.resolve(new Response("bad", { status: 422 }))) as typeof fetch;
    assertEquals((await sendEmail(row(), "https://s.ci")).status, "skipped");   // 4xx définitif
    globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 503 }))) as typeof fetch;
    assertEquals((await sendEmail(row(), "https://s.ci")).status, "failed");    // réessayable
    globalThis.fetch = (() => Promise.reject(new Error("réseau"))) as typeof fetch;
    assertEquals((await sendEmail(row(), "https://s.ci")).status, "failed");
  } finally { globalThis.fetch = orig; Deno.env.delete("RESEND_API_KEY"); }
});

Deno.test("sendExpoPush : jetons valides, nettoyage DeviceNotRegistered", async () => {
  const deleted: string[][] = [];
  const svc = {
    from: (t: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: t === "push_tokens" ? [{ token: "ExponentPushToken[a]" }, { token: "ExponentPushToken[b]" }, { token: "garbage" }] : [] }) }),
      delete: () => ({ in: (_c: string, v: string[]) => { deleted.push(v); return Promise.resolve({}); } }),
    }),
  };
  const orig = globalThis.fetch;
  let sentMessages: { to: string }[] = [];
  globalThis.fetch = ((_u: string, init: RequestInit) => {
    sentMessages = JSON.parse(init.body as string);
    return Promise.resolve(new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200 }));
  }) as typeof fetch;
  try {
    assertEquals((await sendExpoPush(svc, row({ channel: "push" }))).status, "sent");
    assertEquals(sentMessages.map((m) => m.to), ["ExponentPushToken[a]", "ExponentPushToken[b]"]);
    assertEquals(deleted, [["ExponentPushToken[b]"]]);
  } finally { globalThis.fetch = orig; }
});

Deno.test("sms / whatsapp : skipped (fournisseur non configuré)", () => {
  assertEquals(sendUnconfigured(row({ channel: "whatsapp" })).status, "skipped");
});
