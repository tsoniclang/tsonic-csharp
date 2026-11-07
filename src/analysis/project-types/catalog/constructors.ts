import type { CsharpProjectForwardingConstructor } from "../../../target-model/records/types/project-types.js";
import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor, SourceTypeDescriptorSignature } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { tryCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeHeritage, CsharpProjectTypeIssue } from "../../../target-model/records/types/project-types.js";
import type { CsharpTargetMember, CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeQueries } from "../../../policy/model/type-resolution.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../../../policy/types/callables/member-substitution.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpSourceProfileConstructor } from "../../operations/source-profiles/selection.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export interface CsharpProjectConstructorPolicyHost {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly types: CsharpTypeQueries;
  targetTypeForDefinition(
    definition: CsharpProjectTypeDefinition,
    typeArguments: readonly TargetTypeRef[],
  ): CsharpTargetNamedTypeRef;
}

export function selectCsharpProjectConstructorSignature(
  _host: CsharpProjectConstructorPolicyHost,
  _declaration: Node,
  signature: Node,
  parameters: readonly SourceTypeDescriptor[],
  exact: CsharpProjectForwardingConstructor | undefined,
  constructors: readonly CsharpProjectForwardingConstructor[] | undefined,
): CsharpProjectForwardingConstructor | undefined {
  if (exact !== undefined) return exact;
  if (constructors === undefined) return undefined;
  // The selected construct signature declaration identifies the inherited constructor; its parameter list is the same
  // declared list, so the arity check only guards against a mismatched selection.
  const candidates = constructors.filter(candidate =>
    candidate.source.declaration === signature && candidate.source.parameters.length === parameters.length);
  return candidates?.length === 1 ? candidates[0] : undefined;
}

export function selectCsharpProjectForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  baseType: TargetTypeRef,
  source: SourceTypeDescriptorSignature,
  definitionsById: ReadonlyMap<string, CsharpProjectTypeDefinition>,
  heritageById: ReadonlyMap<string, CsharpProjectTypeHeritage>,
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue }
  | { readonly kind: "excluded" } {
  if (source.declaration === undefined) {
    if (source.parameters.length !== 0) {
      return constructorIssue(
        definition,
        "CSHARP_PROJECT_CONSTRUCTOR_DECLARATION_UNRESOLVED",
        "An implicit project constructor has parameters but no exact source declaration.",
      );
    }
    return createSourceForwardingConstructor(host, definition, source);
  }
  const providerEvidence = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.declaration],
    "signature",
  );
  if (providerEvidence.kind === "conflict") {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_CONFLICT",
      providerEvidence.reason,
      source.declaration,
    );
  }
  if (providerEvidence.kind === "resolved") {
    return createProviderForwardingConstructor(
      host,
      definition,
      baseType,
      source,
      providerEvidence.declaration,
    );
  }
  if (host.facts.navigation.identity.isProjectDeclaration(source.declaration)) {
    return createSourceForwardingConstructor(host, definition, source);
  }
  const constructors = selectCsharpSourceProfileConstructor(host, source.declaration);
  if (constructors.length !== 0) {
    const nativeBase = inheritedNativeBaseType(host, baseType, source, definitionsById, heritageById);
    if (constructors.length !== 1 ||
      constructors[0]!.declaringType === undefined ||
      nativeBase === undefined || !targetTypeRefEquals(constructors[0]!.declaringType, nativeBase)) {
      return constructorIssue(definition, "CSHARP_PROJECT_CONSTRUCTOR_SOURCE_PROFILE_CONFLICT",
        "An inherited source-profile constructor requires one exact selected native base contract.", source.declaration);
    }
    return createNativeForwardingConstructor(host, definition, source, constructors[0]!);
  }
  return constructorIssue(
    definition,
    "CSHARP_PROJECT_CONSTRUCTOR_TARGET_UNRESOLVED",
    "The inherited source constructor has neither project ownership nor an exact provider signature relation.",
    source.declaration,
  );
}

