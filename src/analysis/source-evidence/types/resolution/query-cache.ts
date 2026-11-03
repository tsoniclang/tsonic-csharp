import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpArrayLiteralSelection } from "../../../../target-model/records/operations/array-literals.js";
import type { CsharpNodeTypeResolution } from "../../../../policy/model/type-resolution.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNodeQuerySource, CsharpTypeQuerySource } from "./root-sources.js";

type NodeTargetCache<Value> = WeakMap<
  Node,
  Map<SourceFile | undefined, Value | null>
>;

interface SourceQueryEntry<Source, Value> {
  readonly source: Source;
  result?: { readonly value: Value | undefined };
}

export interface CsharpTypeResolutionQueryCache {
  nodeQuerySource(node: Node | undefined, sourceFile: SourceFile | undefined,
    form: () => CsharpNodeQuerySource): CsharpNodeQuerySource;
  typeQuerySource(type: Type | undefined, sourceFile: SourceFile,
    form: () => CsharpTypeQuerySource): CsharpTypeQuerySource;
  resolveArrayLiteral(node: Node, sourceFile: SourceFile, root: boolean,
    compute: () => CsharpArrayLiteralSelection): CsharpArrayLiteralSelection;
  resolveNode(
    source: CsharpNodeQuerySource,
    compute: () => CsharpNodeTypeResolution | undefined,
  ): CsharpNodeTypeResolution | undefined;
  resolveStorage(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
  resolveReadStorage(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
  resolveType(
    source: CsharpTypeQuerySource,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
}

export function createCsharpTypeResolutionQueryCache():
  CsharpTypeResolutionQueryCache {
  let activeQueryDepth = 0;
  const nodeTypes = new WeakMap<Node, Map<SourceFile | undefined,
    SourceQueryEntry<CsharpNodeQuerySource, CsharpNodeTypeResolution>>>();
  const storageTypes: NodeTargetCache<TargetTypeRef> = new WeakMap();
  const readStorageTypes: NodeTargetCache<TargetTypeRef> = new WeakMap();
  const semanticTypes = new WeakMap<
    Type,
    WeakMap<SourceFile, SourceQueryEntry<CsharpTypeQuerySource, TargetTypeRef>>
  >();
  const arrays = new WeakMap<Node, WeakMap<SourceFile, CsharpArrayLiteralSelection>>();

  const resolveNodeQuery = <Value>(
    cache: NodeTargetCache<Value>,
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    compute: () => Value | undefined,
  ): Value | undefined => {
    if (node === undefined) {
      return compute();
    }
    const cached = cache.get(node)?.get(sourceFile);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    const cacheResult = activeQueryDepth === 0;
    activeQueryDepth += 1;
    try {
      const result = compute();
      if (cacheResult) {
        let bySourceFile = cache.get(node);
        if (bySourceFile === undefined) {
          bySourceFile = new Map();
          cache.set(node, bySourceFile);
        }
        bySourceFile.set(sourceFile, result ?? null);
      }
      return result;
    } finally {
      activeQueryDepth -= 1;
    }
  };

  return Object.freeze({
    nodeQuerySource(node: Node | undefined, sourceFile: SourceFile | undefined,
      form: () => CsharpNodeQuerySource): CsharpNodeQuerySource {
      if (node === undefined) return form();
      let files = nodeTypes.get(node);
      const previous = files?.get(sourceFile);
      if (previous !== undefined) return previous.source;
      const source = form();
      if (files === undefined) { files = new Map(); nodeTypes.set(node, files); }
      files.set(sourceFile, { source });
      return source;
    },
    typeQuerySource(type: Type | undefined, sourceFile: SourceFile,
      form: () => CsharpTypeQuerySource): CsharpTypeQuerySource {
      if (type === undefined) return form();
      let files = semanticTypes.get(type);
      const previous = files?.get(sourceFile);
      if (previous !== undefined) return previous.source;
      const source = form();
      if (files === undefined) { files = new WeakMap(); semanticTypes.set(type, files); }
      files.set(sourceFile, { source });
      return source;
    },
    resolveArrayLiteral(
      node: Node,
      sourceFile: SourceFile,
      root: boolean,
      compute: () => CsharpArrayLiteralSelection,
    ): CsharpArrayLiteralSelection {
      if (!root) return compute();
      const previous = arrays.get(node)?.get(sourceFile);
      if (previous !== undefined) return previous;
      const cacheResult = activeQueryDepth === 0;
      activeQueryDepth += 1;
      try {
        const result = compute();
        if (cacheResult) {
          let files = arrays.get(node);
          if (files === undefined) { files = new WeakMap(); arrays.set(node, files); }
          files.set(sourceFile, result);
        }
        return result;
      } finally { activeQueryDepth -= 1; }
    },
    resolveNode(
      source: CsharpNodeQuerySource,
      compute: () => CsharpNodeTypeResolution | undefined,
    ) {
      if (source.node === undefined) return compute();
      const entry = nodeTypes.get(source.node)?.get(source.sourceFile);
      if (entry?.source !== source) return failTargetAnalysisInvariant("tsonic-csharp",
        "A node query requires its canonical retained source request.", source.node);
      if (entry.result !== undefined) return entry.result.value;
      const cacheResult = activeQueryDepth === 0;
      activeQueryDepth += 1;
      try {
        const value = compute();
        if (cacheResult) entry.result = Object.freeze({ value });
        return value;
      } finally { activeQueryDepth -= 1; }
    },
    resolveStorage(
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      compute: () => TargetTypeRef | undefined,
    ) {
      return resolveNodeQuery(storageTypes, node, sourceFile, compute);
    },
    resolveReadStorage(
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      compute: () => TargetTypeRef | undefined,
    ) {
      return resolveNodeQuery(readStorageTypes, node, sourceFile, compute);
    },
    resolveType(source: CsharpTypeQuerySource, compute: () => TargetTypeRef | undefined) {
      if (source.type === undefined) return compute();
      const entry = semanticTypes.get(source.type)?.get(source.sourceFile);
      if (entry?.source !== source) return failTargetAnalysisInvariant("tsonic-csharp",
        "A type query requires its canonical retained source request.", source.sourceFile);
      if (entry.result !== undefined) return entry.result.value;
      const cacheResult = activeQueryDepth === 0;
      activeQueryDepth += 1;
      try {
        const value = compute();
        if (cacheResult) entry.result = Object.freeze({ value });
        return value;
      } finally { activeQueryDepth -= 1; }
    },
  });
}
