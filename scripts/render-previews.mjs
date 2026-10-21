/**
 * Draws every template's preview, `templates/<id>/preview.svg`, from its `workflow.yaml`:
 * each state a tile in its appearance colour holding its icon, placed where the canvas places
 * it, its title under it, the transitions as arrows between them, and a start state's trigger
 * as a badge on its tile, all on the archmax gradient. Run it after changing a template:
 *
 *   npm install && npm run previews
 *
 * A preview is drawn, never edited by hand, so every template's looks the same.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");
const ICONS = join(dirname(createRequire(import.meta.url).resolve("lucide-static/package.json")), "icons");

/** archmax's appearance palette, as `metadata.color` names it. */
const PALETTE = {
  sage: "#8c987f",
  rose: "#bca195",
  blue: "#c2d0e4",
  purple: "#8878a8",
  rust: "#bc8081",
  amber: "#bdac8a",
  teal: "#85aeab",
};
const BRAND = "#8878a8";
const INK = "#24212c";

const WIDTH = 400;
const HEIGHT = 225;
const TILE = 52;
/** The canvas area the tiles' centres spread over: room for a label under the lowest. */
const AREA = { left: 64, right: WIDTH - 64, top: 46, bottom: HEIGHT - 66 };

/** `MessageCircle` → `message-circle`, lucide-static's file name. */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();

/** The inner elements of a lucide icon, to place in a group of its own. */
function iconBody(name) {
  const svg = readFileSync(join(ICONS, `${kebab(name)}.svg`), "utf8");
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
}

/** The icon a trigger badge carries. */
function triggerIcon(id, declaration) {
  const type = declaration && typeof declaration === "object" ? declaration.type : undefined;
  if (id === "chat") return "MessageCircle";
  if (type === "schedule") return "Clock";
  if (type === "ap") return "Zap";
  if (type === "webhook") return "Webhook";
  return "Play";
}

