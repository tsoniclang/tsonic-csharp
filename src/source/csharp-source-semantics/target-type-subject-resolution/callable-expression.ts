import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  asType,
} from "../target-ref-utils.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "../target-type-resolution-host.js";
import type {
  CsharpTargetTypeResolver,
  CsharpTargetTypeSubjectResolver,
} from "./types.js";
import {
  getCallableExpressionTargetTypeRef,
  isCallableExpressionNode,
} from "../callable-target-types.js";

export function getCallableExpressionTargetTypeRefForSubject(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveTargetTypeRefForSubject: CsharpTargetTypeSubjectResolver,
  resolveTargetTypeRefForType: CsharpTargetTypeResolver,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined || !isCallableExpressionNode(ast, node)) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  if (sourceFile === undefined) {
    return undefined;
  }
  const type = asType(checker.getTypeAtLocation(node, { sourceFile }));
  return type === undefined
    ? undefined
    : getCallableExpressionTargetTypeRef(node, type, sourceFile, context, {
        getTargetTypeRefForSubject: (callableSubject, callableContext, callableOptions) =>
          resolveTargetTypeRefForSubject(
            callableSubject,
            callableContext,
            {
              ...options,
              ...callableOptions,
              sourceFile,
            },
            host,
          ),
        getTargetTypeRefForType: (callableType, callableContext, callableOptions) =>
          resolveTargetTypeRefForType(
            callableType,
            callableContext,
            {
              ...options,
              ...callableOptions,
              sourceFile,
            },
            host,
          ),
      });
}
