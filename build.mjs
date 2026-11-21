import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const files = [
  "index.html",
  "wall.html",
  "post.html",
  "submit.html",
  "me.html",
  "admin.html",
  "rules.html",
  "leaderboard.html",
  "styles.css",
  "config.js",
  "sitemap.xml"
];

for (const file of files) {
  await cp(join(root, file), join(dist, file));
}

for (const directory of ["js", "assets"]) {
  await cp(join(root, directory), join(dist, directory), { recursive: true });
}

await writeFile(
  join(dist, "robots.txt"),
  "User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /me.html\nSitemap: https://cozy-dodol-24777a.netlify.app/sitemap.xml\n",
  "utf8"
);

await writeFile(
  join(dist, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: geolocation=(), microphone=(), camera=()",
    "  X-Frame-Options: DENY",
    "",
    "/admin.html",
    "  X-Robots-Tag: noindex, nofollow",
    ""
  ].join("\n"),
  "utf8"
);

console.log("Built dist/");
