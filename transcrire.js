// Reçoit un audio, le transcrit (Whisper via Groq), puis en tire UN mouvement.
// La clé GROQ_API_KEY vit dans les variables d'environnement Vercel, jamais dans le code.
const SB_URL = "https://cpfwlkawfibxbscbrckm.supabase.co";
const SB_KEY = "sb_publishable_KJBo_HeYBlDpR6QKC1pnyQ_taqrJm3q"; // clé publique, faite pour être visible

const CAT = {
  depense: ["labour", "semis", "herbicide", "autre"],
  perte: ["inondation", "vol", "pourriture", "autre"],
  recolte: ["recolte"],
};
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1e9 ? n : null; };

function propre(o) {
  if (!o || !CAT[o.type]) return null;
  const dep = o.type === "depense";
  return {
    type: o.type,
    categorie: CAT[o.type].includes(o.categorie) ? o.categorie : (o.type === "recolte" ? "recolte" : "autre"),
    montant_fcfa: dep ? num(o.montant_fcfa) : null,
    quantite_kg: dep ? null : num(o.quantite_kg),
    prix_kg_fcfa: dep ? null : num(o.prix_kg_fcfa),
  };
}

const CONSIGNE =
  "Tu lis une phrase d'un agriculteur béninois, en français. Extrais UN seul mouvement. " +
  "Réponds uniquement par un objet JSON : " +
  '{"type":"depense|recolte|perte","categorie":"...","montant_fcfa":nombre ou null,"quantite_kg":nombre ou null,"prix_kg_fcfa":nombre ou null}. ' +
  "Catégories : depense = labour, semis, herbicide, autre ; perte = inondation, vol, pourriture, autre ; recolte = recolte. " +
  "depense utilise montant_fcfa ; recolte et perte utilisent quantite_kg et prix_kg_fcfa. " +
  "N'invente JAMAIS un chiffre : si un chiffre n'est pas dit, mets null. Convertis les nombres dits en lettres en chiffres.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode refusée" });
  try {
    // 1. Seul un utilisateur connecté (même anonyme) peut utiliser la fonction.
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Non autorisé" });
    const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + token } });
    if (!u.ok) return res.status(401).json({ error: "Non autorisé" });

    // 2. L'audio doit rester petit.
    const { audio, mime } = req.body || {};
    if (typeof audio !== "string" || audio.length < 100 || audio.length > 1500000) {
      return res.status(400).json({ error: "Audio invalide" });
    }
    const type = typeof mime === "string" && /^audio\//.test(mime) ? mime : "audio/webm";
    const ext = /mp4/.test(type) ? "mp4" : /ogg/.test(type) ? "ogg" : "webm";

    // 3. Transcription.
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from(audio, "base64")], { type }), "voix." + ext);
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("language", "fr");
    fd.append("response_format", "json");
    const w = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: fd,
    });
    if (!w.ok) return res.status(502).json({ error: "Transcription indisponible" });
    const texte = String((await w.json()).text || "").trim().slice(0, 300);
    if (!texte) return res.status(200).json({ texte: "", mouvement: null });

    // 4. Extraction. Si elle échoue, l'utilisateur tape à la main.
    let mouvement = null;
    try {
      const c = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0,
          messages: [{ role: "system", content: CONSIGNE }, { role: "user", content: texte }],
        }),
      });
      const raw = (await c.json()).choices?.[0]?.message?.content || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) mouvement = propre(JSON.parse(m[0]));
    } catch (e) { mouvement = null; }

    return res.status(200).json({ texte, mouvement });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
};
