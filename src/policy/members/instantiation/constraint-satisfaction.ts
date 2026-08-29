import type {
  AstReader,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
} from "@tsonic/target-api/source";
import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  CsharpTargetTypeParameter,
  TargetConstraint,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpTargetBindingFact,
} from "../../../target-model/types/model.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpNullableReferenceTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import type {
  CsharpTypeParameterConstraint,
} from "../../../target-model/declarations/generic-constraints.js";
import {
  resolveCsharpTypeParameterConstraints,
} from "../../constraints/index.js";
import type {
  CsharpSelectedTargetMethodTypeArgument,
} from "../selection/selection-types.js";
import {
  namedTargetTypeImplicitlyAccepts,
} from "../../conversions/selection/carriers.js";
import type {
  CsharpProjectTypePolicy,
  CsharpTypePolicy,
} from "../../types/index.js";
import {
  readCsharpSourceStruct,
  substituteTargetConstraint,
} from "../../types/index.js";

export interface CsharpConstraintSatisfactionHost {
  readonly ast: AstReader;
  readonly providers: CsharpProviderRelationResolver;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly sourceFacts?: import("@tsonic/tsts").ReadonlySourceFactResolver;
  readonly types: CsharpTypePolicy;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}

export interface CsharpProviderConstraintSelection {
  readonly targetBinding: CsharpTargetBindingFact;
  readonly bindingArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly targetMember: CsharpTargetMember;
  readonly methodArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly invocationArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly sourceFile: SourceFile;
}

export function validateCsharpProviderConstraints(
  host: CsharpConstraintSatisfactionHost,
  selection: CsharpProviderConstraintSelection,
): string | undefined {
  const bindingError = validateTypeParameterArguments(
    host,
    selection.targetBinding.typeParameters ?? [],
    selection.bindingArguments,
    `target binding '${selection.targetBinding.id}'`,
    selection.sourceFile,
  );
  if (bindingError !== undefined) {
    return bindingError;
  }
  const methodError = validateTypeParameterArguments(
    host,
    selection.targetMember.typeParameters ?? [],
    selection.methodArguments,
    `target member '${selection.targetMember.id}'`,
    selection.sourceFile,
  );
  if (methodError !== undefined) {
    return methodError;
  }
  for (const argument of [
    ...selection.bindingArguments,
    ...selection.methodArguments,
    ...selection.invocationArguments,
  ]) {
    const argumentError = validateConstructedTargetType(
      host,
      argument.targetType,
      selection.sourceFile,
      new Set(),
    );
    if (argumentError !== undefined) {
      return argumentError;
    }
  }
  const invocation = selection.targetMember.csharpInvocation;
  if (
    invocation?.kind === "static-member" &&
    invocation.receiver.kind === "invocation-type-argument"
  ) {
    const dispatchArgument = selection.invocationArguments[
      invocation.receiver.index
    ];
    const declaringType = selection.targetMember.declaringType;
    if (
      dispatchArgument === undefined ||
      declaringType?.kind !== "target-named"
    ) {
      return `Static target member '${selection.targetMember.id}' has no exact dispatch type or declaring interface.`;
    }
    const dispatchError = targetTypeFailsConstraint(
      host,
      dispatchArgument,
      {
        kind: "implements",
        contract: declaringType.id,
        ...(declaringType.typeArguments === undefined
          ? {}
          : { typeArguments: declaringType.typeArguments }),
      },
      selection.sourceFile,
    );
    if (dispatchError !== undefined) {
      return `Static target member '${selection.targetMember.id}' requires dispatch type '${targetTypeRefKey(dispatchArgument.targetType)}' to implement '${targetTypeRefKey(declaringType)}'. ${dispatchError}`;
    }
  }
  return undefined;
}

