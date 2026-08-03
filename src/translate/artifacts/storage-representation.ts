import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpConversionIsApplicable,
  selectCsharpExpressionConversion,
} from "../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";

export type CsharpStorageRepresentationRequest =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "requested" }
  | { readonly kind: "rejected"; readonly reason: string };

export function requireCsharpStorageRepresentation(
  input: CsharpTranslationContext,
  expression: Node,
  sourceFile: SourceFile,
  targetType: TargetTypeRef,
): CsharpStorageRepresentationRequest {
  const reference = input.navigation.referenceFor(expression);
  if (
    reference === undefined ||
    !input.ast.is.IsVariableDeclaration(reference.declaration)
  ) {
    return { kind: "not-applicable" };
  }
  const declaration = input.ast.as.AsVariableDeclaration(reference.declaration);
  if (declaration?.Type !== undefined || declaration?.Initializer === undefined) {
    return { kind: "not-applicable" };
  }
  const initializerSourceFile = input.ast.getSourceFile(declaration.Initializer) ??
    reference.sourceFile ?? sourceFile;
  const initializerType = input.types.resolveNode(
    declaration.Initializer,
    initializerSourceFile,
  );
  const initializerConversion = selectCsharpExpressionConversion(
    input,
    declaration.Initializer,
    initializerType,
    targetType,
    "implicit",
  );
  if (!csharpConversionIsApplicable(initializerConversion, "implicit")) {
    return { kind: "not-applicable" };
  }
  const revision = input.artifacts.revision;
  const request = input.artifacts.requireStorage(expression, {
    kind: "target-representation",
    targetType,
  });
  if (request.kind === "rejected") {
    return request;
  }
  return input.artifacts.revision === revision
    ? { kind: "not-applicable" }
    : { kind: "requested" };
}
