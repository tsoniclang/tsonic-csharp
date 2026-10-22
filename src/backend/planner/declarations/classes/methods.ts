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
import type { CsharpNativeMemberIdentity } from "../../../../target-model/names/model.js";
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
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import {
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
  subject: CsharpNativeMemberIdentity,
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(input.program.source.ast, node)!;
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const dispatch = input.program.records.callableDispatch.get(node);
  if (dispatch?.kind !== "method") failCsharpPlannerInvariant("An admitted method lost its final native callable contract.", node);
  const callable = dispatch.implementation;
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnType = csharpTypeFromTargetTypeRef(callable.returnType, input.scope.typeParameterNames);
  if (declaredReturnType === undefined) failCsharpPlannerInvariant("An admitted method lost its renderable native return type.", node);
  const modifiers = withCsharpSafetyModifiers(
    planMethodModifiers(node, declaration.name, input, subject),
    node,
    "declaration",
    input,
  );
  const selected = input.program.records.methodDeclaration.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted method requires its selected native declaration name.", node);
  const name = selected.name;
  if (input.program.records.nativeParticipation.get(node) === "signature") {
    return {
      kind: "MethodDeclaration", name, modifiers,
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: declaredReturnType, parameters: parameters.parameters,
    };
  }
  const emission = input.program.records.callableDeclaration.get(node);
  if (emission === undefined) failCsharpPlannerInvariant("An admitted method body requires its native callable emission record.", node);
  if (emission.generator) {
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
    if (generator === undefined) failCsharpPlannerInvariant("An admitted generator method requires its native body and return type.", node);
    return {
      kind: "MethodDeclaration",
      name,
      modifiers,
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: generator.generatorTypeNode,
      parameters: parameters.parameters,
      body: generator.body,
    };
  }
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  state.currentReturnExpressionTargetType = input.program.records.returnContext.get(node)?.target;
  if (emission.async) {
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
          ? [planCsharpAbsenceReturn(state.currentReturnExpressionTargetType, input)] : []),
      ],
    },
  };
}