function validateTypeParameterArguments(
  host: CsharpConstraintSatisfactionHost,
  parameters: readonly CsharpTargetTypeParameter[],
  arguments_: readonly CsharpSelectedTargetMethodTypeArgument[],
  owner: string,
  sourceFile: SourceFile,
): string | undefined {
  if (parameters.length !== arguments_.length) {
    return `C# ${owner} requires ${parameters.length} target type arguments, but ${arguments_.length} were selected.`;
  }
  const substitutions = new Map(
    parameters.map((parameter, index) => [
      parameter.name,
      arguments_[index]!.targetType,
    ]),
  );
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index]!;
    const argument = arguments_[index]!;
    for (const constraint of parameter.constraints ?? []) {
      const substituted = substituteTargetConstraint(
        constraint,
        substitutions,
      );
      const reason = targetTypeFailsConstraint(
        host,
        argument,
        substituted,
        sourceFile,
      );
      if (reason !== undefined) {
        return `C# ${owner} type argument '${targetTypeRefKey(argument.targetType)}' for '${parameter.name}' does not satisfy '${constraintDescription(substituted)}'. ${reason}`;
      }
    }
  }
  return undefined;
}

function targetTypeFailsConstraint(
  host: CsharpConstraintSatisfactionHost,
  argument: CsharpSelectedTargetMethodTypeArgument,
  constraint: TargetConstraint,
  sourceFile: SourceFile,
): string | undefined {
  const target = argument.targetType;
  if (
    target.kind === "type-parameter" &&
    argument.kind === "selected-source"
  ) {
    const sourceConstraint = selectedSourceConstraintSatisfies(
      host,
      argument.selectedType,
      constraint,
      sourceFile,
    );
    if (sourceConstraint !== undefined) {
      return sourceConstraint ? undefined :
        "The exact selected source type parameter does not declare a sufficient C# constraint.";
    }
  }
  switch (constraint.kind) {
    case "implements": {
      const contract: TargetTypeRef = {
        kind: "target-named",
        id: constraint.contract,
        ...(constraint.typeArguments === undefined
          ? {}
          : { typeArguments: constraint.typeArguments }),
      };
      return namedTargetTypeImplicitlyAccepts(
          host,
          target,
          contract,
          new Set(),
        )
        ? undefined
        : "The exact target heritage graph does not contain the required contract.";
    }
    case "value-type":
      return isCsharpNonNullableValueType(target)
        ? undefined
        : "The argument is not a proven non-nullable C# value type.";
    case "reference-type":
      return isCsharpReferenceType(host, target)
        ? undefined
        : "The argument is not a proven C# reference type.";
    case "constructible":
      return isCsharpPubliclyParameterlessConstructible(host, target)
        ? undefined
        : "The argument is not a proven non-abstract type with a public parameterless constructor.";
    case "unmanaged":
      return isCsharpUnmanagedType(host, target, new Set())
        ? undefined
        : "The argument is not a proven non-nullable unmanaged C# type.";
    case "target-specific":
      if (
        constraint.target === "csharp" &&
        constraint.name === "notnull"
      ) {
        return isCsharpNotNullType(host, target)
          ? undefined
          : "The argument is nullable or has no exact C# nullability category.";
      }
      return `The target constraint '${constraint.target}:${constraint.name}' has no C# satisfaction rule.`;
    case "copy":
    case "clone":
    case "default":
    case "sized":
    case "lifetime":
      return `The '${constraint.kind}' constraint is not a C# target constraint.`;
  }
}

