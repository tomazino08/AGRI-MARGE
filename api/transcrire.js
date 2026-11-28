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

// DEBUT-NOMBRES : lit les nombres écrits en lettres ou en chiffres, sans IA.
const UNITES = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
function nombresFr(texte) {
  const sortie = [];
  const t = String(texte).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const morceaux = t.match(/\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|\d+|[a-z]+/g) || [];
  let total = 0, courant = 0, actif = false, precedent = "", nbMots = 0, seulUn = false;
  const finir = () => {
    if (actif && !(nbMots === 1 && seulUn)) sortie.push(total + courant);
    total = 0; courant = 0; actif = false; precedent = ""; nbMots = 0; seulUn = false;
  };
  for (const m of morceaux) {
    if (/^\d/.test(m)) { finir(); sortie.push(parseInt(m.replace(/[ .\u00a0\u202f]/g, ""), 10)); continue; }
    if (m === "et" && actif) continue;
    if (m in UNITES) {
      if ((m === "vingt" || m === "vingts") && precedent === "quatre") courant = courant - 4 + 80;
      else courant += UNITES[m];
      if (!actif) seulUn = (m === "un" || m === "une");
      actif = true; nbMots++; precedent = m; continue;
    }
    if (m === "cent" || m === "cents") { courant = (courant === 0 ? 1 : courant) * 100; actif = true; nbMots++; seulUn = false; precedent = m; continue; }
    if (m === "mille") { total += (courant === 0 ? 1 : courant) * 1000; courant = 0; actif = true; nbMots++; seulUn = false; precedent = m; continue; }
    if (m === "million" || m === "millions") { total += (courant === 0 ? 1 : courant) * 1000000; courant = 0; actif = true; nbMots++; seulUn = false; precedent = m; continue; }
    finir();
  }
  finir();
  return sortie;
}
// FIN-NOMBRES

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

    // 6. Contrôle des nombres : une seule dépense et un seul nombre dit, le nombre dit fait foi.
    const dits = nombresFr(texte);
    if (mouvements.length === 1 && mouvements[0].type === "depense" && dits.length === 1) {
      const n = argent(dits[0]);
      if (n) mouvements[0].montant_fcfa = n;
    }

    return res.status(200).json({ texte, mouvements, mouvement: mouvements[0] || null });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
};
