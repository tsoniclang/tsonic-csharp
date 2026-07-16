import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  resolveFunctionTargetTypeRefFromSignatureLikeSubject as resolveFunctionTargetTypeRefFromSignatureLikeSubjectWithResolver,
} from "./target-type-syntax-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-resolution.js";
import {
  resolveTargetTypeArgumentsForTypeWithResolver,
} from "./target-type-semantic-resolution.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";
import {
  resolveTargetTypeRefForSubjectCore,
} from "./target-type-subject-resolution.js";
import {
  resolveTargetTypeRefForTypeCore,
} from "./target-type-type-resolution.js";

export type {
  CsharpSemanticTypeDeclarationShape,
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";

interface TargetTypeResolutionState {
  readonly activeSubjects: WeakSet<object>;
  readonly activeTypes: WeakSet<object>;
  readonly resolvedSubjects: WeakMap<object, TargetTypeResolutionCacheEntry[]>;
  readonly resolvedTypes: WeakMap<object, TargetTypeResolutionCacheEntry[]>;
}

interface TargetTypeResolutionCacheEntry {
  readonly context: ExtensionObservationContext;
  readonly host: CsharpTargetTypeResolutionHost;
  readonly allowRuntimeCarrier: boolean;
  readonly allowSemanticTypeQuery: boolean;
  readonly sourceFile: TargetTypeRefResolutionOptions["sourceFile"];
  readonly resolvedType: TargetTypeRef;
}

export function resolveTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForSubjectWithState(
    subject,
    context,
    options,
    host,
    createTargetTypeResolutionState(),
  );
}

function resolveTargetTypeRefForSubjectWithState(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  state: TargetTypeResolutionState,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const activeKey = objectKey(subject);
  const cached = activeKey === undefined
    ? undefined
    : getCachedTargetTypeRef(state.resolvedSubjects, activeKey, context, options, host);
  if (cached !== undefined) {
    return cached;
  }
  if (activeKey !== undefined && state.activeSubjects.has(activeKey)) {
    return undefined;
  }
  if (activeKey !== undefined) {
    state.activeSubjects.add(activeKey);
  }
  const resolver = createRecursiveTargetTypeResolver(state);
  try {
    const result = resolveTargetTypeRefForSubjectCore(
      subject,
      context,
      options,
      host,
      resolver,
      resolver.resolveType,
    );
    if (activeKey !== undefined && result !== undefined) {
      cacheTargetTypeRef(state.resolvedSubjects, activeKey, context, options, host, result);
    }
    return result;
  } finally {
    if (activeKey !== undefined) {
      state.activeSubjects.delete(activeKey);
    }
  }
}

export function resolveTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForTypeWithState(
    type,
    context,
    options,
    host,
    createTargetTypeResolutionState(),
  );
}

function resolveTargetTypeRefForTypeWithState(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  state: TargetTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  const activeKey = objectKey(type);
  const cached = activeKey === undefined
    ? undefined
    : getCachedTargetTypeRef(state.resolvedTypes, activeKey, context, options, host);
  if (cached !== undefined) {
    return cached;
  }
  if (activeKey !== undefined && state.activeTypes.has(activeKey)) {
    return undefined;
  }
  if (activeKey !== undefined) {
    state.activeTypes.add(activeKey);
  }
  const resolver = createRecursiveTargetTypeResolver(state);
  try {
    const result = resolveTargetTypeRefForTypeCore(
      type,
      context,
      options,
      host,
      resolver,
      (targetType, targetContext, targetOptions, targetHost) =>
        resolveTargetTypeArgumentsForTypeWithState(
          targetType,
          targetContext,
          targetOptions,
          targetHost,
          state,
        ),
    );
    if (activeKey !== undefined && result !== undefined) {
      cacheTargetTypeRef(state.resolvedTypes, activeKey, context, options, host, result);
    }
    return result;
  } finally {
    if (activeKey !== undefined) {
      state.activeTypes.delete(activeKey);
    }
  }
}

export function resolveFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  const resolver = createRecursiveTargetTypeResolver(createTargetTypeResolutionState());
  return resolveFunctionTargetTypeRefFromSignatureLikeSubjectWithResolver(
    node,
    context,
    options,
    host,
    resolver,
  );
}

export function resolveTargetTypeArgumentsForType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): readonly TargetTypeRef[] | undefined {
  return resolveTargetTypeArgumentsForTypeWithState(
    type,
    context,
    options,
    host,
    createTargetTypeResolutionState(),
  );
}

function resolveTargetTypeArgumentsForTypeWithState(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  state: TargetTypeResolutionState,
): readonly TargetTypeRef[] | undefined {
  const resolver = createRecursiveTargetTypeResolver(state);
  return resolveTargetTypeArgumentsForTypeWithResolver(
    type,
    context,
    options,
    host,
    resolver,
  );
}

function createTargetTypeResolutionState(): TargetTypeResolutionState {
  return {
    activeSubjects: new WeakSet<object>(),
    activeTypes: new WeakSet<object>(),
    resolvedSubjects: new WeakMap<object, TargetTypeResolutionCacheEntry[]>(),
    resolvedTypes: new WeakMap<object, TargetTypeResolutionCacheEntry[]>(),
  };
}

function createRecursiveTargetTypeResolver(
  state: TargetTypeResolutionState,
): CsharpRecursiveTargetTypeResolver {
  return {
    resolveSubject: (subject, context, options, host) =>
      resolveTargetTypeRefForSubjectWithState(subject, context, options, host, state),
    resolveType: (type, context, options, host) =>
      resolveTargetTypeRefForTypeWithState(type, context, options, host, state),
  };
}

function objectKey(value: unknown): object | undefined {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? value
    : undefined;
}

function getCachedTargetTypeRef(
  cache: WeakMap<object, TargetTypeResolutionCacheEntry[]>,
  key: object,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  return cache.get(key)?.find((entry) =>
    entry.context === context &&
    entry.host === host &&
    entry.allowRuntimeCarrier === (options.allowRuntimeCarrier !== false) &&
    entry.allowSemanticTypeQuery === (options.allowSemanticTypeQuery !== false) &&
    entry.sourceFile === options.sourceFile)?.resolvedType;
}

function cacheTargetTypeRef(
  cache: WeakMap<object, TargetTypeResolutionCacheEntry[]>,
  key: object,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolvedType: TargetTypeRef,
): void {
  const entries = cache.get(key) ?? [];
  entries.push({
    context,
    host,
    allowRuntimeCarrier: options.allowRuntimeCarrier !== false,
    allowSemanticTypeQuery: options.allowSemanticTypeQuery !== false,
    sourceFile: options.sourceFile,
    resolvedType,
  });
  if (!cache.has(key)) {
    cache.set(key, entries);
  }
}