function validateConstructedTargetType(
  host: CsharpConstraintSatisfactionHost,
  type: TargetTypeRef,
  sourceFile: SourceFile,
  active: Set<string>,
): string | undefined {
  switch (type.kind) {
    case "source-primitive":
      return undefined;
    case "array":
      return validateConstructedTargetType(
        host,
        type.element,
        sourceFile,
        active,
      );
    case "tuple":
      for (const element of type.elements) {
        const error = validateConstructedTargetType(
          host,
          element,
          sourceFile,
          active,
        );
        if (error !== undefined) return error;
      }
      return undefined;
    case "target-named": {
      const binding = csharpTargetBindingFact(
        host.providers.findTargetBindingByTargetId(type.id),
      );
      if (binding === undefined) {
        for (const argument of type.typeArguments ?? []) {
          const error = validateConstructedTargetType(
            host,
            argument,
            sourceFile,
            active,
          );
          if (error !== undefined) return error;
        }
        return undefined;
      }
      const key = targetTypeRefKey(type);
      if (active.has(key)) {
        return `Constructed target type '${key}' has a recursive generic-constraint dependency.`;
      }
      active.add(key);
      try {
        const arguments_ = type.typeArguments ?? [];
        const constraintError = validateTypeParameterArguments(
          host,
          binding.typeParameters ?? [],
          arguments_.map((targetType) => ({
            kind: "target-derived" as const,
            targetType,
          })),
          `constructed target type '${binding.id}'`,
          sourceFile,
        );
        if (constraintError !== undefined) return constraintError;
        for (const argument of arguments_) {
          const error = validateConstructedTargetType(
            host,
            argument,
            sourceFile,
            active,
          );
          if (error !== undefined) return error;
        }
        return undefined;
      } finally {
        active.delete(key);
      }
    }
    case "type-parameter":
      return undefined;
    case "pointer":
    case "function-pointer":
      return `C# target type '${targetTypeRefKey(type)}' cannot be used as a generic type argument.`;
    case "source-global":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return `Target type '${targetTypeRefKey(type)}' is not a proven legal C# generic type argument.`;
  }
}

function selectedSourceConstraintSatisfies(
  host: CsharpConstraintSatisfactionHost,
  selectedType: Type,
  targetConstraint: TargetConstraint,
  sourceFile: SourceFile,
): boolean | undefined {
  const semantics = host.semantics(sourceFile);
  const symbol = semantics.declarations.typeSymbol(selectedType);
  if (symbol === undefined) return undefined;
  const declarations = semantics.declarations.symbolDeclarations(symbol)
    .filter((declaration) =>
      host.ast.is.IsTypeParameterDeclaration(declaration));
  if (declarations.length !== 1) return undefined;
  const declaration = declarations[0]!;
  const name = host.ast.name(declaration);
  if (name === undefined) return false;
  const resolution = resolveCsharpTypeParameterConstraints(
    declaration,
    host.ast.text(name),
    sourceFile,
    host,
  );
  return resolution.kind === "resolved" &&
    sourceConstraintsImplyTargetConstraint(
      host,
      resolution.constraints,
      targetConstraint,
    );
}

function sourceConstraintsImplyTargetConstraint(
  host: CsharpConstraintSatisfactionHost,
  sourceConstraints: readonly CsharpTypeParameterConstraint[],
  targetConstraint: TargetConstraint,
): boolean {
  switch (targetConstraint.kind) {
    case "implements": {
      const targetType: TargetTypeRef = {
        kind: "target-named",
        id: targetConstraint.contract,
        ...(targetConstraint.typeArguments === undefined
          ? {}
          : { typeArguments: targetConstraint.typeArguments }),
      };
      return sourceConstraints.some((constraint) =>
        constraint.kind === "type" &&
        namedTargetTypeImplicitlyAccepts(
          host,
          constraint.type,
          targetType,
          new Set(),
        ));
    }
    case "reference-type":
      return hasSourceKeyword(sourceConstraints, "class");
    case "value-type":
      return hasSourceKeyword(sourceConstraints, "struct") ||
        hasSourceKeyword(sourceConstraints, "unmanaged");
    case "constructible":
      return sourceConstraints.some((constraint) =>
          constraint.kind === "constructor") ||
        hasSourceKeyword(sourceConstraints, "struct") ||
        hasSourceKeyword(sourceConstraints, "unmanaged");
    case "unmanaged":
      return hasSourceKeyword(sourceConstraints, "unmanaged");
    case "target-specific":
      return targetConstraint.target === "csharp" &&
        targetConstraint.name === "notnull" &&
        (
          hasSourceKeyword(sourceConstraints, "notnull") ||
          hasSourceKeyword(sourceConstraints, "struct") ||
          hasSourceKeyword(sourceConstraints, "unmanaged")
        );
    case "copy":
    case "clone":
    case "default":
    case "sized":
    case "lifetime":
      return false;
  }
}

function hasSourceKeyword(
  constraints: readonly CsharpTypeParameterConstraint[],
  keyword: Extract<CsharpTypeParameterConstraint, { readonly kind: "keyword" }>["keyword"],
): boolean {
  return constraints.some((constraint) =>
    constraint.kind === "keyword" && constraint.keyword === keyword);
}

