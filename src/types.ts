export type ImportKind = "internal-import" | "external-import";

export type RouteInfo = {
  method: string;
  path: string;
};

export type FileRecord = {
  path: string;
  module: string;
  extension: string;
  lines: number;
  imports: string[];
  exports: string[];
  routes: RouteInfo[];
  roles: string[];
};

export type EdgeRecord = {
  from: string;
  to: string;
  kind: ImportKind;
  specifier: string;
};

export type ModuleSummary = {
  name: string;
  files: number;
  lines: number;
  roles: Record<string, number>;
  incoming: number;
  outgoing: number;
};

export type Hotspot = {
  path: string;
  module: string;
  score: number;
  incoming: number;
  outgoing: number;
  roles: string[];
};

export type Atlas = {
  schemaVersion: 1;
  generatedAt: string;
  repo: {
    name: string;
    root: string;
  };
  summary: {
    files: number;
    edges: number;
    modules: number;
    externalImports: number;
  };
  modules: ModuleSummary[];
  files: FileRecord[];
  edges: EdgeRecord[];
  hotspots: Hotspot[];
  entrypoints: FileRecord[];
};

export type SourceFile = {
  absolutePath: string;
  relativePath: string;
};

export type PathAlias = {
  pattern: string;
  target: string;
};

export type GraphNode = {
  id: string;
  label: string;
  files: number;
  lines: number;
  incoming: number;
  outgoing: number;
  roles: string[];
  hot: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
};

export type RenderGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hotspots: Hotspot[];
};
