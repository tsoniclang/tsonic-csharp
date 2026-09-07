import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpMethodDeclaration,
} from "../../target-ast/roslyn/index.js";
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
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpWellKnownSymbolTargetMemberName,
} from "../../../target-model/types/index.js";
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
  const declaration = AsMethodDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "method declaration", diagnostics);
  const state = createDestructuringPlannerState(node, input.program.source.ast);
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
    return {
      kind: "MethodDeclaration",
      name,
      modifiers: modifiers.filter((modifier) => modifier !== "async"),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: generator?.generatorTypeNode ?? declaredReturnType,
      parameters: parameters.parameters,
      body: generator?.body ?? { kind: "Block", statements: [] },
    };
  }
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (modifiers.includes("async")) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
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
    modifiers,
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...bodyStatements,
        ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
          ? [{ kind: "ReturnStatement" as const, expression: { kind: "LiteralExpression" as const, value: null } }] : []),
      ],
    },
  };
}

function planMethodDeclarationName(
  nameNode: Node | undefined,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string {
  if (nameNode !== undefined && input.program.source.ast.is.IsComputedPropertyName(nameNode)) {
    const selected = input.program.sourceEvidence.wellKnownSymbol(nameNode);
    if (selected !== undefined) {
      const targetName = csharpWellKnownSymbolTargetMemberName(selected.kind);
      if (targetName !== undefined) {
        return targetName;
      }
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