/** A title broken into at most two lines of about `width` characters. */
function lines(text, width = 16) {
  const words = text.split(/\s+/);
  const out = [""];
  for (const word of words) {
    const current = out[out.length - 1];
    if (current && `${current} ${word}`.length > width) {
      if (out.length === 2) {
        out[1] = `${out[1]}…`;
        break;
      }
      out.push(word);
    } else out[out.length - 1] = current ? `${current} ${word}` : word;
  }
  return out;
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The widest gap between two columns of tiles, and between two tiles one above the other. */
const MAX_COLUMN_GAP = 150;
const MIN_ROW_GAP = 84;
/** Pixels per canvas unit vertically, at most: a row of the canvas (200) is 90 px here. */
const MAX_Y_SCALE = 0.45;

/**
 * Where each state's tile goes. Columns are the distinct canvas `x` values, spread evenly and
 * centred, never further apart than {@link MAX_COLUMN_GAP}; rows follow the canvas `y`, scaled
 * to fit, and tiles sharing a column are pushed apart until none overlaps another's label.
 */
function layout(states) {
  const columns = [...new Set(states.map(([, state]) => state.metadata?.x ?? 0))].sort((a, b) => a - b);
  const width = AREA.right - AREA.left;
  const gap = columns.length > 1 ? Math.min(MAX_COLUMN_GAP, width / (columns.length - 1)) : 0;
  const midX = (AREA.left + AREA.right) / 2;
  const xOf = (x) => midX + (columns.indexOf(x) - (columns.length - 1) / 2) * gap;

  const ys = states.map(([, state]) => state.metadata?.y ?? 0);
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = maxY === minY ? 0 : Math.min(MAX_Y_SCALE, (AREA.bottom - AREA.top) / (maxY - minY));
  const midY = (AREA.top + AREA.bottom) / 2;
  const place = Object.fromEntries(
    states.map(([slug, state]) => [
      slug,
      { x: xOf(state.metadata?.x ?? 0), y: midY + ((state.metadata?.y ?? 0) - (minY + maxY) / 2) * scale },
    ]),
  );

  for (const column of columns) {
    const inColumn = states.filter(([, state]) => (state.metadata?.x ?? 0) === column).map(([slug]) => place[slug]);
    inColumn.sort((a, b) => a.y - b.y);
    const crowded = inColumn.some((tile, index) => index > 0 && tile.y - inColumn[index - 1].y < MIN_ROW_GAP);
    if (!crowded) continue;
    const mean = inColumn.reduce((sum, tile) => sum + tile.y, 0) / inColumn.length;
    inColumn.forEach((tile, index) => {
      tile.y = mean + (index - (inColumn.length - 1) / 2) * MIN_ROW_GAP;
    });
    const low = Math.min(...inColumn.map((tile) => tile.y));
    const high = Math.max(...inColumn.map((tile) => tile.y));
    const shift = low < AREA.top ? AREA.top - low : high > AREA.bottom ? AREA.bottom - high : 0;
    for (const tile of inColumn) tile.y += shift;
  }
  return place;
}

function render(spec) {
  const states = Object.entries(spec.states ?? {});
  const place = layout(states);

  const arrows = states.flatMap(([slug, state]) =>
    (state.transitions ?? [])
      .filter((transition) => place[transition.to])
      .map((transition) => {
        const from = place[slug];
        const to = place[transition.to];
        const half = TILE / 2 + 4;
        const dx = to.x - from.x;
        if (Math.abs(dx) < TILE) {
          // One above the other: straight down or up between the tiles' edges.
          const sign = Math.sign(to.y - from.y) || 1;
          return `<path d="M${from.x} ${from.y + sign * half} L${to.x} ${to.y - sign * (half + 4)}" />`;
        }
        const sign = Math.sign(dx);
        const start = { x: from.x + sign * half, y: from.y };
        const end = { x: to.x - sign * (half + 4), y: to.y };
        const bend = (end.x - start.x) / 2;
        return `<path d="M${start.x} ${start.y} C${start.x + bend} ${start.y} ${end.x - bend} ${end.y} ${end.x} ${end.y}" />`;
      }),
  );

  const tiles = states.map(([slug, state]) => {
    const { x, y } = place[slug];
    const fill = PALETTE[state.metadata?.color] ?? "#ffffff";
    const icon = state.metadata?.icon ?? (state.type === "human" ? "UserCheck" : "Sparkles");
    const triggers = Object.entries(state.triggers ?? {});
    const badge =
      triggers.length > 0
        ? `<g transform="translate(${x - TILE / 2 - 2} ${y - TILE / 2 - 2})">
      <circle r="11" fill="#ffffff" filter="url(#lift)" />
      <g transform="translate(-7 -7) scale(0.5833)" fill="none" stroke="${BRAND}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${iconBody(triggerIcon(...triggers[0]))}</g>
    </g>`
        : "";
    const label = lines(state.title ?? slug)
      .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : 12}">${escape(line)}</tspan>`)
      .join("");
    return `<g>
    <rect x="${x - TILE / 2}" y="${y - TILE / 2}" width="${TILE}" height="${TILE}" rx="16" fill="${fill}" filter="url(#lift)" />
    <g transform="translate(${x - 12} ${y - 12})" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconBody(icon)}</g>
    ${badge}
    <text x="${x}" y="${y + TILE / 2 + 15}" text-anchor="middle">${label}</text>
  </g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escape(spec.title ?? "Workflow")}">
  <defs>
    <linearGradient id="backdrop" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#c2d0e4" />
      <stop offset="0.45" stop-color="#c8c1d9" />
      <stop offset="0.78" stop-color="#ccb4c5" />
      <stop offset="1" stop-color="#c9a9ac" />
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.15" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <filter id="lift" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#2a2238" flood-opacity="0.16" />
    </filter>
    <marker id="head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M1 1 L9 5 L1 9 Z" fill="${BRAND}" />
    </marker>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="16" fill="url(#backdrop)" />
  <rect width="${WIDTH}" height="${HEIGHT}" rx="16" fill="url(#glow)" />
  <g fill="none" stroke="${BRAND}" stroke-opacity="0.7" stroke-width="1.8" stroke-linecap="round" marker-end="url(#head)">
    ${arrows.join("\n    ")}
  </g>
  <g font-family="'Geist Sans', 'Inter', ui-sans-serif, system-ui, sans-serif" font-size="10.5" font-weight="500" fill="${INK}">
  ${tiles.join("\n  ")}
  </g>
</svg>
`;
}

for (const id of readdirSync(TEMPLATES).sort()) {
  const spec = parse(readFileSync(join(TEMPLATES, id, "workflow.yaml"), "utf8"));
  writeFileSync(join(TEMPLATES, id, "preview.svg"), render(spec));
  console.log(`templates/${id}/preview.svg`);
}
