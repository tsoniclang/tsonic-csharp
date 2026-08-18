import { dotnetTypeRefFieldsByKind, requireNonEmptyString, requireSupportedDiscriminant, supportedDotnetTypeRefKinds } from "./support.js";
import { validateDotnetParameters, validateDotnetTypeParameters } from "./dotnet-signatures.js";
import { validateDotnetRawProviderRef } from "./provider-declarations.js";
import { validateDotnetTargetIdentity, validateOptionalDotnetRenderShape } from "./dotnet-identities.js";
import type { ContractCollector } from "./support.js";
import type { DotnetTypeRef } from "../index.js";

export function validateOptionalDotnetTypeRef(
  type: DotnetTypeRef | undefined,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  if (type !== undefined) {
    validateDotnetTypeRef(type, path, collector, options);
  }
}
export function validateOptionalNoUnsupportedClrSourceTypeRef(
  type: DotnetTypeRef | undefined,
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  if (type !== undefined) {
    validateNoUnsupportedClrSourceTypeRef(type, path, collector, context);
  }
}
export function validateNoUnsupportedClrSourceTypeRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  switch (type.kind) {
    case "pointer":
      collector.add(path, `${context} uses an unsupported CLR pointer type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      validateNoUnsupportedClrSourceTypeRef(type.pointee, `${path}.pointee`, collector, context);
      return;
    case "function-pointer":
      collector.add(path, `${context} uses an unsupported CLR function-pointer type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.args, `${path}.args`, collector, context);
      validateNoUnsupportedClrSourceTypeRef(type.result, `${path}.result`, collector, context);
      return;
    case "array":
      if (type.rank !== undefined && type.rank !== 1) {
        collector.add(path, `${context} uses an unsupported ranked CLR array type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      }
      validateNoUnsupportedClrSourceTypeRef(type.elementType, `${path}.elementType`, collector, context);
      return;
    case "nullable":
    case "nullable-reference":
      validateNoUnsupportedClrSourceTypeRef(type.elementType, `${path}.elementType`, collector, context);
      return;
    case "tuple":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.elements, `${path}.elements`, collector, context);
      return;
    case "union":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.types, `${path}.types`, collector, context);
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        validateNoUnsupportedClrSourceTypeRef(
          parameter.sourceType ?? parameter.type,
          `${path}.parameters[${index}].${parameter.sourceType === undefined ? "type" : "sourceType"}`,
          collector,
          context,
        );
      }
      validateNoUnsupportedClrSourceTypeRef(type.returnType, `${path}.returnType`, collector, context);
      return;
    case "named":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.typeArguments ?? [], `${path}.typeArguments`, collector, context);
      validateOptionalNoUnsupportedClrSourceTypeRef(type.sourceShape, `${path}.sourceShape`, collector, context);
      return;
    case "provider-ref":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.typeArguments ?? [], `${path}.typeArguments`, collector, context);
      return;
    case "opaque":
      validateOptionalNoUnsupportedClrSourceTypeRef(type.sourceShape, `${path}.sourceShape`, collector, context);
      return;
    case "void":
    case "any":
    case "unknown":
    case "object":
    case "string":
    case "literal":
    case "undefined":
    case "boolean":
    case "number":
    case "bigint":
    case "source-primitive":
    case "type-parameter":
      return;
  }
}

function validateDotnetTypeRefsForUnsupportedClrSourceShapes(
  types: readonly DotnetTypeRef[],
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  for (const [index, type] of types.entries()) {
    validateNoUnsupportedClrSourceTypeRef(type, `${path}[${index}]`, collector, context);
  }
}

export function validateDotnetTypeRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  if (!requireSupportedDiscriminant(
    (type as unknown as Readonly<Record<string, unknown>>).kind,
    `${path}.kind`,
    collector,
    ".NET type ref kind",
    supportedDotnetTypeRefKinds,
  )) {
    return;
  }
  validateDotnetTypeRefFields(type, path, collector);
  switch (type.kind) {
    case "literal":
    case "undefined":
      if (!options.allowLiteral) {
        collector.add(path, `${type.kind === "literal" ? "Literal" : "Undefined"} type refs are source declaration shapes only and are not valid target metadata refs.`, type);
      }
      return;
    case "provider-ref":
      if (!options.allowProviderRef) {
        collector.add(path, "Provider-ref type refs are source declaration shapes only and are not valid target metadata refs.", type);
      }
      validateDotnetRawProviderRef(type, path, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      return;
    case "named":
      validateDotnetTargetIdentity(type.targetId, type.metadataName, `${path}.targetId`, `${path}.metadataName`, collector);
      validateOptionalDotnetRenderShape(type.renderShape, `${path}.renderShape`, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      if (
        type.implicitArrayInput !== undefined &&
        type.implicitArrayInput !== true
      ) {
        collector.add(
          `${path}.implicitArrayInput`,
          "Implicit native-array input evidence must be the literal true when present.",
          type.implicitArrayInput,
        );
      }
      if (
        type.implicitArrayInput === true &&
        type.sourceShape?.kind !== "array"
      ) {
        collector.add(
          `${path}.implicitArrayInput`,
          "Implicit native-array input evidence requires an exact source array shape.",
          type.sourceShape,
        );
      }
      return;
    case "array":
      if (type.rank !== undefined && (!Number.isInteger(type.rank) || type.rank < 1)) {
        collector.add(`${path}.rank`, "Array rank must be a positive integer.", type.rank);
      }
      validateDotnetTypeRef(type.elementType, `${path}.elementType`, collector, options);
      return;
    case "nullable":
    case "nullable-reference":
      validateDotnetTypeRef(type.elementType, `${path}.elementType`, collector, options);
      return;
    case "tuple":
      validateDotnetTypeRefs(type.elements, `${path}.elements`, collector, options);
      return;
    case "union":
      if (options.targetPosition === true) {
        collector.add(path, "Union type refs are source declaration shapes only and require an explicit closed target type fact before target emission.", type);
      }
      if (type.types.length === 0) {
        collector.add(`${path}.types`, "Union type refs must contain at least one type.");
      }
      validateDotnetTypeRefs(type.types, `${path}.types`, collector, options);
      return;
    case "function":
      requireNonEmptyString(type.id, `${path}.id`, collector);
      validateDotnetTypeParameters(type.typeParameters ?? [], `${path}.typeParameters`, collector);
      validateDotnetParameters(type.parameters, `${path}.parameters`, collector);
      validateDotnetTypeRef(type.returnType, `${path}.returnType`, collector, options);
      return;
    case "pointer":
      validateDotnetTypeRef(type.pointee, `${path}.pointee`, collector, options);
      return;
    case "function-pointer":
      validateDotnetTypeRefs(type.args, `${path}.args`, collector, options);
      validateDotnetTypeRef(type.result, `${path}.result`, collector, options);
      return;
    case "opaque":
      requireNonEmptyString(type.id, `${path}.id`, collector);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      return;
    case "void":
    case "any":
    case "unknown":
    case "undefined":
    case "object":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
      return;
    case "source-primitive":
    case "type-parameter":
      requireNonEmptyString(type.name, `${path}.name`, collector);
      return;
  }
}

function validateDotnetTypeRefFields(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
): void {
  const record = type as unknown as Readonly<Record<string, unknown>>;
  const allowed = dotnetTypeRefFieldsByKind.get(String(record.kind));
  if (allowed === undefined) {
    return;
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      collector.add(`${path}.${key}`, "Field is not valid for this .NET type-ref variant.", record[key]);
    }
  }
}

function validateDotnetTypeRefs(
  types: readonly DotnetTypeRef[],
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  for (const [index, type] of types.entries()) {
    validateDotnetTypeRef(type, `${path}[${index}]`, collector, options);
  }
}
