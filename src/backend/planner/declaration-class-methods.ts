import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpMethodDeclaration,
} from "../roslyn/syntax.js";
import {
  AsMethodDeclaration,
} from "./source-ast.js";
import {
  createDestructuringPlannerState,
} from "./bindings.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "./modifiers.js";
import {
  planIdentifierName,
} from "./names.js";
import {
  planParametersWithPrelude,
} from "./parameters.js";
import {
  planBlockStatements,
} from "./statements.js";
import {
  planTypeParameters,
} from "./type-parameters.js";
import {
  getAsyncReturnExpressionExpectedType,
  getDeclarationReturnTargetType,
  getExplicitReturnType,
  reconcileInferredReturnTargetContract,
} from "./declaration-return-types.js";
import {
  planAttributesForSubject,
} from "./attributes.js";
import {
  planMethodModifiers,
} from "./declaration-class-modifiers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  publishCsharpSourceCallableContract,
} from "./source-callable-contracts.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "method declaration", diagnostics);
  const state = createDestructuringPlannerState(node, input.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnTargetType = getDeclarationReturnTargetType(
    declaration.Type,
    node,
    sourceFile,
    input,
  );
  const declaredReturnType = getExplicitReturnType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
  const modifiers = planMethodModifiers(node, declaration.name, sourceFile, input);
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (declaration.Type === undefined && !modifiers.includes("async")) {
    state.observedReturnTargetTypes = [];
  }
  if (modifiers.includes("async")) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
    state.currentReturnExpressionTargetType = returnExpressionType?.targetType;
  }
  const bodyStatements = planBlockStatements(
    declaration.Body,
    sourceFile,
    input,
    diagnostics,
    state,
  );
  const reconciledReturn = declaredReturnTargetType === undefined ||
      declaration.Type !== undefined || modifiers.includes("async")
    ? declaredReturnTargetType === undefined
      ? undefined
      : { kind: "resolved" as const, type: declaredReturnTargetType }
    : reconcileInferredReturnTargetContract(
        input,
        declaredReturnTargetType,
        state.observedReturnTargetTypes ?? [],
        state.returnTargetObservationIncomplete === true,
      );
  if (reconciledReturn?.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      reconciledReturn.reason,
    ));
  }
  const effectiveReturnTargetType = reconciledReturn?.kind === "resolved"
    ? reconciledReturn.type
    : declaredReturnTargetType;
  const returnType = effectiveReturnTargetType === undefined
    ? declaredReturnType
    : csharpTypeFromTargetTypeRef(effectiveReturnTargetType) ??
      declaredReturnType;
  publishCsharpSourceCallableContract(
    node,
    parameters,
    effectiveReturnTargetType,
    input,
    diagnostics,
  );
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Method name"),
    modifiers,
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...bodyStatements,
      ],
    },
  };
}
