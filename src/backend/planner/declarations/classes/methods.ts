import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpMethodDeclaration,
} from "../../../target-ast/syntax/index.js";
import { AsMethodDeclaration } from "@tsonic/target-api/source";
import { planCsharpAbsenceReturn } from "../../statements/statement-output.js";
import {
  createDestructuringPlannerState,
} from "../../bindings/index.js";
import {
  planIdentifierName,
} from "../../names/source-identifiers.js";
import {
  planParametersWithPrelude,
} from "../callables/parameters.js";
import {
  planBlockStatements,
} from "../../statements/index.js";
import {
  planTypeParameters,
} from "../../types/type-parameters.js";
import {
  getAsyncReturnExpressionExpectedType,
} from "../callables/return-types.js";
import {
  planAttributesForSubject,
} from "../attributes.js";
import {
  planMethodModifiers,
} from "./modifiers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import {
  csharpWellKnownSymbolTargetMemberName,
} from "../../../../target-model/types/index.js";
import {
  hasCsharpGeneratorSyntax,
  planCsharpGeneratorFunction,
} from "../../statements/generators.js";
import {
  withCsharpSafetyModifiers,
} from "../../safety/explicit-safety.js";

export function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(input.program.source.ast, node)!;
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const callable = input.program.records.callableDispatch.get(node)?.implementation;
  if (callable === undefined) failCsharpPlannerInvariant("An admitted method lost its final native callable contract.", node);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnType = csharpTypeFromTargetTypeRef(callable.returnType, input.scope.typeParameterNames);
  if (declaredReturnType === undefined) failCsharpPlannerInvariant("An admitted method lost its renderable native return type.", node);
  const modifiers = withCsharpSafetyModifiers(
    planMethodModifiers(node, declaration.name, input),
    node,
    "declaration",
    input,
  );
  const name = planMethodDeclarationName(
    declaration.name,
    input,
    diagnostics,
  );
  if (input.program.records.nativeParticipation.get(node) === "signature") {
    return {
      kind: "MethodDeclaration", name, modifiers,
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: declaredReturnType, parameters: parameters.parameters,
    };
  }
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
  state.currentReturnExpressionTargetType = input.program.records.returnContext.get(node)?.target;
  if (modifiers.includes("async")) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
  }
  const returnContract = input.program.records.returnContract.get(node);
  state.currentUndefinedReturn = returnContract?.kind === "resolved" && returnContract.undefinedReturn === true;
  const bodyStatements = planBlockStatements(
    declaration.Body,
    sourceFile,
    input,
    diagnostics,
    state,
    parameters.prelude,
  );
  return {
    kind: "MethodDeclaration",
    name,
    modifiers,
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType: declaredReturnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...bodyStatements,
        ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
          ? [planCsharpAbsenceReturn(state.currentReturnExpressionTargetType, input.scope.typeParameterNames)] : []),
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
    const name = input.program.source.propertyNames.get(nameNode);
    if (name?.kind === "resolved") return planIdentifierName(
      nameNode, "MethodDeclaration", input, diagnostics, "Method name");
    const selected = input.program.records.wellKnownSymbol.get(nameNode);
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
