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
import {
  findTargetBinding,
} from "./provider-bindings.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function getTargetTypeRefFromConstructedExpressionSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined) {
    return undefined;
  }
  const binding = findTargetBinding(context, [expression]);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = getNodeList(getNodeField(node, "TypeArguments"))
    .map((argument) => resolver.resolveSubject(argument, context, options, host));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return getCsharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[], host);
}
