export function escapeMailHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function mailKnap(link: string, label: string) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="#1a1a1a" style="padding:12px 24px;border-radius:6px"><a href="${escapeMailHtml(link)}" style="color:#ffffff;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;display:inline-block">${escapeMailHtml(label)}</a></td></tr></table>`;
}

export function mailSignatur(sellerName: string) {
  return `<p style="color:#666;font-size:13px">Venlig hilsen<br>${escapeMailHtml(sellerName)} · Frellsen Kaffe</p>`;
}

export function katalogMailHtml(input: { navn: string; link: string; billede: string | null; sellerName: string }) {
  const image = input.billede && /^https?:\/\//.test(input.billede)
    ? `<p><a href="${escapeMailHtml(input.link)}"><img src="${escapeMailHtml(input.billede)}" alt="Frellsen Kaffes katalog" width="360" style="max-width:100%;height:auto;border:0"></a></p>` : "";
  return `<p>Hej${input.navn ? ` ${escapeMailHtml(input.navn)}` : ""}, her er vores katalog, som aftalt.</p>${image}${mailKnap(input.link, "Se kataloget")}${mailSignatur(input.sellerName)}`;
}