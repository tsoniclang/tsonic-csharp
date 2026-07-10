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
  if (activeKey !== undefined && state.activeSubjects.has(activeKey)) {
    return undefined;
  }
  if (activeKey !== undefined) {
    state.activeSubjects.add(activeKey);
  }
  const resolver = createRecursiveTargetTypeResolver(state);
  try {
    return resolveTargetTypeRefForSubjectCore(
      subject,
      context,
      options,
      host,
      resolver,
      resolver.resolveType,
    );
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
  if (activeKey !== undefined && state.activeTypes.has(activeKey)) {
    return undefined;
  }
  if (activeKey !== undefined) {
    state.activeTypes.add(activeKey);
  }
  const resolver = createRecursiveTargetTypeResolver(state);
  try {
    return resolveTargetTypeRefForTypeCore(
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
