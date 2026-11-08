import { dotnetTypeRefFieldsByKind, requireNonEmptyString, requireSupportedDiscriminant, supportedDotnetTypeRefKinds, supportedReturnPassingModes, dotnetSignatureFields, requireUnique, supportedDotnetConstraintKinds, supportedDotnetMemberKinds, supportedPassingModes, supportedTypeParameterVariance } from "./support.js";
import { validateDotnetRawProviderRef } from "./provider-declarations.js";
import { validateDotnetTargetIdentity, validateOptionalDotnetRenderShape, validateDotnetAssemblyReference, validateOptionalDotnetAssemblyReference, validateOptionalDotnetParameterDefaultValue, validateOptionalDotnetUnsupportedDefaultValue } from "./dotnet-identities.js";
import type { ContractCollector } from "./support.js";
import type { DotnetTypeRef, DotnetConstraint, DotnetParameterDeclaration, DotnetSignatureDeclaration, DotnetTypeParameterDeclaration, DotnetUnsupportedConstraintDeclaration, DotnetUnsupportedExportDeclaration, DotnetUnsupportedMemberDeclaration } from "../index.js";
import { dotnetCallableRepresentationIssue } from "../callable-representations.js";

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
      if (typeof type.isByRefLike !== "boolean") {
        collector.add(`${path}.isByRefLike`, "A named CLR type requires its exact native by-ref-like boolean.", type.isByRefLike);
      }
      if (typeof type.constraintRequiresReferenceType !== "boolean" ||
        type.constraintRequiresReferenceType && type.isByRefLike) {
        collector.add(`${path}.constraintRequiresReferenceType`, "A named CLR type requires its exact native reference-only bound guarantee; a ref-like value cannot establish it.", type.constraintRequiresReferenceType);
      }
      if (!Array.isArray(type.allowsRefLikeTypeArguments) ||
        type.allowsRefLikeTypeArguments.length !== (type.typeArguments?.length ?? 0) ||
        type.allowsRefLikeTypeArguments.some(allowed => typeof allowed !== "boolean")) {
        collector.add(`${path}.allowsRefLikeTypeArguments`, "A named CLR type requires the exact native allows-ref-struct flag for each generic parameter.", type.allowsRefLikeTypeArguments);
      }
      validateOptionalDotnetRenderShape(type.renderShape, `${path}.renderShape`, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      const callableIssue = dotnetCallableRepresentationIssue(type);
      if (callableIssue !== undefined) collector.add(`${path}.callableRepresentation`, callableIssue);
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
      validateDotnetTypeRef(type.returnType, `${path}.returnType`, collector, {
        ...options,
        allowProviderRef: type.targetReturnType !== undefined,
        targetPosition: type.targetReturnType === undefined && options.targetPosition,
      });
      validateOptionalDotnetTypeRef(type.targetReturnType, `${path}.targetReturnType`, collector, {
        allowLiteral: false,
        allowProviderRef: false,
        targetPosition: true,
      });
      if (type.returnPassing !== undefined) {
        if (!supportedReturnPassingModes.has(type.returnPassing)) {
          collector.add(
            `${path}.returnPassing`,
            "Function returnPassing is not a supported .NET delegate return ABI.",
            type.returnPassing,
          );
        }
        if (type.targetReturnType === undefined) {
          collector.add(
            `${path}.targetReturnType`,
            "A by-reference delegate source location requires an explicit target pointee return type.",
          );
        }
        if (
          type.returnType.kind !== "provider-ref" ||
          type.returnType.moduleSpecifier !== "@tsonic/core/types.js" ||
          type.returnType.exportName !== "Pointer" ||
          type.returnType.typeArguments?.length !== 1
        ) {
          collector.add(
            `${path}.returnType`,
            "A .NET by-reference delegate must expose the exact shared Pointer<T> source location contract.",
            type.returnType,
          );
        }
      } else if (type.targetReturnType !== undefined) {
        collector.add(
          `${path}.returnPassing`,
          "A distinct delegate target return type requires an explicit return ABI.",
        );
      }
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
      requireNonEmptyString(type.name, `${path}.name`, collector);
      return;
    case "type-parameter":
      requireNonEmptyString(type.identity, `${path}.identity`, collector);
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

export function validateDotnetSignatureList(
  signatures: readonly DotnetSignatureDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly requireReturnType: boolean },
): void {
  const signatureIds = new Set<string>();
  for (const [index, signature] of signatures.entries()) {
    const signaturePath = `${path}[${index}]`;
    validateDotnetSignatureFields(signature, signaturePath, collector);
    requireNonEmptyString(signature.id, `${signaturePath}.id`, collector);
    requireUnique(signatureIds, signature.id, `${signaturePath}.id`, collector);
    requireNonEmptyString(signature.sourceId, `${signaturePath}.sourceId`, collector);
    validateDotnetTypeParameters(signature.typeParameters ?? [], `${signaturePath}.typeParameters`, collector);
    validateDotnetTypeParameters(signature.sourceTypeParameters ?? [], `${signaturePath}.sourceTypeParameters`, collector);
    validateSourceTypeParameterRoles(signature, signaturePath, collector);
    validateDotnetParameters(signature.parameters, `${signaturePath}.parameters`, collector);
    if (signature.returnType === undefined) {
      if (options.requireReturnType) {
        collector.add(`${signaturePath}.returnType`, "Non-constructor signatures must carry an explicit returnType.");
      }
    } else {
      validateDotnetTypeRef(signature.returnType, `${signaturePath}.returnType`, collector, {
        allowLiteral: false,
        allowProviderRef: signature.targetReturnType !== undefined,
        targetPosition: signature.targetReturnType === undefined,
      });
    }
    validateOptionalDotnetTypeRef(signature.targetReturnType, `${signaturePath}.targetReturnType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    if (signature.returnPassing !== undefined) {
      if (!supportedReturnPassingModes.has(signature.returnPassing)) {
        collector.add(
          `${signaturePath}.returnPassing`,
          "Signature returnPassing is not a supported .NET return ABI.",
          signature.returnPassing,
        );
      }
      if (signature.targetReturnType === undefined) {
        collector.add(
          `${signaturePath}.targetReturnType`,
          "A by-reference source location requires an explicit target pointee return type.",
        );
      }
      if (
        signature.returnType?.kind !== "provider-ref" ||
        signature.returnType.moduleSpecifier !== "@tsonic/core/types.js" ||
        signature.returnType.exportName !== "Pointer" ||
        signature.returnType.typeArguments?.length !== 1
      ) {
        collector.add(
          `${signaturePath}.returnType`,
          "A .NET by-reference return must expose the exact shared Pointer<T> source location contract.",
          signature.returnType,
        );
      }
    } else if (signature.targetReturnType !== undefined && signature.returnType?.kind === "provider-ref" && signature.returnType.moduleSpecifier === "@tsonic/core/types.js" && signature.returnType.exportName === "Pointer") {
      collector.add(
        `${signaturePath}.returnPassing`,
        "A shared Pointer<T> source result cannot target a CLR value return without an explicit by-reference return ABI.",
      );
    }
    validateDotnetTargetInvocation(
      signature.targetInvocation,
      signature,
      signaturePath,
      collector,
    );
  }
}
function validateDotnetSignatureFields(
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  const record = signature as unknown as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(record)) {
    if (!dotnetSignatureFields.has(key)) {
      collector.add(
        `${path}.${key}`,
        "Field is not valid for a .NET signature declaration.",
        record[key],
      );
    }
  }
}
function validateDotnetTargetInvocation(
  invocation: DotnetSignatureDeclaration["targetInvocation"],
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  if (invocation === undefined) {
    return;
  }
  const supportedFields = invocation.kind === "array-creation"
    ? new Set(["kind", "lengthParameterIndex"])
    : invocation.kind === "static-factory-construction"
      ? new Set(["kind", "factoryType"])
      : invocation.kind === "native-indexer-get"
        ? new Set(["kind", "indexParameterIndexes"])
        : invocation.kind === "native-indexer-set"
          ? new Set(["kind", "indexParameterIndexes", "valueParameterIndex"])
          : invocation.kind === "native-event-add" || invocation.kind === "native-event-remove"
            ? new Set(["kind", "handlerParameterIndex"])
            : invocation.kind === "native-operator"
              ? new Set(["kind", "form", "operator", "operandParameterIndexes", "checked"])
              : new Set(["kind", "operation", "receiver", "valueParameterIndex"]);
  for (const key of Object.keys(invocation)) {
    if (!supportedFields.has(key)) {
      collector.add(
        `${path}.targetInvocation.${key}`,
        `Field is not valid for '${invocation.kind}' .NET target invocation.`,
        (invocation as unknown as Readonly<Record<string, unknown>>)[key],
      );
    }
  }
  switch (invocation.kind) {
    case "array-creation": {
      if (
        !Number.isSafeInteger(invocation.lengthParameterIndex) ||
        invocation.lengthParameterIndex < 0 ||
        invocation.lengthParameterIndex >= signature.parameters.length
      ) {
        collector.add(
          `${path}.targetInvocation.lengthParameterIndex`,
          "Array-creation invocation lengthParameterIndex must identify an existing signature parameter.",
          invocation.lengthParameterIndex,
        );
      }
      const targetReturnType = signature.targetReturnType ?? signature.returnType;
      if (targetReturnType?.kind !== "array") {
        collector.add(
          `${path}.targetInvocation`,
          "Array-creation invocation must carry an array target return type.",
          invocation,
        );
      }
      return;
    }
    case "static-factory-construction":
      validateDotnetTypeRef(
        invocation.factoryType,
        `${path}.targetInvocation.factoryType`,
        collector,
        {
          allowLiteral: false,
          allowProviderRef: false,
          targetPosition: true,
        },
      );
      return;
    case "native-indexer-get":
      validateNativeIndexerInvocation(
        invocation.indexParameterIndexes,
        undefined,
        signature,
        path,
        collector,
      );
      return;
    case "native-indexer-set":
      validateNativeIndexerInvocation(
        invocation.indexParameterIndexes,
        invocation.valueParameterIndex,
        signature,
        path,
        collector,
      );
      return;
    case "native-event-add":
    case "native-event-remove":
      if (
        !Number.isSafeInteger(invocation.handlerParameterIndex) ||
        invocation.handlerParameterIndex < 0 ||
        invocation.handlerParameterIndex >= signature.parameters.length ||
        signature.parameters.length !== 1
      ) {
        collector.add(
          `${path}.targetInvocation.handlerParameterIndex`,
          "Native event subscription must identify the only exact handler parameter.",
          invocation.handlerParameterIndex,
        );
      }
      if (signature.returnType?.kind !== "void") {
        collector.add(
          `${path}.returnType`,
          "Native event subscription source operations must return void.",
          signature.returnType,
        );
      }
      return;
    case "native-operator": {
      const supportedOperators = new Set([
        "unary-plus",
        "unary-negation",
        "logical-not",
        "ones-complement",
        "addition",
        "subtraction",
        "multiplication",
        "division",
        "modulus",
        "bitwise-and",
        "bitwise-or",
        "exclusive-or",
        "left-shift",
        "right-shift",
        "unsigned-right-shift",
        "equality",
        "inequality",
        "less-than",
        "less-than-or-equal",
        "greater-than",
        "greater-than-or-equal",
      ]);
      const expectedArity = invocation.form === "prefix"
        ? 1
        : invocation.form === "binary"
          ? 2
          : 0;
      const indexes = new Set(invocation.operandParameterIndexes);
      if (
        expectedArity === 0 ||
        !supportedOperators.has(invocation.operator) ||
        invocation.operandParameterIndexes.length !== expectedArity ||
        indexes.size !== expectedArity ||
        invocation.operandParameterIndexes.some((index) =>
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= signature.parameters.length
        ) ||
        signature.parameters.length !== expectedArity ||
        signature.parameters.some((parameter) => parameter.passingMode !== "by-value") ||
        invocation.checked !== undefined && invocation.checked !== true
      ) {
        collector.add(
          `${path}.targetInvocation`,
          "Native operator invocation must identify one supported unary or binary C# operator over every by-value parameter exactly once.",
          invocation,
        );
      }
      return;
    }
    case "static-member": {
      const valueOperations = new Set(["property-set", "event-add", "event-remove"]);
      const operationValid = invocation.operation === "call" ||
        invocation.operation === "property-get" ||
        valueOperations.has(invocation.operation);
      const receiverValid = invocation.receiver.kind === "declaring-type" ||
        invocation.receiver.kind === "invocation-type-argument" &&
          invocation.receiver.index === 0;
      const receiverFields = Object.keys(invocation.receiver);
      const receiverShapeValid = invocation.receiver.kind === "declaring-type"
        ? receiverFields.length === 1 && receiverFields[0] === "kind"
        : receiverFields.length === 2 &&
          receiverFields.includes("kind") &&
          receiverFields.includes("index");
      const invocationTypeParameterCount =
        signature.sourceTypeParameterRoles?.invocation.length ?? 0;
      const expectedValueIndex = valueOperations.has(invocation.operation)
        ? signature.parameters.length - 1
        : undefined;
      if (
        !operationValid ||
        !receiverValid ||
        !receiverShapeValid ||
        invocationTypeParameterCount !==
          (invocation.receiver.kind === "invocation-type-argument" ? 1 : 0) ||
        invocation.valueParameterIndex !== expectedValueIndex ||
        (invocation.operation === "property-get" && signature.parameters.length !== 0) ||
        (valueOperations.has(invocation.operation) && signature.parameters.length !== 1)
      ) {
        collector.add(
          `${path}.targetInvocation`,
          "Static-member invocation must identify one exact declaring or dispatch receiver type and the exact call/property/event operand contract.",
          invocation,
        );
      }
      return;
    }
  }
}

function validateSourceTypeParameterRoles(
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  const sourceParameters = signature.sourceTypeParameters ?? signature.typeParameters ?? [];
  const roles = signature.sourceTypeParameterRoles;
  if (roles === undefined) {
    if (signature.sourceTypeParameters !== undefined) {
      collector.add(
        `${path}.sourceTypeParameterRoles`,
        "A distinct source type-parameter list requires exact binding, method, and invocation roles.",
      );
    }
    return;
  }
  const indexes = [...roles.binding, ...roles.method, ...roles.invocation];
  if (
    new Set(indexes).size !== indexes.length ||
    indexes.length !== sourceParameters.length ||
    indexes.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= sourceParameters.length
    )
  ) {
    collector.add(
      `${path}.sourceTypeParameterRoles`,
      "Source type-parameter roles must partition the exact source type-parameter list.",
      roles,
    );
  }
}

function validateNativeIndexerInvocation(
  indexParameterIndexes: readonly number[],
  valueParameterIndex: number | undefined,
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  const indexes = new Set<number>();
  for (const [position, index] of indexParameterIndexes.entries()) {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= signature.parameters.length ||
      indexes.has(index)
    ) {
      collector.add(
        `${path}.targetInvocation.indexParameterIndexes[${position}]`,
        "Native-indexer invocation indexes must uniquely identify existing signature parameters.",
        index,
      );
    }
    indexes.add(index);
  }
  if (indexParameterIndexes.length === 0) {
    collector.add(
      `${path}.targetInvocation.indexParameterIndexes`,
      "Native-indexer invocation requires at least one exact index parameter.",
    );
  }
  if (
    valueParameterIndex !== undefined &&
    (
      !Number.isSafeInteger(valueParameterIndex) ||
      valueParameterIndex < 0 ||
      valueParameterIndex >= signature.parameters.length ||
      indexes.has(valueParameterIndex)
    )
  ) {
    collector.add(
      `${path}.targetInvocation.valueParameterIndex`,
      "Native-indexer setter valueParameterIndex must identify one non-index signature parameter.",
      valueParameterIndex,
    );
  }
  if (
    signature.parameters.length !== indexParameterIndexes.length +
      (valueParameterIndex === undefined ? 0 : 1)
  ) {
    collector.add(
      `${path}.targetInvocation`,
      "Native-indexer invocation must cover every signature parameter exactly once.",
    );
  }
}

export function validateDotnetParameters(
  parameters: readonly DotnetParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    validateDotnetTypeRef(parameter.type, `${parameterPath}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    validateOptionalDotnetTypeRef(parameter.sourceType, `${parameterPath}.sourceType`, collector, { allowLiteral: true, allowProviderRef: true });
    if (!supportedPassingModes.has(parameter.passingMode)) {
      collector.add(`${parameterPath}.passingMode`, "Parameter passingMode is not a supported provider contract value.", parameter.passingMode);
    }
    if (parameter.rest === true) {
      if (index !== parameters.length - 1) {
        collector.add(`${parameterPath}.rest`, "Params-array/rest parameters must be the final parameter.");
      }
      if (parameter.passingMode !== "by-value") {
        collector.add(`${parameterPath}.passingMode`, "Params-array/rest parameters must be passed by value.", parameter.passingMode);
      }
      if (dotnetParamsArrayTargetType(parameter.type).kind !== "array") {
        collector.add(`${parameterPath}.type`, "Params-array/rest parameters must carry an array target type.", parameter.type);
      }
    }
    if (parameter.defaultValue !== undefined && parameter.optional !== true) {
      collector.add(`${parameterPath}.defaultValue`, "Default parameter values must only appear on optional parameters.");
    }
    if (parameter.unsupportedDefaultValue !== undefined && parameter.optional !== true) {
      collector.add(`${parameterPath}.unsupportedDefaultValue`, "Unsupported default value evidence must only appear on optional parameters.");
    }
    if (parameter.defaultValue !== undefined && parameter.unsupportedDefaultValue !== undefined) {
      collector.add(`${parameterPath}.unsupportedDefaultValue`, "A parameter cannot carry both supported and unsupported default value facts.");
    }
    validateOptionalDotnetParameterDefaultValue(parameter.defaultValue, `${parameterPath}.defaultValue`, collector);
    validateOptionalDotnetUnsupportedDefaultValue(parameter.unsupportedDefaultValue, `${parameterPath}.unsupportedDefaultValue`, collector);
  }
}

function dotnetParamsArrayTargetType(type: DotnetTypeRef): DotnetTypeRef {
  return type.kind === "nullable-reference"
    ? type.elementType
    : type;
}

export function validateDotnetTypeParameters(
  parameters: readonly DotnetTypeParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const names = new Set<string>();
  const identities = new Set<string>();
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.identity, `${parameterPath}.identity`, collector);
    requireUnique(identities, parameter.identity, `${parameterPath}.identity`, collector);
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    requireUnique(names, parameter.name, `${parameterPath}.name`, collector);
    if (typeof parameter.allowsRefLike !== "boolean") {
      collector.add(`${parameterPath}.allowsRefLike`, "A CLR generic parameter requires its native allows-ref-struct flag.", parameter.allowsRefLike);
    }
    validateDotnetConstraints(parameter.constraints ?? [], `${parameterPath}.constraints`, collector);
    validateUnsupportedConstraints(parameter.unsupportedConstraints ?? [], `${parameterPath}.unsupportedConstraints`, collector);
    validateOptionalDotnetTypeRef(parameter.defaultType, `${parameterPath}.defaultType`, collector, { allowLiteral: false, allowProviderRef: false });
    if (parameter.variance !== undefined && !supportedTypeParameterVariance.has(parameter.variance)) {
      collector.add(`${parameterPath}.variance`, "Type parameter variance is not a supported provider contract value.", parameter.variance);
    }
  }
}

