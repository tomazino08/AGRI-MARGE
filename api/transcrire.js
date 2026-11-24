// Reçoit un audio, le transcrit (Whisper via Groq), puis en tire UN OU PLUSIEURS mouvements.
// La clé GROQ_API_KEY vit dans les variables d'environnement Vercel, jamais dans le code.
const SB_URL = "https://cpfwlkawfibxbscbrckm.supabase.co";
const SB_KEY = "sb_publishable_KJBo_HeYBlDpR6QKC1pnyQ_taqrJm3q"; // clé publique, faite pour être visible
const LIMITE_JOUR = 20;
const MAX_LIGNES = 5;

const CAT = {
  depense: ["labour", "semis", "herbicide", "engrais", "main_oeuvre", "transport", "autre"],
  perte: ["inondation", "vol", "pourriture", "autre"],
  recolte: ["recolte"],
};
const CULTURES = ["mais", "manioc", "igname", "haricot", "arachide", "soja", "riz", "autre"];
const argent = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= 1e9 ? n : null; };
const kilos = v => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n > 0 && n <= 1e6 ? n : null; };

function propre(o) {
  if (!o || !CAT[o.type]) return null;
  const dep = o.type === "depense";
  return {
    type: o.type,
    categorie: CAT[o.type].includes(o.categorie) ? o.categorie : (o.type === "recolte" ? "recolte" : "autre"),
    culture: CULTURES.includes(o.culture) ? o.culture : null,
    montant_fcfa: dep ? argent(o.montant_fcfa) : null,
    quantite_kg: dep ? null : kilos(o.quantite_kg),
    prix_kg_fcfa: dep ? null : argent(o.prix_kg_fcfa),
  };
}

const CONSIGNE =
  "Tu lis une phrase d'un agriculteur béninois, en français. Extrais TOUS les mouvements mentionnés (un ou plusieurs). " +
  'Réponds uniquement par un objet JSON : {"mouvements":[{"type":"depense|recolte|perte","categorie":"...","culture":"... ou null","montant_fcfa":nombre ou null,"quantite_kg":nombre ou null,"prix_kg_fcfa":nombre ou null}]}. ' +
  "Catégories : depense = labour, semis, herbicide, engrais, main_oeuvre, transport, autre ; perte = inondation, vol, pourriture, autre ; recolte = recolte. " +
  "depense utilise montant_fcfa (si une quantité et un prix unitaire sont dits, multiplie-les). recolte et perte utilisent quantite_kg et prix_kg_fcfa (convertis les tonnes en kg). " +
  "culture = mais, manioc, igname, haricot, arachide, soja, riz ou autre ; mets null si elle n'est pas dite, ne devine pas. " +
  "N'invente JAMAIS un chiffre : si un chiffre n'est pas dit, mets null. Convertis les nombres dits en lettres en chiffres. Règles : soixante-dix = 70, soixante-douze = 72, soixante-seize = 76, quatre-vingts = 80, quatre-vingt-dix = 90 ; « mille » multiplie par 1000 ; « cents » multiplie par 100.";

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

    // 3. Plafond par utilisateur et par jour (compté dans Supabase).
    const p = await fetch(SB_URL + "/rest/v1/rpc/prendre_appel", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ limite: LIMITE_JOUR }),
    });
    if (!p.ok) return res.status(502).json({ error: "Service indisponible" });
    if ((await p.json()) !== true) return res.status(429).json({ error: "Limite du jour atteinte" });

    // 4. Transcription.
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from(audio, "base64")], { type }), "voix." + ext);
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("language", "fr");
    fd.append("prompt", "Agriculture au Bénin, francs CFA, maïs, soja, manioc, igname, labour, semis, engrais, sacs, kilos.");
    fd.append("response_format", "json");
    const w = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: fd,
    });
    if (!w.ok) return res.status(502).json({ error: "Transcription indisponible" });
    const texte = String((await w.json()).text || "").trim().slice(0, 400);
    if (!texte) return res.status(200).json({ texte: "", mouvements: [], mouvement: null });

    // 5. Extraction. Si elle échoue, l'utilisateur tape à la main.
    let mouvements = [];
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
            if (!c.ok) throw new Error("extraction");
      const raw = (await c.json()).choices?.[0]?.message?.content || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        const liste = Array.isArray(parsed.mouvements) ? parsed.mouvements : [parsed];
        mouvements = liste.slice(0, MAX_LIGNES).map(propre).filter(Boolean);
      }
    } catch (e) { mouvements = []; }

    return res.status(200).json({ texte, mouvements, mouvement: mouvements[0] || null });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
};
