import type { CsharpPlanningContext } from "../../context.js";
import { sourceExpressionResultDisposition } from "@tsonic/target-api/source";
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
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planCsharpGeneratorFunction } from "../../statements/generators.js";
import { withCsharpSafetyModifiers } from "../../safety/explicit-safety.js";
import { consumeCsharpPlannedValue, planCsharpAbsenceReturn, planCsharpVoidReturn } from "../../statements/statement-output.js";
import { csharpModuleCallableInitializer } from "../../../../target-model/syntax/module-callables.js";
import { planExpression } from "../../expressions/index.js";

export function planModuleCallableDeclaration(
  declaration: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const initializer = csharpModuleCallableInitializer(input.program.source.ast, declaration);
  if (initializer === undefined) failCsharpPlannerInvariant("A native module method requires its original const callable declaration.", declaration);
  const planned = planSourceFunctionDeclaration(initializer, sourceFile, input, diagnostics);
  const modifiers = input.program.records.memberModifiers.get(declaration);
  if (modifiers === undefined) failCsharpPlannerInvariant("A native module method requires its sealed declaration modifiers.", declaration);
  return { ...planned.declaration, kind: "MethodDeclaration",
    modifiers: withCsharpSafetyModifiers([...modifiers.member, ...(planned.async ? ["async" as const] : []),
      ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration, role: "member" })],
      initializer, "declaration", input) };
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const planned = planSourceFunctionDeclaration(node, sourceFile, input, diagnostics);
  return { ...planned.declaration, kind: "MethodDeclaration",
    modifiers: withCsharpSafetyModifiers(["public", "static", ...(planned.async ? ["async" as const] : []),
      ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "member" })],
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
  const ast = input.program.source.ast;
  const declaration = ast.as.AsFunctionDeclaration(node) ?? ast.as.AsArrowFunction(node) ?? ast.as.AsFunctionExpression(node);
  if (declaration === undefined) failCsharpPlannerInvariant("A source method requires its original checked callable definition.", node);
  const disposition = sourceExpressionResultDisposition(ast, node);
  const owner = disposition.kind === "stored" && csharpModuleCallableInitializer(ast, disposition.use) === node
    ? disposition.use : node;
  const sourceName = ast.name(owner);
  const name = sourceName === undefined || parent === undefined ? undefined : getCsharpLocalBindingName(sourceName, input, parent);
  const selectedName = name ?? planCsharpAdmittedMemberName(input.program.records, sourceName);
  const emission = input.program.records.callableDeclaration.get(node);
  if (emission === undefined) failCsharpPlannerInvariant("An admitted source function requires its sealed native declaration plan.", node);
  const state = parent === undefined ? createDestructuringPlannerState(node, input.program.source.ast)
    : createNestedPlannerState(parent, node, input.program.source.ast);
  if (owner !== node) {
    const self = input.program.records.namedSelf.get(node);
    for (const reference of [...self?.calls ?? [], ...self?.values ?? []]) {
      state.expressionOverrides.set(reference, { kind: "IdentifierName", name: selectedName });
    }
  }
  const parameters = planParametersWithPrelude(emission.contract.parameters, sourceFile, input, diagnostics, state);
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
  const body = declaration.Body;
  if (body === undefined) failCsharpPlannerInvariant("An admitted source method requires its checked body.", node);
  let bodyStatements: readonly CsharpStatement[];
  if (ast.is.IsBlock(body)) {
    bodyStatements = planBlockStatements(body, sourceFile, input, diagnostics, state, parameters.prelude);
  } else {
    const value = planExpression(body, sourceFile, input, diagnostics, state);
    if (value === undefined) failCsharpPlannerInvariant("An admitted expression-bodied method requires its native return plan.", body);
    const completion = input.program.records.lambdaBody.get(node)?.completion;
    bodyStatements = [...parameters.prelude, ...(completion === undefined
      ? consumeCsharpPlannedValue(value, expression => [{ kind: "ReturnStatement", expression }],
        () => [{ kind: "ReturnStatement" }])
      : planCsharpVoidReturn(value, completion, state.currentReturnExpressionTargetType, input))];
  }
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
          ? [planCsharpAbsenceReturn(state.currentReturnExpressionTargetType, input)] : []),
      ],
    },
  } };
}
