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

const recursiveTargetTypeResolver: CsharpRecursiveTargetTypeResolver = {
  resolveSubject: resolveTargetTypeRefForSubject,
  resolveType: resolveTargetTypeRefForType,
};

export function resolveTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  return resolveTargetTypeRefForSubjectCore(
    subject,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
    resolveTargetTypeRefForType,
  );
}

export function resolveTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  return resolveTargetTypeRefForTypeCore(
    type,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
    resolveTargetTypeArgumentsForType,
  );
}

export function resolveFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  return resolveFunctionTargetTypeRefFromSignatureLikeSubjectWithResolver(
    node,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
  );
}

export function resolveTargetTypeArgumentsForType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): readonly TargetTypeRef[] {
  return resolveTargetTypeArgumentsForTypeWithResolver(
    type,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
  );
}
