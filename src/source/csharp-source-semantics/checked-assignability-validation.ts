import {
  acceptObservation,
  deferObservation,
  ExtensionObservationPoint,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionLifecycleContext,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  PostCheckAssignabilityObservationRequest,
  TargetBindingFact,
  TargetConstraint,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  csharpObservedTargetAssignabilityFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObservedTargetAssignabilityFact,
  CsharpTargetMemberOperationFact,
} from "../csharp-facts.js";
import {
  getAstReaderChildNodes,
  getNodeField,
} from "./ast-utils.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";
import {
  getBinaryOperatorText,
} from "./operator-syntax.js";

type CsharpTargetAssignabilityValidation =
  | {
      readonly kind: "compatible";
      readonly evidence: readonly ExtensionEvidence[];
    }
  | {
      readonly kind: "unvalidated";
      readonly evidence: readonly ExtensionEvidence[];
    }
  | {
      readonly kind: "invalid";
      readonly message: string;
      readonly evidence: readonly ExtensionEvidence[];
    };

export function observeCsharpPostCheckAssignability(
  request: PostCheckAssignabilityObservationRequest,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<undefined> {
  void host;
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const subject = request.expression ?? request.errorNode ?? request.target;
  context.facts.set(subject, csharpObservedTargetAssignabilityFactKey, {
    source: request.source,
    target: request.target,
    ...(request.relation !== undefined ? { relation: request.relation } : {}),
    ...(request.errorNode !== undefined ? { errorNode: request.errorNode } : {}),
    ...(request.expression !== undefined ? { expression: request.expression } : {}),
  }, [{ message: "C# target assignability observation recorded after TSTS accepted the TypeScript relation; target validation is deferred until semantic finalization." }]);
  return acceptObservation(undefined, [{ message: "C# post-check target assignability observed without querying or changing the TSTS assignability relation." }]);
}

export function validateCsharpObservedAssignabilityFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  host: CsharpOperationsProviderHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: ExtensionObservationPoint.observePostCheckAssignability,
    extensionId: lifecycleContext.extensionId,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext<"target.observePostCheckAssignability">;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    validateObservedAssignabilityFactsForNode(sourceFile, context, host);
  }
}

function validateObservedAssignabilityFactsForNode(
  node: Node | undefined,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): void {
  if (node === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(context.compiler!.ast, node)) {
    validateObservedAssignabilityFactsForNode(child, context, host);
  }
  const fact = context.facts.get(node, csharpObservedTargetAssignabilityFactKey);
  if (fact === undefined) {
    diagnoseAnyTypedBoundaryForNode(node, context);
    return;
  }
  validateObservedAssignmentTargetFact(fact, context);
  const source = host.getTargetTypeRefForSubject(fact.source, context);
  const target = host.getTargetTypeRefForSubject(fact.target, context);
  const validation = validateCsharpTargetAssignability(source, target, host, new Set());
  if (validation.kind !== "invalid") {
    return;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_ASSIGNABILITY_INVALID",
      9100120,
      validation.message,
    ),
    nodeOrSpan: fact.expression ?? fact.errorNode,
    evidence: validation.evidence,
    identity: `csharp-target-assignability:${subjectIdentity(fact.expression ?? fact.errorNode ?? fact.target)}`,
  });
}

function diagnoseAnyTypedBoundaryForNode(
  node: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): void {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return;
  }
  const ast = compiler.ast;
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Right")), runtimeCarrierFactKey)?.carrier,
      context.facts.get(asNode(getNodeField(node, "Left")), runtimeCarrierFactKey)?.carrier,
    );
    return;
  }
  const kind = ast.kindName(node);
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Initializer")), runtimeCarrierFactKey)?.carrier,
      context.facts.get(node, runtimeCarrierFactKey)?.carrier ??
        context.facts.get(asNode(getNodeField(node, "Type")), runtimeCarrierFactKey)?.carrier,
    );
    return;
  }
  if (kind === "KindReturnStatement") {
    appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Expression")), runtimeCarrierFactKey)?.carrier,
      getEnclosingReturnTargetCarrier(node, context),
    );
  }
}

