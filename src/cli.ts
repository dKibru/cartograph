import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "node:http";
import { scanRepo } from "./scanner.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderHtml } from "./web.ts";
import type { Atlas } from "./types.ts";

const help = `cartograph

Codebase sensemaking for AI-native developers.

Usage:
  cartograph scan [repo] [--out .cartograph] [--quiet]
  cartograph serve [repo] [--out .cartograph] [--port 3717]

Examples:
  cartograph scan .
  cartograph serve ~/Developer/my-app
`;

type CliOptions = {
  positionals: string[];
  out?: string;
  port?: string;
  quiet?: boolean;
  [key: string]: string | boolean | string[] | undefined;
};

export async function main(args: string[]): Promise<void> {
  const command = args[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(help);
    return;
  }

  if (command !== "scan" && command !== "serve") {
    throw new Error(`Unknown command: ${command}\n\n${help}`);
  }

  const options = parseOptions(args.slice(1));
  const repoRoot = path.resolve(options.positionals[0] ?? ".");
  const outDir = path.resolve(repoRoot, options.out ?? ".cartograph");

  await fs.mkdir(outDir, { recursive: true });

  const atlas = await scanRepo(repoRoot);
  const markdown = renderMarkdown(atlas);

  await fs.writeFile(path.join(outDir, "cartograph.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "CODEBASE_MAP.md"), markdown);

  if (!options.quiet) {
    console.log(`Scanned ${atlas.repo.name}`);
    console.log(`Files: ${atlas.summary.files}`);
    console.log(`Edges: ${atlas.summary.edges}`);
    console.log(`Wrote ${path.relative(process.cwd(), path.join(outDir, "cartograph.json"))}`);
    console.log(`Wrote ${path.relative(process.cwd(), path.join(outDir, "CODEBASE_MAP.md"))}`);
  }

  if (command === "serve") {
    const port = Number(options.port ?? 3717);
    await serve(atlas, port);
  }
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = { positionals: [] };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (!arg.startsWith("--")) {
      options.positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "quiet") {
      options.quiet = true;
      continue;
    }

    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return options;
}

async function serve(atlas: Atlas, port: number): Promise<void> {
  const html = renderHtml(atlas);
  const server = createServer((request, response) => {
    if (request.url === "/cartograph.json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(atlas, null, 2));
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(undefined));
  });

  console.log(`Cartograph is running at http://127.0.0.1:${port}`);
}
