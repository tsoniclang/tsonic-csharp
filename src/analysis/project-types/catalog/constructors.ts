import type { Node } from "@tsonic/tsts";
import type { SourceNodeConstructorSignature, SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpSourceNodeIdentity } from "../../../source/extension/identities.js";
import type { CsharpProjectForwardingConstructor, CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../../target-model/records/types/project-types.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import type { CsharpTargetMember, CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeQueries } from "../../../policy/model/type-resolution.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../../../policy/types/callables/member-substitution.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpRepresentationDiagnostic } from "../../source-evidence/representations.js";
import { csharpSourceParameterPassingMode } from "../../../source/extension/arguments.js";
import { selectCsharpSourceParameterVector } from "../../../policy/types/callables/parameter-vector.js";
import { tryCsharpIdentifier } from "../../../target-model/names/identifiers.js";

export interface CsharpProjectConstructorPolicyHost {
  readonly ast: import("@tsonic/tsts").AstReader;
  readonly facts: SourceProgramFacts;
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypeQueries;
  targetTypeForDefinition(definition: CsharpProjectTypeDefinition, arguments_: readonly TargetTypeRef[]): CsharpTargetNamedTypeRef;
  profileConstructors(declaration: Node): readonly CsharpTargetMember[];
}

export function selectCsharpProjectForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost, definition: CsharpProjectTypeDefinition,
  baseType: TargetTypeRef, source: SourceNodeConstructorSignature,
):
  | { readonly kind: "resolved"; readonly constructor: CsharpProjectForwardingConstructor }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue }
  | { readonly kind: "excluded" } {
  const declaration = source.identity.declaration;
  const provider = declaration === undefined ? { kind: "none" as const } : host.facts.navigation.providerDeclaration(declaration);
  let baseMember: CsharpTargetMember | undefined;
  if (provider.kind === "present") {
    const selected = host.providers.resolveSignature(provider.value);
    if (selected.kind !== "resolved") return issue("CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_UNRESOLVED",
      selected.kind === "missing" ? selected.reason : selected.diagnostic.message);
    const candidates = selected.relations.filter(relation => relation.kind === "signature" &&
      baseType.kind === "target-named" && relation.targetBinding.id === baseType.id && relation.targetMember.kind === "constructor" &&
      relation.targetMember.csharpConstructorAccessibility !== undefined && relation.targetMember.csharpConstructorObsolete !== undefined &&
      relation.receiver.kind === "none" && relation.methodTypeParameters.length === 0 &&
      (relation.targetMember.typeParameters?.length ?? 0) === 0 &&
      ["public", "protected", "protected-internal"].includes(relation.targetMember.csharpConstructorAccessibility));
    if (candidates.length !== 1 || candidates[0]?.kind !== "signature" || baseType.kind !== "target-named") {
      return issue("CSHARP_PROJECT_CONSTRUCTOR_PROVIDER_AMBIGUOUS", "The original provider constructor requires exactly one inheritable physical base constructor.");
    }
    const relation = candidates[0];
    if (relation.targetMember.csharpConstructorObsolete) return { kind: "excluded" };
    const substitutions = csharpTargetBindingSubstitutions(relation.targetBinding, baseType.typeArguments ?? []);
    if (substitutions === undefined) return issue("CSHARP_PROJECT_CONSTRUCTOR_TYPE_ARGUMENTS_UNRESOLVED",
      "The exact Native base type arguments must close the provider constructor binding.");
    baseMember = substituteCsharpTargetMember(relation.targetMember, substitutions);
  } else if (declaration !== undefined && !host.facts.navigation.isProjectDeclaration(declaration)) {
    const candidates = host.profileConstructors(declaration);
    if (candidates.length !== 1) return issue("CSHARP_PROJECT_CONSTRUCTOR_TARGET_UNRESOLVED",
      "The original inherited source-profile signature requires exactly one physical base constructor.");
    baseMember = candidates[0]!;
  }
  if (baseMember?.csharpInvocation !== undefined) return issue("CSHARP_PROJECT_CONSTRUCTOR_INVOCATION_UNSUPPORTED",
    "A project class cannot inherit a constructor implemented by a Native factory or array creation.");

  const parameters: CsharpTargetParameter[] = [];
  if (baseMember !== undefined) parameters.push(...baseMember.parameters);
  else for (const parameter of source.parameters) {
    const name = tryCsharpIdentifier(parameter.parameterName);
    if (name === undefined) return issue("CSHARP_PROJECT_CONSTRUCTOR_PARAMETER_UNRESOLVED",
      "The inherited constructor parameter requires its exact legal Native identifier.", parameter.parameterDeclaration);
    const represented = host.types.representation.represent(parameter.value, "storage", parameter.parameterDeclaration ?? definition.declaration);
    if (represented.kind !== "represented") {
      const diagnostic = csharpRepresentationDiagnostic(represented);
      return { kind: "unresolved", issue: { node: diagnostic.sourceNode ?? definition.declaration, source: diagnostic.source,
        code: diagnostic.code, message: diagnostic.message } };
    }
    const mode = parameter.parameterDeclaration === undefined ? Object.freeze({ kind: "resolved" as const, value: "by-value" as const })
      : csharpSourceParameterPassingMode(host.facts.protocols, parameter.parameterDeclaration);
    if (mode.kind === "refused") return { kind: "unresolved", issue: { node: mode.site, source: mode.source,
      code: mode.code, message: mode.message } };
    const vector = selectCsharpSourceParameterVector({ name, type: represented.value.carrier,
      passingMode: mode.value,
      ...(parameter.acceptsOmission ? { optional: true, csharpOmittableOptionalArgument: true as const } : {}),
      ...(parameter.rest ? { paramsArray: true } : {}) },
      parameter.rest && parameter.value.type.kind === "tuple"
        ? parameter.value.type.elements.map(element => ({ elementKind: element.kind })) : undefined);
    if (vector === undefined) return issue("CSHARP_PROJECT_CONSTRUCTOR_PARAMS_UNSUPPORTED",
      "The inherited constructor requires its exact original tuple/rest parameter vector.");
    parameters.push(...vector);
  }
  const names = new Set<string>();
  let omissionStarted = false;
  for (const [index, parameter] of parameters.entries()) {
    if (tryCsharpIdentifier(parameter.name) === undefined || names.has(parameter.name)) return issue(
      "CSHARP_PROJECT_CONSTRUCTOR_PARAMETER_NAME_CONFLICT", "Forwarding constructor parameters require unique legal Native identifiers.");
    names.add(parameter.name);
    if (parameter.paramsArray) {
      if (index !== parameters.length - 1 || parameter.type.kind !== "array" || parameter.passingMode !== "by-value" || omissionStarted) {
        return issue("CSHARP_PROJECT_CONSTRUCTOR_PARAMS_UNSUPPORTED", "A forwarding params slot requires a final by-value Native array without a preceding omittable suffix.");
      }
    } else if (parameter.csharpOmittableOptionalArgument) omissionStarted = true;
    else if (omissionStarted) return issue("CSHARP_PROJECT_CONSTRUCTOR_OMISSION_UNSUPPORTED",
      "Forwarding constructor omission must form a complete trailing suffix.");
  }
  const identity = csharpSourceNodeIdentity(host.ast, declaration ?? source.identity.owner);
  if (identity === undefined) return issue("CSHARP_PROJECT_CONSTRUCTOR_IDENTITY_UNRESOLVED",
    "An inherited constructor requires its actual original Source identity, including implicit constructor ownership.");
  const targetMember: CsharpTargetMember = Object.freeze({
    id: `${definition.id}::forward-constructor:${baseMember?.id ?? identity + csharpForwardingConstructorSignatureKey(parameters)}`,
    sourceName: "constructor", targetName: ".ctor", kind: "constructor",
    parameters: Object.freeze(parameters), declaringType: host.targetTypeForDefinition(definition, definition.typeParameterBindings) });
  return { kind: "resolved", constructor: Object.freeze({ definition, source, targetMember,
    ...(baseMember === undefined ? {} : { baseMemberId: baseMember.id }) }) };

  function issue(code: string, message: string, node = declaration ?? definition.declaration):
    { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
    return { kind: "unresolved", issue: { node, code, message } };
  }
}

export function csharpForwardingConstructorSignatureKey(parameters: readonly CsharpTargetParameter[]): string {
  return JSON.stringify(parameters.map(parameter => [targetTypeRefKey(parameter.type), parameter.passingMode, parameter.paramsArray === true]));
}