function appendAnyBoundaryDiagnostic(
  node: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): void {
  if (!isAnyBoundary(source, target)) {
    return;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_ASSIGNABILITY_INVALID",
      9100120,
      "C# target assignment cannot cross a TypeScript any boundary without finalized target capability facts for the runtime carrier.",
    ),
    nodeOrSpan: node,
    evidence: [
      { message: "C# target validation reason", details: "A typed boundary uses the opaque any runtime carrier without a finalized target conversion or dynamic carrier operation." },
      { message: "Source C# target type", details: source },
      { message: "Target C# target type", details: target },
    ],
    identity: `csharp-target-assignability:${subjectIdentity(node)}`,
  });
}

function validateObservedAssignmentTargetFact(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): void {
  if (fact.relation !== "assignment") {
    return;
  }
  const expression = asNode(fact.expression);
  const assignmentTarget = getAssignmentTarget(expression, context);
  if (assignmentTarget === undefined) {
    return;
  }
  const operation = context.facts.get(assignmentTarget, csharpTargetOperationFactKey);
  if (operation?.kind !== "member") {
    return;
  }
  const invalidWriteReason = getInvalidTargetMemberWriteReason(operation);
  if (invalidWriteReason === undefined) {
    return;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_MEMBER_WRITE_INVALID",
      9100134,
      invalidWriteReason.message,
    ),
    nodeOrSpan: assignmentTarget,
    evidence: invalidWriteReason.evidence,
    identity: `csharp-target-member-write:${subjectIdentity(assignmentTarget)}`,
  });
}

function getAssignmentTarget(
  expression: Node | undefined,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): Node | undefined {
  if (expression === undefined) {
    return undefined;
  }
  return asNode(context.compiler?.ast.as.AsBinaryExpression(expression)?.Left) ??
    asNode(getNodeField(expression, "Left")) ??
    asNode(getNodeField(expression, "left"));
}

function getInvalidTargetMemberWriteReason(
  operation: CsharpTargetMemberOperationFact,
): { readonly message: string; readonly evidence: readonly ExtensionEvidence[] } | undefined {
  const member = operation.selectedMember;
  if (member === undefined) {
    return undefined;
  }
  if (member.kind === "event") {
    return {
      message: `C# target assignment cannot write event '${member.targetName}' because source event add/remove semantics are not modeled.`,
      evidence: [{
        message: "C# target mutability validation reason",
        details: "The left-hand side resolved to a provider-selected event. Events require explicit add/remove source semantics before a target write can be emitted.",
      }],
    };
  }
  if (
    (member.kind === "property" || member.kind === "field" || member.kind === "indexer") &&
    member.readonly === true
  ) {
    return {
      message: `C# target assignment cannot write readonly ${member.kind} '${member.targetName}'.`,
      evidence: [{
        message: "C# target mutability validation reason",
        details: "TSTS accepted the source assignment, but the finalized provider target member fact is readonly and cannot be emitted as a C# write.",
      }],
    };
  }
  return undefined;
}

function isAnyBoundary(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): boolean {
  const sourceAny = isCsharpAnyRuntimeCarrier(source);
  const targetAny = isCsharpAnyRuntimeCarrier(target);
  return source !== undefined && target !== undefined && sourceAny !== targetAny;
}

function getEnclosingReturnTargetCarrier(
  returnStatement: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  let current = ast.parent(returnStatement);
  while (current !== undefined) {
    const kind = ast.kindName(current);
    if (
      kind === "KindFunctionDeclaration" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor"
    ) {
      return context.facts.get(asNode(getNodeField(current, "Type")), runtimeCarrierFactKey)?.carrier;
    }
    current = ast.parent(current);
  }
  return undefined;
}

