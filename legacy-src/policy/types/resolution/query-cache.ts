import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type { CsharpArrayLiteralSelection } from "./array-literals.js";

type NodeTargetCache = WeakMap<
  Node,
  Map<SourceFile | undefined, TargetTypeRef | null>
>;

export interface CsharpTypeResolutionQueryCache {
  resolveArrayLiteral(node: Node, sourceFile: SourceFile, root: boolean,
    compute: () => CsharpArrayLiteralSelection): CsharpArrayLiteralSelection;
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
  const arrays = new WeakMap<Node, WeakMap<SourceFile, CsharpArrayLiteralSelection>>();

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
