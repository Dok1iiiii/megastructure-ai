const providers = require("./providers.json");

function buildPrompt(up, style, scale, mood, colorPalette) {
  const sm = { cinematic: "cinematic, film still, ultra-detailed", concept_art: "concept art, matte painting", minimalist: "minimalist, clean lines", surreal: "surreal, dreamlike, impossible architecture", ethereal: "ethereal, glowing, luminous" };
  const scm = { colossal: "colossal, monumental, tiny figures for scale", massive: "massive structures, breathtaking scope", intimate: "intimate, architectural details, close perspective" };
  const mm = { mystical: "mystical, golden hour, mist, sacred geometry", solemn: "solemn, reverent, dramatic shadows", hopeful: "hopeful, sunrise, warm light", melancholic: "melancholic, twilight, deep blues", sublime: "sublime, awe-inspiring, epic" };
  const cm = { warm_gold: "warm gold, amber, rich ochres", cool_blue: "cool blue, teal, azure", monochrome: "monochrome, black and white", purple_dusk: "purple, violet dusk, deep indigo", vibrant: "vibrant neon, electric blues" };
  return "Megastructure aesthetic, sci-fi monumental architecture, " + (sm[style] || sm.cinematic) + ", " + (scm[scale] || scm.colossal) + ", " + (mm[mood] || mm.mystical) + ", " + (cm[colorPalette] || cm.warm_gold) + ". " + up + ". Brutalist concrete, steel, silicon civilization, massive geometric forms, cosmic scale, ultra-detailed, photorealistic, dramatic lighting, atmospheric perspective.";
}

function pickImage(data) {
  const item = (data.data && data.data[0]) || (data.images && data.images[0]) || null;
  if (!item) return null;
  return {
    url: item.url || item.image_url || item.uri,
    b64: item.b64_json || item.base64 || item.image_base64,
    mime: item.content_type || "image/png",
    revised: item.revised_prompt || "",
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const body = req.body || {};
    const apiKey = (body.apiKey || "").toString().trim();
    const provider = providers[body.provider] || providers.openai;
    const prompt = buildPrompt(body.prompt, body.style, body.scale, body.mood, body.colorPalette);
    const model = body.model || provider.def;
    const size = body.size || provider.defSize;

    if (!apiKey) {
      res.status(200).json({ error: "NO_KEY", message: "\u8bf7\u5148\u8bbe\u7f6e API Key" });
      return;
    }

    const baseUrl = (body.endpoint || provider.baseUrl || "").replace(/\/+$/, "");
    const fetchUrl = baseUrl + "/images/generations";
    const fetchBody = { model, prompt, size };
    if (body.provider === "openai") { fetchBody.n = 1; fetchBody.quality = "hd"; }
    if (body.provider === "volcengine") { fetchBody.watermark = false; }

    const resp = await fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify(fetchBody),
    });
    const txt = await resp.text();
    let data;
    try { data = JSON.parse(txt); } catch {
      res.status(502).json({ error: "\u751f\u6210\u670d\u52a1\u8fd4\u56de\u7684\u6570\u636e\u65e0\u6cd5\u89e3\u6790", detail: txt.slice(0, 200) });
      return;
    }

    if (!resp.ok || data.error) {
      res.status(200).json({ error: data.error ? (data.error.message || JSON.stringify(data.error)) : "HTTP " + resp.status });
      return;
    }

    const img = pickImage(data);
    if (!img || (!img.b64 && !img.url)) {
      res.status(200).json({ error: "No image in provider response" });
      return;
    }

    let mime = img.mime;
    let b64 = img.b64;
    if (!b64) {
      const imgResp = await fetch(img.url);
      if (!imgResp.ok) throw new Error("image download failed: HTTP " + imgResp.status);
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      mime = imgResp.headers.get("content-type") || "image/png";
      b64 = imgBuf.toString("base64");
    }

    res.status(200).json({
      imageData: "data:" + mime + ";base64," + b64,
      prompt,
      revisedPrompt: img.revised,
    });
  } catch (err) {
    var errMsg = (err && err.message) || String(err);
    res.status(200).json({ error: errMsg });
  }
};