export function validateDotnetConstraints(
  constraints: readonly DotnetConstraint[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, constraint] of constraints.entries()) {
    const constraintPath = `${path}[${index}]`;
    if (!requireSupportedDiscriminant(
      (constraint as unknown as Readonly<Record<string, unknown>>).kind,
      `${constraintPath}.kind`,
      collector,
      ".NET constraint kind",
      supportedDotnetConstraintKinds,
    )) {
      continue;
    }
    if (constraint.kind === "implements") {
      validateDotnetTypeRef(constraint.contract, `${constraintPath}.contract`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    }
    if (constraint.kind === "target-specific") {
      requireNonEmptyString(constraint.name, `${constraintPath}.name`, collector);
    }
  }
}

export function validateUnsupportedConstraints(
  constraints: readonly DotnetUnsupportedConstraintDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, constraint] of constraints.entries()) {
    const constraintPath = `${path}[${index}]`;
    validateDotnetTargetIdentity(constraint.targetId, constraint.metadataName, `${constraintPath}.targetId`, `${constraintPath}.metadataName`, collector);
    requireNonEmptyString(constraint.reason, `${constraintPath}.reason`, collector);
  }
}

export function validateUnsupportedMembers(
  members: readonly DotnetUnsupportedMemberDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const memberIds = new Set<string>();
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    requireSupportedDiscriminant(
      (member as unknown as Readonly<Record<string, unknown>>).memberKind,
      `${memberPath}.memberKind`,
      collector,
      ".NET unsupported member kind",
      supportedDotnetMemberKinds,
    );
    requireNonEmptyString(member.sourceName, `${memberPath}.sourceName`, collector);
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    validateDotnetTargetIdentity(member.targetId, member.metadataName, `${memberPath}.targetId`, `${memberPath}.metadataName`, collector);
    requireNonEmptyString(member.reason, `${memberPath}.reason`, collector);
    requireUnique(memberIds, member.targetId, `${memberPath}.targetId`, collector);
  }
}

