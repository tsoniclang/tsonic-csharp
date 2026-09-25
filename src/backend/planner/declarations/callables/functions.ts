import type { CsharpPlanningContext } from "../../context.js";
import { AsFunctionDeclaration } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpMethodDeclaration } from "../../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { createDestructuringPlannerState } from "../../bindings/index.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, isAsyncNode } from "../modifiers.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import { planParametersWithPrelude } from "./parameters.js";
import { planBlockStatements } from "../../statements/index.js";
import { planTypeParameters } from "../../types/type-parameters.js";
import { getAsyncReturnExpressionExpectedType, getDeclarationReturnTargetType, getExplicitReturnType } from "./return-types.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { hasCsharpGeneratorSyntax, planCsharpGeneratorFunction } from "../../statements/generators.js";
import { withCsharpSafetyModifiers } from "../../safety/explicit-safety.js";

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "function declaration", diagnostics);
  const name = planIdentifierName(declaration.name, "__anonymous", input, diagnostics, "Function name");
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnTargetType = getDeclarationReturnTargetType(
    declaration.Type,
    node,
    sourceFile,
    input,
  );
  const declaredReturnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  const generatorSyntax = hasCsharpGeneratorSyntax(node, input);
  if (generatorSyntax) {
    const generator = planCsharpGeneratorFunction(
      node,
      declaration.Body,
      sourceFile,
      input,
      diagnostics,
      state,
      parameters.prelude,
      planBlockStatements,
    );
    return {
      kind: "MethodDeclaration",
      name,
      modifiers: withCsharpSafetyModifiers(
        ["public", "static"],
        node,
        "declaration",
        input,
      ),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: generator?.generatorTypeNode ?? declaredReturnType,
      parameters: parameters.parameters,
      body: generator?.body ?? { kind: "Block", statements: [] },
    };
  }
  const async = isAsyncNode(input.program.source.ast, node);
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (async) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
    state.currentReturnExpressionTargetType = returnExpressionType?.targetType;
  }
  const returnContract = input.program.declarations.returnContract(node);
  state.currentUndefinedReturn = returnContract?.kind === "resolved" && returnContract.undefinedReturn === true;
  const bodyStatements = planBlockStatements(
    declaration.Body,
    sourceFile,
    input,
    diagnostics,
    state,
    parameters.prelude,
  );
  if (returnContract?.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      returnContract.reason,
    ));
  }
  const effectiveReturnTargetType = returnContract?.kind === "resolved"
    ? returnContract.type
    : declaredReturnTargetType;
  const returnType = effectiveReturnTargetType === undefined
    ? declaredReturnType
    : csharpTypeFromTargetTypeRef(effectiveReturnTargetType) ??
      declaredReturnType;
  return {
    kind: "MethodDeclaration",
    name,
    modifiers: withCsharpSafetyModifiers(
      async ? ["public", "static", "async"] : ["public", "static"],
      node,
      "declaration",
      input,
    ),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...bodyStatements,
        ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
          ? [{ kind: "ReturnStatement" as const, expression: { kind: "LiteralExpression" as const, value: null } }] : []),
      ],
    },
  };
}
