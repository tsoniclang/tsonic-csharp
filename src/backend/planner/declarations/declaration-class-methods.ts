import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpMethodDeclaration,
} from "../../roslyn/syntax.js";
import { AsMethodDeclaration } from "@tsonic/target-api/source";
import {
  createDestructuringPlannerState,
} from "../bindings/index.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "./modifiers.js";
import {
  planIdentifierName,
} from "../names/source-identifiers.js";
import {
  planParametersWithPrelude,
} from "../bindings/parameters.js";
import {
  planBlockStatements,
} from "../statements/index.js";
import {
  planTypeParameters,
} from "../types/type-parameters.js";
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
} from "../types/target-types.js";
import {
  publishCsharpSourceCallableContract,
} from "../artifacts/source-callable-contracts.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  hasCsharpGeneratorSyntax,
  planCsharpGeneratorFunction,
} from "../statements/generators.js";
import {
  withCsharpSafetyModifiers,
} from "../safety/explicit-safety.js";

export function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(input.ast, node)!;
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
  const modifiers = withCsharpSafetyModifiers(
    planMethodModifiers(node, declaration.name, sourceFile, input),
    node,
    "declaration",
    input,
  );
  const name = planMethodDeclarationName(
    node,
    declaration.name,
    input,
    diagnostics,
  );
  if (hasCsharpGeneratorSyntax(node, input)) {
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
    const effectiveReturnTargetType = generator?.generatorType ?? declaredReturnTargetType;
    publishCsharpSourceCallableContract(
      node,
      parameters.targetParameters,
      effectiveReturnTargetType,
      input,
      diagnostics,
    );
    return {
      kind: "MethodDeclaration",
      name,
      modifiers: modifiers.filter((modifier) => modifier !== "async"),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
      returnType: generator?.generatorTypeNode ?? declaredReturnType,
      parameters: parameters.parameters,
      body: generator?.body ?? { kind: "Block", statements: [] },
    };
  }
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
    parameters.targetParameters,
    effectiveReturnTargetType,
    input,
    diagnostics,
  );
  return {
    kind: "MethodDeclaration",
    name,
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

function planMethodDeclarationName(
  declaration: Node,
  nameNode: Node | undefined,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string {
  if (nameNode !== undefined && input.ast.is.IsComputedPropertyName(nameNode)) {
    const selected = input.semanticsFor(declaration)
      .getResolvedWellKnownSymbolInfo(nameNode);
    if (selected?.kind === "dispose") {
      return "Dispose";
    }
    if (selected?.kind === "async-dispose") {
      return "DisposeAsync";
    }
  }
  return planIdentifierName(
    nameNode,
    "MethodDeclaration",
    input,
    diagnostics,
    "Method name",
  );
}
