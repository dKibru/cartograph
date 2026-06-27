# Cartograph

Codebase sensemaking for AI-native developers.

Cartograph scans a repository and builds a compact mental model of the codebase: modules, import relationships, entrypoints, hotspots, external dependencies, and a local visual map.

The goal is not to draw every file. Giant graphs become useless quickly. Cartograph is designed to answer the questions you ask when AI has moved faster than your own understanding:

- Where do I start reading?
- What are the main pieces?
- What talks to what?
- Which files are risky to change?
- Which entrypoints map to real product workflows?
- Where are the AI or AWS touchpoints?

## Status

Early MVP. The first scanner supports JavaScript and TypeScript repositories.

## Usage

```sh
bunx cartograph scan .
```

Or from a local checkout:

```sh
bun ./bin/cartograph.ts scan /path/to/repo
bun ./bin/cartograph.ts serve /path/to/repo
```

`scan` writes:

- `.cartograph/cartograph.json`
- `.cartograph/CODEBASE_MAP.md`

`serve` writes the same files and starts a local visualization at:

```text
http://127.0.0.1:3717
```

## What It Detects

- JavaScript and TypeScript source files.
- Internal and external imports.
- Modules from common repo layouts like `apps/*`, `packages/*`, and `src/*`.
- Entrypoints such as route files, pages, API handlers, and backend controllers.
- Hotspots based on incoming imports, outgoing imports, and inferred roles.
- AI touchpoints such as OpenAI, Anthropic, Bedrock, LangChain, and related SDK references.
- AWS touchpoints such as S3, Lambda, DynamoDB, CloudWatch, Bedrock, and AWS SDK references.

## Why

Before AI-heavy development, it was easier to carry a clean mental model of a codebase. AI agents can now make changes faster than your intuition updates. Cartograph helps rebuild codebase affinity by turning a repo into a readable map.

## Roadmap

- Better AST parsing through Tree-sitter.
- Route and workflow tracing for Next.js, Express, Hono, Laravel, and SST.
- Git history overlays for change hotspots.
- LLM-generated summaries for modules and workflows.
- Interactive flow mode: click a route and see the files it crosses.
- Agent mode: generate `CODEBASE_MAP.md`, `AGENTS.md`, and onboarding runbooks.
- AWS mode: connect repository structure to deployed cloud resources.

## License

MIT
