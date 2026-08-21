import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type {
  SourceCallableTypeEvidence,
  SourceFileSemantics,
  SourceTypeComponentEvidence,
} from "@tsonic/target-api/source";
import type { Type } from "@tsonic/tsts";
import {
  csharpAsyncGeneratorTargetType,
  csharpGeneratorTargetType,
  csharpIteratorResultTargetType,
  closeCsharpGeneratorProtocolType,
} from "../callables/generators.js";
import {
  csharpJsArrayTargetType,
  csharpJsDateTargetType,
  csharpJsMapTargetType,
  csharpJsRegExpTargetType,
  csharpJsSetTargetType,
} from "./surface-types.js";
import { classifyCsharpSourceProfileType } from "./source-profile.js";
import { combineCsharpTargetUnionMembers } from "../storage/runtime-carriers.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../callables/delegates.js";
import { csharpEnumerableTargetType } from "../collections.js";
import { csharpNullableTargetType } from "../storage/nullable.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../model/scalar-types.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { csharpTargetTypeFromBinding } from "../storage/bindings.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";

export function resolveSourceProfileType(
  { generatorProtocol, generatorResultProtocol, host }: CsharpTypeResolutionScope,
  identity: ReturnType<typeof classifyCsharpSourceProfileType>,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  if (identity === undefined) {
    return undefined;
  }
  switch (identity.kind) {
    case "boolean":
      return typeArguments.length === 0
        ? csharpSourcePrimitiveTargetType("bool")
        : undefined;
    case "number":
      return typeArguments.length === 0
        ? csharpSourcePrimitiveTargetType("float64")
        : undefined;
    case "string":
      return typeArguments.length === 0
        ? csharpStringTargetType()
        : undefined;
    case "array":
    case "readonly-array": {
      const elementType = typeArguments.length === 1
        ? typeArguments[0]
        : undefined;
      if (elementType === undefined) {
        return undefined;
      }
      return identity.ownerId === "js"
        ? csharpJsArrayTargetType(elementType)
        : { kind: "array", element: elementType };
    }
    case "promise": {
      const resultType = typeArguments.length === 1
        ? typeArguments[0]
        : undefined;
      return resultType === undefined
        ? undefined
        : csharpTaskTargetType(resultType);
    }
    case "iterator-result": {
      const protocol = generatorResultProtocol(typeArguments);
      return protocol === undefined
        ? undefined
        : csharpIteratorResultTargetType(protocol);
    }
    case "generator":
    case "async-generator": {
      const protocol = generatorProtocol(typeArguments);
      if (protocol === undefined) {
        return undefined;
      }
      return identity.kind === "generator"
        ? csharpGeneratorTargetType(protocol)
        : csharpAsyncGeneratorTargetType(protocol);
    }
    case "record": {
      if (typeArguments.length !== 2) {
        return undefined;
      }
      const binding = host.providers.findTargetBindingByMetadataName(
        "System.Collections.Generic.Dictionary`2",
      );
      const targetType = binding === undefined
        ? undefined
        : csharpTargetTypeFromBinding(binding, typeArguments);
      if (targetType?.kind !== "target-named") {
        return undefined;
      }
      return {
        ...(targetType as CsharpTargetNamedTypeRef),
        csharpCollectionSurface: "record",
        csharpPropertyKeyIteration: {
          kind: "key-collection",
          memberName: "Keys",
        },
      } as CsharpTargetNamedTypeRef;
    }
    case "date":
      return typeArguments.length === 0
        ? csharpJsDateTargetType()
        : undefined;
    case "regexp":
      return typeArguments.length !== 0
        ? undefined
        : identity.ownerId === "js"
          ? csharpJsRegExpTargetType()
          : csharpTargetNamedType(
              "System.Text.RegularExpressions.Regex",
              undefined,
              csharpQualifiedTypeRenderShape(
                "System.Text.RegularExpressions",
                "Regex",
              ),
            );
    case "map":
    case "readonly-map":
      return typeArguments.length === 2
        ? csharpJsMapTargetType(typeArguments[0]!, typeArguments[1]!)
        : undefined;
    case "set":
    case "readonly-set":
      return typeArguments.length === 1
        ? csharpJsSetTargetType(typeArguments[0]!)
        : undefined;
    case "iterable":
      return typeArguments.length === 1
        ? csharpEnumerableTargetType(typeArguments[0]!)
        : undefined;
  }
}


