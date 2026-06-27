import type { Atlas, RenderGraph } from "./types.ts";

export function renderHtml(atlas: Atlas): string {
  const graph = JSON.stringify(toGraph(atlas));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cartograph - ${escapeHtml(atlas.repo.name)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #101214;
      --panel: #181c20;
      --text: #f3f5f7;
      --muted: #9aa4af;
      --line: #2b333b;
      --accent: #3dd6a3;
      --warn: #f0b35a;
      --blue: #76a9ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      min-height: 100vh;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding: 18px 22px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 20px; }
    .muted { color: var(--muted); }
    .canvas {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0;
    }
    svg {
      width: 100%;
      height: calc(100vh - 72px);
      display: block;
      background:
        linear-gradient(var(--line) 1px, transparent 1px),
        linear-gradient(90deg, var(--line) 1px, transparent 1px);
      background-size: 32px 32px;
    }
    aside {
      border-left: 1px solid var(--line);
      background: var(--panel);
      padding: 18px;
      overflow: auto;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #12161a;
    }
    .stat strong {
      display: block;
      font-size: 20px;
    }
    .list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    button {
      width: 100%;
      text-align: left;
      color: var(--text);
      background: #12161a;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); }
    .node { cursor: pointer; }
    .node circle { fill: #16251f; stroke: var(--accent); stroke-width: 2; }
    .node.hot circle { fill: #302417; stroke: var(--warn); }
    .node text { fill: var(--text); font-size: 12px; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
    .edge { stroke: #53606b; stroke-width: 1.4; opacity: .45; }
    .edge.external { stroke: var(--blue); stroke-dasharray: 4 4; }
    code { color: var(--accent); }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { border-left: 0; border-top: 1px solid var(--line); }
      svg { height: 62vh; }
    }
  </style>
</head>
<body>
  <main>
    <section class="canvas">
      <header>
        <h1>Cartograph: ${escapeHtml(atlas.repo.name)}</h1>
        <p class="muted">Codebase map generated ${escapeHtml(atlas.generatedAt)}</p>
      </header>
      <svg id="graph" role="img" aria-label="Codebase graph"></svg>
    </section>
    <aside>
      <h2>System Snapshot</h2>
      <div class="stats">
        <div class="stat"><strong>${atlas.summary.files}</strong><span class="muted">files</span></div>
        <div class="stat"><strong>${atlas.summary.modules}</strong><span class="muted">modules</span></div>
        <div class="stat"><strong>${atlas.summary.edges}</strong><span class="muted">edges</span></div>
        <div class="stat"><strong>${atlas.hotspots.length}</strong><span class="muted">hotspots</span></div>
      </div>
      <h3>Hotspots</h3>
      <div class="list" id="hotspots"></div>
      <h3 style="margin-top:18px">Selected</h3>
      <p id="selected" class="muted">Click a module to inspect it.</p>
    </aside>
  </main>
  <script>
    const graph = ${graph};
    const svg = document.getElementById("graph");
    const selected = document.getElementById("selected");
    const hotspots = document.getElementById("hotspots");
    const width = 1100;
    const height = 760;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.34;
    graph.nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / graph.nodes.length - Math.PI / 2;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
    });

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "edge");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      svg.appendChild(line);
    }

    for (const node of graph.nodes) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "node" + (node.hot ? " hot" : ""));
      group.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");
      group.addEventListener("click", () => showNode(node));

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", String(Math.max(34, Math.min(72, 24 + node.files * 3))));
      group.appendChild(circle);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.textContent = node.label.length > 18 ? node.label.slice(0, 16) + "..." : node.label;
      group.appendChild(label);
      svg.appendChild(group);
    }

    for (const item of graph.hotspots.slice(0, 12)) {
      const button = document.createElement("button");
      button.innerHTML = "<code>" + escapeHtml(item.path) + "</code><br><span class='muted'>score " + item.score + " · " + item.roles.join(", ") + "</span>";
      button.addEventListener("click", () => {
        selected.innerHTML = "<code>" + escapeHtml(item.path) + "</code><br>Incoming: " + item.incoming + "<br>Outgoing: " + item.outgoing + "<br>Roles: " + escapeHtml(item.roles.join(", "));
      });
      hotspots.appendChild(button);
    }

    function showNode(node) {
      selected.innerHTML = "<code>" + escapeHtml(node.id) + "</code><br>Files: " + node.files + "<br>Lines: " + node.lines + "<br>Incoming: " + node.incoming + "<br>Outgoing: " + node.outgoing + "<br>Roles: " + escapeHtml(node.roles.join(", "));
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }
  </script>
</body>
</html>`;
}

function toGraph(atlas: Atlas): RenderGraph {
  const nodes = atlas.modules.slice(0, 40).map((module) => ({
    id: module.name,
    label: module.name,
    files: module.files,
    lines: module.lines,
    incoming: module.incoming,
    outgoing: module.outgoing,
    roles: Object.keys(module.roles),
    hot: atlas.hotspots.some((hotspot) => hotspot.module === module.name)
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const fileToModule = new Map(atlas.files.map((file) => [file.path, file.module]));
  const seen = new Set<string>();
  const edges: RenderGraph["edges"] = [];

  for (const edge of atlas.edges) {
    if (edge.kind !== "internal-import") continue;
    const from = fileToModule.get(edge.from);
    const to = fileToModule.get(edge.to);
    if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to });
  }

  return {
    nodes,
    edges,
    hotspots: atlas.hotspots
  };
}

function escapeHtml(value: unknown): string {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(value).replace(/[&<>"']/g, (char) => ({
    ...entities
  }[char] ?? char));
}
