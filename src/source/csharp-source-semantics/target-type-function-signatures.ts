import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function resolveFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const childOptions = {
    ...options,
    allowRuntimeCarrier: true,
  };
  const parameters = getNodeList(getNodeField(node, "Parameters"))
    .map((parameter) => resolver.resolveSubject(asNodeSubject(getNodeField(parameter, "Type")), context, childOptions, host));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Type")), context, childOptions, host);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameters.length}`, parameters as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameters.length + 1}`, [...(parameters as readonly TargetTypeRef[]), returnType]);
}