function asNode(value: unknown): Node | undefined {
  return value !== undefined && value !== null && typeof value === "object" ? value as Node : undefined;
}

function validateCsharpTargetAssignability(
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): CsharpTargetAssignabilityValidation {
  if (source === undefined || target === undefined) {
    return {
      kind: "unvalidated",
      evidence: [{
        message: "C# post-check target assignability did not run because a source or target C# type fact was not finalized.",
        details: {
          sourceResolved: source !== undefined,
          targetResolved: target !== undefined,
        },
      }],
    };
  }
  if (targetTypeRefEquals(source, target)) {
    return {
      kind: "compatible",
      evidence: [{ message: "C# post-check target assignability matched identical finalized target types." }],
    };
  }
  if (isCsharpAnyRuntimeCarrier(source) || isCsharpAnyRuntimeCarrier(target)) {
    return invalidAnyAssignability(source, target);
  }
  const nullableTargetElement = getCsharpNullableElementTargetType(target);
  if (nullableTargetElement !== undefined && targetTypeRefEquals(source, nullableTargetElement)) {
    return {
      kind: "compatible",
      evidence: [{ message: "C# post-check target assignability matched a value assignable to its nullable target type." }],
    };
  }
  if (source.kind === "target-named" && target.kind === "target-named") {
    return validateNamedCsharpTargetAssignability(source, target, host, visited);
  }
  return {
    kind: "unvalidated",
    evidence: [{
      message: "C# post-check target assignability has no target-specific rule for this finalized source/target carrier pair.",
      details: { source, target },
    }],
  };
}

function invalidAnyAssignability(source: TargetTypeRef, target: TargetTypeRef): CsharpTargetAssignabilityValidation {
  return {
    kind: "invalid",
    message: "C# target assignment cannot cross a TypeScript any boundary without finalized target capability facts for the runtime carrier.",
    evidence: [
      { message: "TSTS relation decision", details: "TypeScript assignability was accepted before C# target validation observed the operation." },
      { message: "C# target validation reason", details: "The source or target finalized to the opaque any runtime carrier, which is not a renderable or dynamic C# target type." },
      { message: "Source C# target type", details: source },
      { message: "Target C# target type", details: target },
    ],
  };
}

function validateNamedCsharpTargetAssignability(
  source: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  target: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): CsharpTargetAssignabilityValidation {
  const relationKey = `${targetTypeRefKey(source)}=>${targetTypeRefKey(target)}`;
  if (visited.has(relationKey)) {
    return invalidNamedAssignability(source, target, "C# target assignability proof encountered a repeated provider target relation.");
  }
  visited.add(relationKey);
  if (source.id === target.id) {
    return validateConstructedNamedTargetAssignability(source, target, host, visited);
  }
  const baseType = host.getBaseTargetTypeRef?.(source);
  if (baseType !== undefined) {
    const baseValidation = validateCsharpTargetAssignability(baseType, target, host, visited);
    if (baseValidation.kind === "compatible") {
      return baseValidation;
    }
  }
  for (const contract of implementedContractTargetTypes(source, host)) {
    const contractValidation = validateCsharpTargetAssignability(contract, target, host, visited);
    if (contractValidation.kind === "compatible") {
      return contractValidation;
    }
  }
  return invalidNamedAssignability(
    source,
    target,
    "No finalized provider base-type or implemented-interface fact proves a C# target assignment conversion.",
  );
}