export function validateUnsupportedExports(
  declarations: readonly DotnetUnsupportedExportDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const sourceNames = new Set<string>();
  for (const [index, declaration] of declarations.entries()) {
    const declarationPath = `${path}[${index}]`;
    requireNonEmptyString(declaration.sourceName, `${declarationPath}.sourceName`, collector);
    requireUnique(sourceNames, declaration.sourceName, `${declarationPath}.sourceName`, collector);
    requireNonEmptyString(declaration.reason, `${declarationPath}.reason`, collector);
    if (declaration.kind === "unsupported-type-export") {
      validateDotnetTargetIdentity(declaration.targetId, declaration.metadataName, `${declarationPath}.targetId`, `${declarationPath}.metadataName`, collector, {
        assembly: declaration.assembly,
      });
      validateOptionalDotnetAssemblyReference(declaration.assembly, `${declarationPath}.assembly`, collector);
    } else {
      const record = declaration as unknown as Readonly<Record<string, unknown>>;
      const targetIds = Array.isArray(record.targetIds) ? record.targetIds as readonly unknown[] : undefined;
      const metadataNames = Array.isArray(record.metadataNames) ? record.metadataNames as readonly unknown[] : undefined;
      if (targetIds === undefined) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family exports must carry a targetIds array.", record.targetIds);
      }
      if (metadataNames === undefined) {
        collector.add(`${declarationPath}.metadataNames`, "Unsupported type-family exports must carry a metadataNames array.", record.metadataNames);
      }
      if ((targetIds ?? []).length === 0) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family exports must identify every rejected target id.");
      }
      if ((metadataNames ?? []).length === 0) {
        collector.add(`${declarationPath}.metadataNames`, "Unsupported type-family exports must identify every rejected metadata name.");
      }
      if ((targetIds ?? []).length !== (metadataNames ?? []).length) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family targetIds and metadataNames must have matching cardinality.");
      }
      for (const [targetIndex, targetId] of (targetIds ?? []).entries()) {
        const metadataName = metadataNames?.[targetIndex];
        validateDotnetTargetIdentity(
          typeof targetId === "string" ? targetId : undefined,
          typeof metadataName === "string" ? metadataName : undefined,
          `${declarationPath}.targetIds[${targetIndex}]`,
          `${declarationPath}.metadataNames[${targetIndex}]`,
          collector,
          { assembly: declaration.assemblies?.[targetIndex] },
        );
      }
      for (const [assemblyIndex, assembly] of (declaration.assemblies ?? []).entries()) {
        validateDotnetAssemblyReference(assembly, `${declarationPath}.assemblies[${assemblyIndex}]`, collector);
      }
    }
  }
}
