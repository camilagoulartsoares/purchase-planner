module.exports = async function handler(req, res) {
  const rawUrl = String(req.query?.url || "");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return res.status(400).json({ message: "URL inválida" });
  }

  if (!/(^|\.)useelizah\.com\.br$/i.test(url.hostname)) {
    return res.status(400).json({ message: "Loja não permitida" });
  }

  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    const html = await response.text();
    const absolute = (value) => {
      try { return new URL(value, url).toString(); } catch { return null; }
    };
    const unique = (values) => [...new Set(values.filter(Boolean))];
    const ogImage = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const assetImages = [...html.matchAll(/https?:[^"'\s]+\/produtos\/[^"'\s]+?\.(?:jpe?g|png|webp)/gi)].map((match) => match[0]);
    const images = unique([
      ...(ogImage ? [absolute(ogImage)] : []),
      ...assetImages,
      ...[...html.matchAll(/<img[^>]+(?:src|data-src|data-original|data-zoom-image)=["']([^"']+)["']/gi)]
        .map((match) => absolute(match[1]))
        .filter((item) => item?.includes("/produtos/")),
    ]).slice(0, 12);
    const videos = unique([...html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => absolute(match[1]))).slice(0, 4);
    return res.status(200).json({ data: [...images.map((url) => ({ type: "image", url })), ...videos.map((url) => ({ type: "video", url }))] });
  } catch {
    return res.status(502).json({ message: "Não foi possível carregar a galeria" });
  }
}