function validateConstructedNamedTargetAssignability(
  source: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  target: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): CsharpTargetAssignabilityValidation {
  const sourceArguments = source.typeArguments ?? [];
  const targetArguments = target.typeArguments ?? [];
  if (sourceArguments.length !== targetArguments.length) {
    return invalidNamedAssignability(
      source,
      target,
      "Finalized C# target generic arity differs between the source and target constructed types.",
    );
  }
  if (sourceArguments.length === 0) {
    return {
      kind: "compatible",
      evidence: [{ message: "C# post-check target assignability matched the same non-generic target type." }],
    };
  }
  const binding = host.getCsharpTargetBindingByTargetId(source.id);
  const typeParameters = binding?.typeParameters ?? [];
  for (let index = 0; index < sourceArguments.length; index += 1) {
    const sourceArgument = sourceArguments[index]!;
    const targetArgument = targetArguments[index]!;
    const parameter = typeParameters[index];
    const argumentValidation = validateTargetTypeArgumentPosition(
      sourceArgument,
      targetArgument,
      parameter,
      host,
      visited,
    );
    if (argumentValidation.kind !== "compatible") {
      return invalidNamedAssignability(
        source,
        target,
        parameter === undefined
          ? "No finalized provider type-parameter fact proves variance for this C# generic target type."
          : `C# generic type parameter '${parameter.name}' is ${parameter.variance ?? "invariant"} and does not permit this target type-argument conversion.`,
      );
    }
  }
  return {
    kind: "compatible",
    evidence: [{ message: "C# post-check target assignability matched provider-proven generic variance facts." }],
  };
}

function validateTargetTypeArgumentPosition(
  sourceArgument: TargetTypeRef,
  targetArgument: TargetTypeRef,
  parameter: TargetTypeParameter | undefined,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): CsharpTargetAssignabilityValidation {
  if (targetTypeRefEquals(sourceArgument, targetArgument)) {
    return {
      kind: "compatible",
      evidence: [{ message: "C# generic type argument matched exactly." }],
    };
  }
  if (parameter?.variance === "out") {
    return validateCsharpTargetAssignability(sourceArgument, targetArgument, host, visited);
  }
  if (parameter?.variance === "in") {
    return validateCsharpTargetAssignability(targetArgument, sourceArgument, host, visited);
  }
  return {
    kind: "invalid",
    message: "C# generic type argument is invariant and does not match exactly.",
    evidence: [{ message: "C# invariant generic type argument mismatch.", details: { sourceArgument, targetArgument, parameter } }],
  };
}

function implementedContractTargetTypes(
  source: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  host: CsharpOperationsProviderHost,
): readonly TargetTypeRef[] {
  const binding = host.getCsharpTargetBindingByTargetId(source.id);
  if (binding === undefined) {
    return [];
  }
  const substitutions = targetTypeParameterSubstitutions(binding, source.typeArguments ?? []);
  return (binding.implementedContracts ?? []).flatMap((constraint) =>
    constraint.kind === "implements"
      ? [implementedConstraintTargetType(constraint, substitutions)]
      : []
  );
}

function implementedConstraintTargetType(
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  return {
    kind: "target-named",
    id: constraint.contract,
    ...(constraint.typeArguments !== undefined && constraint.typeArguments.length > 0
      ? { typeArguments: constraint.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }
      : {}),
  };
}

function targetTypeParameterSubstitutions(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  return new Map((binding.typeParameters ?? [])
    .map((parameter, index) => {
      const argument = typeArguments[index];
      return argument === undefined ? undefined : [parameter.name, argument] as const;
    })
    .filter((entry): entry is readonly [string, TargetTypeRef] => entry !== undefined));
}

function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }
          : {}),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameters(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameters(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameters(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameters(argument, substitutions)),
        result: substituteTargetTypeParameters(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameters(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function invalidNamedAssignability(
  source: TargetTypeRef,
  target: TargetTypeRef,
  reason: string,
): CsharpTargetAssignabilityValidation {
  return {
    kind: "invalid",
    message: `C# target assignment cannot assign '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}' after TSTS accepted the TypeScript relation.`,
    evidence: [
      { message: "TSTS relation decision", details: "TypeScript assignability was accepted before C# target validation observed the operation." },
      { message: "C# target validation reason", details: reason },
      { message: "Source C# target type", details: source },
      { message: "Target C# target type", details: target },
    ],
  };
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