export function generatorProtocol(
  {  }: CsharpTypeResolutionScope,
  typeArguments: readonly TargetTypeRef[],
): { readonly yieldType: TargetTypeRef; readonly returnType: TargetTypeRef; readonly nextType: TargetTypeRef } | undefined {
  return typeArguments.length === 3
    ? {
        yieldType: closeCsharpGeneratorProtocolType(typeArguments[0]!),
        returnType: closeCsharpGeneratorProtocolType(typeArguments[1]!),
        nextType: closeCsharpGeneratorProtocolType(typeArguments[2]!),
      }
    : undefined;
}


export function generatorResultProtocol(
  {  }: CsharpTypeResolutionScope,
  typeArguments: readonly TargetTypeRef[],
): { readonly yieldType: TargetTypeRef; readonly returnType: TargetTypeRef } | undefined {
  return typeArguments.length === 2
    ? {
        yieldType: closeCsharpGeneratorProtocolType(typeArguments[0]!),
        returnType: closeCsharpGeneratorProtocolType(typeArguments[1]!),
      }
    : undefined;
}



export function resolveUnionType(
  { resolveTypeWithState }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const rawSourceMembers = queries.types.unionOrIntersectionTypes(type);
  const sourceMembers = definedValues(rawSourceMembers);
  if (sourceMembers.length !== rawSourceMembers.length) {
    return undefined;
  }
  const resolved = sourceMembers.map((member) =>
    resolveTypeWithState(member, queries.sourceFile, nextState(state))
  );
  if (resolved.some((member) => member === undefined)) {
    return undefined;
  }
  return combineCsharpTargetUnionMembers(
    resolved as readonly TargetTypeRef[],
  );
}


export function resolveCallableType(
  { resolveCallableEvidence }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const callable = queries.types.callable(type);
  return callable === undefined
    ? undefined
    : resolveCallableEvidence(callable, queries, state);
}


export function resolveCallableEvidence(
  { resolveSignatureParameterEvidence, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const parameterTypes = callable.parameters.map((parameter) =>
    resolveSignatureParameterEvidence(parameter, queries, state, "callable")
  );
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = resolveSourceTypeComponentEvidence(
    callable.result,
    queries,
    state,
  );
  if (returnType === undefined) {
    return undefined;
  }
  return returnType.kind === "target-named" &&
      (returnType as CsharpTargetNamedTypeRef).csharpSpecialType === "void"
    ? csharpDelegateTargetType(
        "System.Action",
        parameterTypes as readonly TargetTypeRef[],
      )
    : csharpDelegateTargetType(
        "System.Func",
        parameterTypes as readonly TargetTypeRef[],
        returnType,
      );
}

export function resolveSignatureParameterEvidence(
  { host, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  use: "callable" | "parameter-list",
): TargetTypeRef | undefined {
  const resolved = resolveSourceTypeComponentEvidence(
    {
      selectedType: parameter.type,
      ...(parameter.declaration === undefined
        ? {}
        : {
            declaration: parameter.declaration,
            ...(host.ast.typeNode(parameter.declaration) === undefined
              ? {}
              : {
                  authoredTypeNode: host.ast.typeNode(
                    parameter.declaration,
                  ),
                }),
          }),
    },
    queries,
    state,
  );
  const nullable = use === "parameter-list"
    ? parameter.parameterKind === "optional"
    : parameter.omissionKind === "undefined";
  return resolved === undefined || !nullable
    ? resolved
    : csharpNullableTargetType(resolved);
}


export function resolveSourceTypeComponentEvidence(
  { host, resolveAuthoredAndSelectedSourceType, resolveTypeWithState }: CsharpTypeResolutionScope,
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const authoredSourceFile = component.authoredTypeNode === undefined
    ? queries.sourceFile
    : host.ast.getSourceFile(component.authoredTypeNode) ??
      queries.sourceFile;
  return component.authoredTypeNode === undefined
    ? resolveTypeWithState(
        component.selectedType,
        queries.sourceFile,
        nextState(state),
      )
    : resolveAuthoredAndSelectedSourceType(
        component.authoredTypeNode,
        authoredSourceFile,
        component.selectedType,
        queries.sourceFile,
        nextState(state),
      );
}
