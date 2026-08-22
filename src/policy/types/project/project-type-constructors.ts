import type {
  AstReader,
  ReadonlySourceFactResolver,
  Signature,
} from "@tsonic/tsts";
import type {
  SourceClassConstructorSignature,
  SourceProgramNavigation,
} from "@tsonic/target-api/source";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import {
  tryCsharpIdentifier,
} from "../../../target-model/names/identifiers.js";
import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../../providers/relations/index.js";
import {
  resolveCsharpProviderDeclarationEvidence,
} from "../../members/providers/evidence.js";
import type {
  CsharpProjectTypeDefinition,
  CsharpProjectTypeHeritage,
  CsharpProjectTypeIssue,
} from "./project-types.js";
import type {
  CsharpTargetMember,
  CsharpTargetNamedTypeRef,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type {
  CsharpTypePolicy,
} from "../resolution/index.js";
import {
  csharpTargetBindingSubstitutions,
  substituteCsharpTargetMember,
} from "../callables/member-substitution.js";
import {
  targetTypeRefKey,
} from "../../../target-model/types/equality.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export interface CsharpProjectForwardingConstructor {
  readonly definition: CsharpProjectTypeDefinition;
  readonly source: SourceClassConstructorSignature;
  readonly targetMember: CsharpTargetMember;
  readonly providerBaseMemberId?: string;
}

export interface CsharpProjectConstructorPolicy {
  readonly issues: readonly CsharpProjectTypeIssue[];
  implicitConstructorsForDeclaration(
    declaration: CsharpProjectTypeDefinition["declaration"],
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
  implicitConstructorForSignature(
    declaration: CsharpProjectTypeDefinition["declaration"],
    signature: Signature,
  ): CsharpProjectForwardingConstructor | undefined;
}

export interface CsharpProjectConstructorPolicyHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly types: CsharpTypePolicy;
  targetTypeForDefinition(
    definition: CsharpProjectTypeDefinition,
    typeArguments: readonly TargetTypeRef[],
  ): CsharpTargetNamedTypeRef;
}

export function createCsharpProjectConstructorPolicy(
  host: CsharpProjectConstructorPolicyHost,
  definitions: readonly CsharpProjectTypeDefinition[],
  heritageById: ReadonlyMap<string, CsharpProjectTypeHeritage>,
): CsharpProjectConstructorPolicy {
  const issues: CsharpProjectTypeIssue[] = [];
  const byDeclaration = new WeakMap<
    CsharpProjectTypeDefinition["declaration"],
    readonly CsharpProjectForwardingConstructor[]
  >();
  const bySignature = new WeakMap<
    CsharpProjectTypeDefinition["declaration"],
    ReadonlyMap<Signature, CsharpProjectForwardingConstructor>
  >();

  for (const definition of definitions) {
    if (definition.kind !== "class") {
      continue;
    }
    const heritage = heritageById.get(definition.id);
    if (heritage === undefined || heritage.baseType === undefined) {
      byDeclaration.set(definition.declaration, Object.freeze([]));
      bySignature.set(definition.declaration, new Map());
      continue;
    }
    const source = host.navigation.classConstructors(definition.declaration);
    if (source.kind === "unresolved") {
      issues.push({
        node: definition.declaration,
        code: "CSHARP_PROJECT_CONSTRUCTORS_SOURCE_UNRESOLVED",
        message: source.reason,
      });
      continue;
    }
    if (!source.implicit) {
      byDeclaration.set(definition.declaration, Object.freeze([]));
      bySignature.set(definition.declaration, new Map());
      continue;
    }
    const constructors: CsharpProjectForwardingConstructor[] = [];
    const signatures = new Map<Signature, CsharpProjectForwardingConstructor>();
    const constructorsByTargetSignature = new Map<
      string,
      CsharpProjectForwardingConstructor
    >();
    for (const sourceSignature of source.signatures) {
      const resolved = resolveForwardingConstructor(
        host,
        definition,
        heritage.baseType,
        sourceSignature,
      );
      if (resolved.kind === "unresolved") {
        issues.push(resolved.issue);
        continue;
      }
      const key = forwardingConstructorSignatureKey(
        resolved.constructor.targetMember.parameters,
      );
      const existing = constructorsByTargetSignature.get(key);
      if (existing !== undefined) {
        if (
          existing.providerBaseMemberId !==
            resolved.constructor.providerBaseMemberId
        ) {
          issues.push({
            node: sourceSignature.declaration ?? definition.declaration,
            code: "CSHARP_PROJECT_CONSTRUCTOR_TARGET_CONFLICT",
            message:
              "Two inherited source constructors collapse to one C# signature but require different base constructors.",
          });
          continue;
        }
        signatures.set(sourceSignature.signature, existing);
        continue;
      }
      constructors.push(resolved.constructor);
      constructorsByTargetSignature.set(key, resolved.constructor);
      signatures.set(sourceSignature.signature, resolved.constructor);
    }
    byDeclaration.set(definition.declaration, Object.freeze(constructors));
    bySignature.set(definition.declaration, signatures);
  }

  return Object.freeze({
    issues: Object.freeze(issues),
    implicitConstructorsForDeclaration(
      declaration: CsharpProjectTypeDefinition["declaration"],
    ) {
      return byDeclaration.get(declaration);
    },
    implicitConstructorForSignature(
      declaration: CsharpProjectTypeDefinition["declaration"],
      signature: Signature,
    ) {
      return bySignature.get(declaration)?.get(signature);
    },
  });
}

function resolveForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  baseType: TargetTypeRef,
  source: SourceClassConstructorSignature,
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
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
  if (host.navigation.isProjectDeclaration(source.declaration)) {
    return createSourceForwardingConstructor(host, definition, source);
  }
  return constructorIssue(
    definition,
    "CSHARP_PROJECT_CONSTRUCTOR_TARGET_UNRESOLVED",
    "The inherited source constructor has neither project ownership nor an exact provider signature relation.",
    source.declaration,
  );
}

function createProviderForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  baseType: TargetTypeRef,
  source: SourceClassConstructorSignature,
  declaration: Parameters<CsharpProviderRelationResolver["resolveSignature"]>[0],
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
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
      providerBaseMemberId: baseMember.id,
    }),
  };
}

function createSourceForwardingConstructor(
  host: CsharpProjectConstructorPolicyHost,
  definition: CsharpProjectTypeDefinition,
  source: SourceClassConstructorSignature,
):
  | {
      readonly kind: "resolved";
      readonly constructor: CsharpProjectForwardingConstructor;
    }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  const parameters: CsharpTargetParameter[] = [];
  for (const sourceParameter of source.parameters) {
    const name = tryCsharpIdentifier(sourceParameter.parameterName);
    const type = host.types.resolveSelectedType(
      sourceParameter.authoredTypeNode,
      sourceParameter.selectedType,
      definition.sourceFile,
    );
    if (name === undefined || type === undefined) {
      return constructorIssue(
        definition,
        "CSHARP_PROJECT_CONSTRUCTOR_PARAMETER_UNRESOLVED",
        `Inherited source constructor parameter '${sourceParameter.parameterName}' has no exact C# name or type.`,
        sourceParameter.parameterDeclaration,
      );
    }
    parameters.push(Object.freeze({
      name,
      type,
      passingMode: "by-value",
      ...(sourceParameter.acceptsOmission
        ? {
            optional: true,
            csharpOmittableOptionalArgument: true as const,
          }
        : {}),
      ...(sourceParameter.rest ? { paramsArray: true } : {}),
    }));
  }
  const baseIdentity = source.declaration === undefined
    ? "implicit-default"
    : sourceNodeIdentity(host.ast, source.declaration);
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
    definition.typeParameterNames.map((name) => ({
      kind: "type-parameter" as const,
      name,
    })),
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
  source: SourceClassConstructorSignature,
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

function forwardingConstructorSignatureKey(
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
