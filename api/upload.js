import { Buffer } from "buffer";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://jonsigur.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    const TOKEN = process.env.GITHUB_TOKEN;
    if (!TOKEN) {
      return res.status(500).json({
        error: "Missing server-side GitHub token (GITHUB_TOKEN)",
      });
    }

    const OWNER = "AdvaniaPayment";
    const REPO = "leringshub";
    const BRANCH = "main";

    // Frontend sender nå JSON
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { title, type = "", desc = "", files = [] } = body;

    if (!title) {
      return res.status(400).json({ error: "Missing title" });
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const slug =
      title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") +
      "-" +
      now.getTime();

    const folder = `uploads/${yyyy}-${mm}-${dd}/${slug}`;

    async function uploadFile(path, content, message) {
      const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;

      const r = await fetch(api, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content,
          branch: BRANCH,
        }),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub error: ${r.status} ${t}`);
      }
      return r.json();
    }

    const metaFiles = [];
    for (const f of files) {
      if (!f?.name || !f?.base64) continue;
      const safeName = String(f.name).replace(/[\\/]/g, "_");
      const filePath = `${folder}/${safeName}`;
      await uploadFile(filePath, f.base64, `Upload image ${safeName} for ${title}`);
      metaFiles.push({ name: safeName, path: filePath });
    }

    const metaJSON = {
      title,
      type,
      desc,
      created: now.toISOString(),
      files: metaFiles,
    };

    const metaContent = Buffer.from(JSON.stringify(metaJSON, null, 2), "utf8").toString("base64");
    await uploadFile(`${folder}/meta.json`, metaContent, `Create meta.json for ${title}`);

    const md = `# ${title}\n\n**Type:** ${type}\n\n${desc}\n`;
    const md64 = Buffer.from(md, "utf8").toString("base64");
    await uploadFile(`${folder}/README.md`, md64, `Create README for ${title}`);

    return res.status(200).json({ ok: true, folder, meta: metaJSON });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
