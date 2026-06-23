import {
  acceptObservation,
  deferObservation,
  ExtensionObservationPoint,
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
} from "../csharp-facts.js";
import {
  getAstReaderChildNodes,
} from "./ast-utils.js";
import {
  getCsharpNullableElementTargetType,
} from "./target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";

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
    return;
  }
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
