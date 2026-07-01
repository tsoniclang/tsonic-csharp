import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
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
  getExplicitReturnType,
} from "./declaration-return-types.js";
import {
  planAttributesForSubject,
} from "./attributes.js";
import {
  planMethodModifiers,
} from "./declaration-class-modifiers.js";

export function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "method declaration", diagnostics);
  const state = createDestructuringPlannerState(node, input.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const returnType = getExplicitReturnType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
  const modifiers = planMethodModifiers(node, declaration.name, sourceFile, input);
  state.currentReturnType = returnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (modifiers.includes("async")) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
    state.currentReturnExpressionTargetType = returnExpressionType?.targetType;
  }
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
        ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
      ],
    },
  };
}
