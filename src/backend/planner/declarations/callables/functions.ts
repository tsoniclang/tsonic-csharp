import type { CsharpPlanningContext } from "../../context.js";
import { AsFunctionDeclaration } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpMethodDeclaration, CsharpStatement } from "../../../target-ast/syntax/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { createDestructuringPlannerState, createNestedPlannerState, getCsharpLocalBindingName,
  type DestructuringPlannerState } from "../../bindings/index.js";
import { planCsharpAdmittedMemberName, planCsharpNativeMemberHiding } from "../modifiers.js";
import { planParametersWithPrelude } from "./parameters.js";
import { planBlockStatements } from "../../statements/index.js";
import { planTypeParameters } from "../../types/type-parameters.js";
import { getAsyncReturnExpressionExpectedType, getExplicitReturnType } from "./return-types.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planCsharpGeneratorFunction } from "../../statements/generators.js";
import { withCsharpSafetyModifiers } from "../../safety/explicit-safety.js";
import { planCsharpAbsenceReturn } from "../../statements/statement-output.js";

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const planned = planSourceFunctionDeclaration(node, sourceFile, input, diagnostics);
  return { ...planned.declaration, kind: "MethodDeclaration",
    modifiers: withCsharpSafetyModifiers(["public", "static", ...(planned.async ? ["async" as const] : []),
      ...planCsharpNativeMemberHiding(input.program.names, { kind: "source", declaration: node, role: "member" })],
      node, "declaration", input) };
}

export function planLocalFunctionDeclaration(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], parent: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (input.program.records.nativeParticipation.get(node) !== "body") return [];
  const planned = planSourceFunctionDeclaration(node, sourceFile, input, diagnostics, parent);
  return [{ ...planned.declaration, kind: "LocalFunctionStatement",
    modifiers: withCsharpSafetyModifiers(planned.async ? ["async"] : [], node, "declaration", input) }];
}

export function planSourceFunctionDeclaration(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  parent?: DestructuringPlannerState,
): { readonly async: boolean; readonly declaration: Omit<CsharpMethodDeclaration, "kind" | "modifiers" | "body"> &
  { readonly body: NonNullable<CsharpMethodDeclaration["body"]> } } {
  const declaration = AsFunctionDeclaration(input.program.source.ast, node)!;
  const name = declaration.name === undefined || parent === undefined ? undefined : getCsharpLocalBindingName(declaration.name, input, parent);
  const selectedName = name ?? planCsharpAdmittedMemberName(input.program.names, declaration.name);
  const emission = input.program.records.callableDeclaration.get(node);
  if (emission === undefined) failCsharpPlannerInvariant("An admitted source function requires its sealed native declaration plan.", node);
  const state = parent === undefined ? createDestructuringPlannerState(node, input.program.source.ast)
    : createNestedPlannerState(parent, node, input.program.source.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  const generatorSyntax = emission.generator;
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
    if (generator === undefined) failCsharpPlannerInvariant("An admitted generator requires its native body and return type.", node);
    return { async: false, declaration: {
      name: selectedName,
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: generator.generatorTypeNode,
      parameters: parameters.parameters,
      body: generator.body,
    } };
  }
  const async = emission.async;
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  state.currentReturnExpressionTargetType = input.program.records.returnContext.get(node)?.target;
  if (async) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
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
  const returnType = csharpTypeFromTargetTypeRef(emission.returnCarrier, input.scope.typeParameterNames);
  if (returnType === undefined) failCsharpPlannerInvariant("An admitted source function requires its renderable native return carrier.", node);
  return { async, declaration: {
    name: selectedName,
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...bodyStatements,
        ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
          ? [planCsharpAbsenceReturn(state.currentReturnExpressionTargetType, input.scope.typeParameterNames)] : []),
      ],
    },
  } };
}
