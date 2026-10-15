import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";

type NodeTargetCache = WeakMap<
  Node,
  Map<SourceFile | undefined, TargetTypeRef | null>
>;

export interface CsharpTypeResolutionQueryCache {
  resolveNode(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
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
    type: Type | undefined,
    sourceFile: SourceFile,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
}

export function createCsharpTypeResolutionQueryCache():
  CsharpTypeResolutionQueryCache {
  let activeQueryDepth = 0;
  const nodeTypes: NodeTargetCache = new WeakMap();
  const storageTypes: NodeTargetCache = new WeakMap();
  const readStorageTypes: NodeTargetCache = new WeakMap();
  const semanticTypes = new WeakMap<
    Type,
    WeakMap<SourceFile, TargetTypeRef | null>
  >();

  const resolveNodeQuery = (
    cache: NodeTargetCache,
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined => {
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

  const resolveTypeQuery = (
    type: Type | undefined,
    sourceFile: SourceFile,
    compute: () => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined => {
    if (type === undefined) {
      return compute();
    }
    const cached = semanticTypes.get(type)?.get(sourceFile);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    const cacheResult = activeQueryDepth === 0;
    activeQueryDepth += 1;
    try {
      const result = compute();
      if (cacheResult) {
        let bySourceFile = semanticTypes.get(type);
        if (bySourceFile === undefined) {
          bySourceFile = new WeakMap();
          semanticTypes.set(type, bySourceFile);
        }
        bySourceFile.set(sourceFile, result ?? null);
      }
      return result;
    } finally {
      activeQueryDepth -= 1;
    }
  };

  return Object.freeze({
    resolveNode(
      node: Node | undefined,
      sourceFile: SourceFile | undefined,
      compute: () => TargetTypeRef | undefined,
    ) {
      return resolveNodeQuery(nodeTypes, node, sourceFile, compute);
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
    resolveType: resolveTypeQuery,
  });
}