function isCsharpNonNullableValueType(type: TargetTypeRef): boolean {
  return getCsharpNullableElementTargetType(type) === undefined &&
    isCsharpValueTypeTargetType(type);
}

function isCsharpReferenceType(
  host: CsharpConstraintSatisfactionHost,
  type: TargetTypeRef,
): boolean {
  if (type.kind === "array") return true;
  if (type.kind !== "target-named") return false;
  const project = host.projectTypes.catalog.definitionForTarget(type);
  if (project !== undefined) {
    return project.kind === "class" || project.kind === "interface";
  }
  return !isCsharpValueTypeTargetType(type);
}

function isCsharpPubliclyParameterlessConstructible(
  host: CsharpConstraintSatisfactionHost,
  type: TargetTypeRef,
): boolean {
  if (isCsharpNonNullableValueType(type)) return true;
  if (type.kind !== "target-named") return false;
  const project = host.projectTypes.catalog.definitionForTarget(type);
  if (project !== undefined) {
    return project.kind === "class" &&
      !project.abstract &&
      project.publicParameterlessConstructor;
  }
  const binding = csharpTargetBindingFact(
    host.providers.findTargetBindingByTargetId(type.id),
  );
  return binding?.kind === "class" &&
    binding.csharpAbstract !== true &&
    (binding.members ?? []).some((member) =>
      member.kind === "constructor" &&
      member.static !== true &&
      member.parameters.length === 0);
}

function isCsharpNotNullType(
  host: CsharpConstraintSatisfactionHost,
  type: TargetTypeRef,
): boolean {
  if (getCsharpNullableElementTargetType(type) !== undefined) return false;
  if (isCsharpNullableReferenceTargetType(type)) return false;
  return isCsharpValueTypeTargetType(type) || isCsharpReferenceType(host, type);
}

function isCsharpUnmanagedType(
  host: CsharpConstraintSatisfactionHost,
  type: TargetTypeRef,
  active: Set<string>,
): boolean {
  if (getCsharpNullableElementTargetType(type) !== undefined) return false;
  switch (type.kind) {
    case "source-primitive":
    case "pointer":
    case "function-pointer":
      return true;
    case "tuple":
      return type.elements.every((element) =>
        isCsharpUnmanagedType(host, element, active));
    case "target-named": {
      const project = host.projectTypes.catalog.definitionForTarget(type);
      if (project?.kind === "enum") return true;
      if (project?.kind === "struct") {
        const fact = readCsharpSourceStruct(
          host.sourceFacts,
          project.declaration,
        );
        if (fact === undefined) return false;
        const key = targetTypeRefKey(type);
        if (active.has(key)) return false;
        active.add(key);
        try {
          return fact.fields.every((field) => {
            const fieldType = host.types.resolveNode(
              field.sourceType,
              project.sourceFile,
            );
            return fieldType !== undefined &&
              isCsharpUnmanagedType(host, fieldType, active);
          });
        } finally {
          active.delete(key);
        }
      }
      const binding = csharpTargetBindingFact(
        host.providers.findTargetBindingByTargetId(type.id),
      );
      const required = binding?.csharpUnmanagedTypeParameterIndexes;
      const arguments_ = type.typeArguments ?? [];
      return required !== undefined &&
        (binding?.typeParameters?.length ?? 0) === arguments_.length &&
        required.every((index) => {
          const argument = arguments_[index];
          return argument !== undefined &&
            isCsharpUnmanagedType(host, argument, active);
        });
    }
    case "array":
    case "type-parameter":
    case "source-global":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

function constraintDescription(constraint: TargetConstraint): string {
  return constraint.kind === "implements"
    ? targetTypeRefKey({
        kind: "target-named",
        id: constraint.contract,
        ...(constraint.typeArguments === undefined
          ? {}
          : { typeArguments: constraint.typeArguments }),
      })
    : constraint.kind === "target-specific"
      ? `${constraint.target}:${constraint.name}`
      : constraint.kind;
}
