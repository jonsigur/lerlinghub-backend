// /api/upload.js
// Serverless backend for Advania Læringshub
// Lagrer innsendinger (tekst + bilder) i Github repository

import { Buffer } from "buffer";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    // Sjekk GitHub token (fra Vercel Environment Variable)
    const TOKEN = process.env.GITHUB_TOKEN;
    if (!TOKEN) {
      return res.status(500).json({
        error: "Missing server-side GitHub token (GITHUB_TOKEN)",
      });
    }

    const OWNER = "AdvaniaPayment";
    const REPO = "leringshub";
    const BRANCH = "main";

    // Payload mottatt fra frontend (form-data)
    const form = await req.body;

    // Hvis vi får JSON (React/Fetch), parse:
    let body;
    try {
      body = JSON.parse(form);
    } catch {
      body = form;
    }

    const { title, type, desc, files } = body;

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
      const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(
        path
      )}`;

      const r = await fetch(api, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
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
        throw new Error("GitHub error: " + r.status + " " + t);
      }
      return r.json();
    }

    // 1. Last opp bilder
    const metaFiles = [];
    if (files && Array.isArray(files)) {
      for (const f of files) {
        const filePath = `${folder}/${f.name}`;
        await uploadFile(
          filePath,
          f.base64,
          `Upload image ${f.name} for ${title}`
        );
        metaFiles.push({ name: f.name, path: filePath });
      }
    }

    // 2. meta.json
    const metaJSON = {
      title,
      type,
      desc,
      created: now.toISOString(),
      files: metaFiles,
    };

    const metaContent = Buffer.from(
      JSON.stringify(metaJSON, null, 2),
      "utf8"
    ).toString("base64");

    await uploadFile(
      `${folder}/meta.json`,
      metaContent,
      `Create meta.json for ${title}`
    );

    // 3. README.md (nice to have i repoet)
    const md = `# ${title}\n\n**Type:** ${type}\n\n${desc}\n`;
    const md64 = Buffer.from(md, "utf8").toString("base64");

    await uploadFile(
      `${folder}/README.md`,
      md64,
      `Create README for ${title}`
    );

    return res.status(200).json({ ok: true, folder, meta: metaJSON });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