function inheritedNativeBaseType(
  host: CsharpProjectConstructorPolicyHost,
  baseType: TargetTypeRef,
  source: SourceTypeDescriptorSignature,
  definitionsById: ReadonlyMap<string, CsharpProjectTypeDefinition>,
  heritageById: ReadonlyMap<string, CsharpProjectTypeHeritage>,
): TargetTypeRef | undefined {
  const visited = new Set<string>();
  let current: TargetTypeRef | undefined = baseType;
  while (current?.kind === "target-named") {
    if (visited.has(current.id)) return undefined;
    visited.add(current.id);
    const definition = definitionsById.get(current.id);
    if (definition === undefined) return current;
    const constructors = host.facts.objects.construction(definition.declaration);
    if ("code" in constructors) return failTargetAnalysisInvariant("tsonic-csharp",
      "Class construction is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", definition.declaration);
    if (!constructors.implicit || constructors.signatures.filter(signature => signature.declaration === source.declaration &&
      signature.parameters.length === source.parameters.length).length !== 1) return undefined;
    current = heritageById.get(definition.id)?.baseType;
  }
  return undefined;
}

function createProviderForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  baseType: TargetTypeRef,
  source: SourceTypeDescriptorSignature,
  declaration: Parameters<CsharpProviderRelationResolver["resolveSignature"]>[0],
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue }
  | { readonly kind: "excluded" } {
  if (baseType.kind !== "target-named") {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_BASE_UNRESOLVED",
      "A provider-backed forwarding constructor requires one exact named C# base type.",
      source.declaration,
    );
  }
  const resolution = host.providers.resolveSignature(declaration);
  if (resolution.kind !== "resolved") {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_UNRESOLVED",
      resolution.kind === "missing"
        ? resolution.reason
        : resolution.diagnostic.message,
      source.declaration,
    );
  }
  const candidates = resolution.relations.filter(
    (relation): relation is CsharpProviderSignatureRelation =>
      relation.kind === "signature" &&
      relation.targetBinding.id === baseType.id &&
      relation.targetMember.kind === "constructor" &&
      relation.targetMember.csharpConstructorAccessibility !== undefined &&
      relation.targetMember.csharpConstructorObsolete !== undefined &&
      relation.receiver.kind === "none" &&
      relation.methodTypeParameters.length === 0 &&
      (relation.targetMember.typeParameters?.length ?? 0) === 0,
  );
  if (candidates.length !== 1) {
    return constructorIssue(
      definition,
      candidates.length === 0
        ? "CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_UNRESOLVED"
        : "CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_AMBIGUOUS",
      candidates.length === 0
        ? "The exact provider signature has no inheritable C# constructor relation for the selected base type."
        : "The exact provider signature maps to more than one inheritable C# base constructor.",
      source.declaration,
    );
  }
  const relation = candidates[0]!;
  if (relation.targetMember.csharpConstructorObsolete) return { kind: "excluded" };
  const substitutions = csharpTargetBindingSubstitutions(
    relation.targetBinding,
    baseType.typeArguments ?? [],
  );
  if (substitutions === undefined) {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_TYPE_ARGUMENTS_UNRESOLVED",
      "The selected C# base type arguments do not close the provider constructor binding.",
      source.declaration,
    );
  }
  const baseMember = substituteCsharpTargetMember(
    relation.targetMember,
    substitutions,
  );
  return createNativeForwardingConstructor(host, definition, source, baseMember);
}

function createNativeForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  source: SourceTypeDescriptorSignature,
  baseMember: CsharpTargetMember,
):
  | { readonly kind: "resolved"; readonly constructor: CsharpProjectForwardingConstructor }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  if (baseMember.csharpInvocation !== undefined) {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_INVOCATION_UNSUPPORTED",
      "A project class cannot inherit a provider constructor represented by a target factory or array-creation invocation.",
      source.declaration,
    );
  }
  const targetMember = forwardingTargetMember(
    host,
    definition,
    baseMember.parameters,
    baseMember.id,
  );
  const parameterIssue = validateForwardingParameters(
    definition,
    source,
    targetMember.parameters,
  );
  return parameterIssue ?? {
    kind: "resolved",
    constructor: Object.freeze({
      definition,
      source,
      targetMember,
      baseMemberId: baseMember.id,
    }),
  };
}

function createSourceForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  source: SourceTypeDescriptorSignature,
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  const parameters: CsharpTargetParameter[] = [];
  for (const sourceParameter of source.parameters) {
    const declarationName = sourceParameter.declaration === undefined ? undefined : host.ast.name(sourceParameter.declaration);
    const parameterName = declarationName === undefined ? "" : host.ast.text(declarationName);
    const name = tryCsharpIdentifier(parameterName);
    const type = host.types.represent(sourceParameter.type, sourceParameter.declaration ?? definition.declaration, "storage");
    if (type.kind === "csharp-refused") {
      return { kind: "unresolved", issue: { node: type.site, code: type.code, message: type.message } };
    }
    if (name === undefined) {
      return constructorIssue(
        definition,
        "CSHARP_PROJECT_CONSTRUCTOR_PARAMETER_UNRESOLVED",
        `Inherited source constructor parameter '${parameterName}' has no exact C# name.`,
        sourceParameter.declaration,
      );
    }
    parameters.push(Object.freeze({
      name,
      type,
      passingMode: "by-value",
      ...(sourceParameter.kind === "optional"
        ? {
            optional: true,
            csharpOmittableOptionalArgument: true as const,
          }
        : {}),
      ...(sourceParameter.kind === "rest" ? { paramsArray: true } : {}),
    }));
  }
  const baseIdentity = source.declaration === undefined
    ? "implicit-default"
    : host.facts.navigation.identity.identity(source.declaration);
  if (baseIdentity === undefined) {
    return constructorIssue(
      definition,
      "CSHARP_PROJECT_CONSTRUCTOR_IDENTITY_UNRESOLVED",
      "The inherited project constructor has no canonical source identity.",
      source.declaration,
    );
  }
  const targetMember = forwardingTargetMember(
    host,
    definition,
    parameters,
    `source:${baseIdentity}`,
  );
  const parameterIssue = validateForwardingParameters(
    definition,
    source,
    targetMember.parameters,
  );
  return parameterIssue ?? {
    kind: "resolved",
    constructor: Object.freeze({ definition, source, targetMember }),
  };
}

function forwardingTargetMember(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  parameters: readonly CsharpTargetParameter[],
  baseIdentity: string,
): CsharpTargetMember {
  const declaringType = host.targetTypeForDefinition(
    definition,
    definition.typeParameterBindings,
  );
  return Object.freeze({
    id: `${definition.id}::forward-constructor:${baseIdentity}`,
    sourceName: "constructor",
    targetName: ".ctor",
    kind: "constructor",
    parameters: Object.freeze([...parameters]),
    declaringType,
  });
}

function validateForwardingParameters(
  definition: CsharpProjectTypeDefinition,
  source: SourceTypeDescriptorSignature,
  parameters: readonly CsharpTargetParameter[],
): { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } | undefined {
  const names = new Set<string>();
  let omissionStarted = false;
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index]!;
    if (
      tryCsharpIdentifier(parameter.name) === undefined ||
      names.has(parameter.name)
    ) {
      return constructorIssue(
        definition,
        "CSHARP_PROJECT_CONSTRUCTOR_PARAMETER_NAME_CONFLICT",
        `Forwarding constructor parameter '${parameter.name}' is not one unique exact C# identifier.`,
        source.declaration,
      );
    }
    names.add(parameter.name);
    if (parameter.paramsArray === true) {
      if (
        index !== parameters.length - 1 ||
        parameter.type.kind !== "array" ||
        parameter.passingMode !== "by-value" ||
        omissionStarted
      ) {
        return constructorIssue(
          definition,
          "CSHARP_PROJECT_CONSTRUCTOR_PARAMS_UNSUPPORTED",
          "A forwarding params parameter must be one final by-value C# array parameter and cannot follow an omittable parameter.",
          source.declaration,
        );
      }
      continue;
    }
    const omittable = parameter.csharpOmittableOptionalArgument === true;
    if (omittable) {
      omissionStarted = true;
    } else if (omissionStarted) {
      return constructorIssue(
        definition,
        "CSHARP_PROJECT_CONSTRUCTOR_OMISSION_UNSUPPORTED",
        "Forwarding constructor omission must form a trailing parameter suffix before any final params array.",
        source.declaration,
      );
    }
  }
  return undefined;
}

export function csharpForwardingConstructorSignatureKey(
  parameters: readonly CsharpTargetParameter[],
): string {
  return JSON.stringify(parameters.map((parameter) => [
    targetTypeRefKey(parameter.type),
    parameter.passingMode,
    parameter.paramsArray === true,
  ]));
}

function constructorIssue(
  definition: CsharpProjectTypeDefinition,
  code: string,
  message: string,
  node: CsharpProjectTypeDefinition["declaration"] | undefined =
    definition.declaration,
): { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  return {
    kind: "unresolved",
    issue: { node: node ?? definition.declaration, code, message },
  };
}
