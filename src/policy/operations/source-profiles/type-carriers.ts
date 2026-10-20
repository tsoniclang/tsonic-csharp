import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpAsyncGeneratorTargetType, csharpGeneratorTargetType, csharpIteratorResultTargetType, closeCsharpGeneratorProtocolType } from "../../../target-model/types/carriers/generators.js";
import { csharpJsArrayTargetType, csharpJsDateTargetType, csharpJsMapTargetType, csharpJsRegExpExecArrayTargetType, csharpJsRegExpIndicesArrayTargetType, csharpJsRegExpMatchArrayTargetType, csharpJsRegExpNamedGroupsTargetType, csharpJsRegExpNamedIndicesTargetType, csharpJsRegExpStringIteratorTargetType, csharpJsRegExpTargetType, csharpExactJsRegExpExecArrayTargetType, csharpExactJsRegExpIndicesArrayTargetType, csharpExactJsRegExpMatchArrayTargetType, csharpExactJsRegExpNamedGroupsTargetType, csharpExactJsRegExpNamedIndicesTargetType, csharpExactJsRegExpStringIteratorTargetType, csharpJsSetTargetType, csharpJsWeakMapTargetType, csharpJsWeakSetTargetType, csharpJsArrayBufferTargetType, csharpJsDataViewTargetType, csharpJsTypedArrayTargetType, csharpJsPromiseFulfilledResultTargetType, csharpJsPromiseRejectedResultTargetType, csharpJsIntlTargetType, type CsharpJsTypedArrayName } from "../../../target-model/types/carriers/js.js";
import { classifyCsharpSourceProfileType } from "../../identities/source-types.js";

import { csharpTaskTargetType } from "../../../target-model/types/carriers/delegates.js";
import { csharpEnumerableTargetType } from "../../../target-model/types/carriers/collections.js";

import { csharpRuntimeErrorTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../target-model/types/carriers/scalar-types.js";

export function selectCsharpSourceProfileCarrier(
  data: { readonly baseErrorCarrier: TargetTypeRef | undefined; readonly dictionaryCarrier: TargetTypeRef | undefined },
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
    case "error": {
      if (identity.baseException && typeArguments.length === 0) return data.baseErrorCarrier;
      return typeArguments.length === 0 ? csharpRuntimeErrorTargetType(identity.errorName) : undefined;
    }
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
    case "promise-fulfilled-result":
      return typeArguments.length === 1
        ? csharpJsPromiseFulfilledResultTargetType(typeArguments[0]!)
        : undefined;
    case "promise-rejected-result":
      return typeArguments.length === 0
        ? csharpJsPromiseRejectedResultTargetType()
        : undefined;
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
      const targetType = data.dictionaryCarrier;
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
        : csharpJsRegExpTargetType();
    case "regexp-exec-array":
      return typeArguments.length === 0
        ? csharpJsRegExpExecArrayTargetType()
        : undefined;
    case "regexp-match-array":
      return typeArguments.length === 0
        ? csharpJsRegExpMatchArrayTargetType()
        : undefined;
    case "regexp-indices-array":
      return typeArguments.length === 0
        ? csharpJsRegExpIndicesArrayTargetType()
        : undefined;
    case "regexp-named-groups":
      return typeArguments.length === 0
        ? csharpJsRegExpNamedGroupsTargetType()
        : undefined;
    case "regexp-named-indices":
      return typeArguments.length === 0
        ? csharpJsRegExpNamedIndicesTargetType()
        : undefined;
    case "regexp-string-iterator":
      return typeArguments.length === 1
        ? csharpJsRegExpStringIteratorTargetType()
        : undefined;
    case "js-regexp-exec-array":
      return typeArguments.length === 0
        ? csharpExactJsRegExpExecArrayTargetType()
        : undefined;
    case "js-regexp-match-array":
      return typeArguments.length === 0
        ? csharpExactJsRegExpMatchArrayTargetType()
        : undefined;
    case "js-regexp-indices-array":
      return typeArguments.length === 0
        ? csharpExactJsRegExpIndicesArrayTargetType()
        : undefined;
    case "js-regexp-named-groups":
      return typeArguments.length === 0
        ? csharpExactJsRegExpNamedGroupsTargetType()
        : undefined;
    case "js-regexp-named-indices":
      return typeArguments.length === 0
        ? csharpExactJsRegExpNamedIndicesTargetType()
        : undefined;
    case "js-regexp-string-iterator":
      return typeArguments.length === 1
        ? csharpExactJsRegExpStringIteratorTargetType()
        : undefined;
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
    case "weak-map":
      return typeArguments.length === 2
        ? csharpJsWeakMapTargetType(typeArguments[0]!, typeArguments[1]!)
        : undefined;
    case "weak-set":
      return typeArguments.length === 1
        ? csharpJsWeakSetTargetType(typeArguments[0]!)
        : undefined;
    case "array-buffer":
      return typeArguments.length === 0
        ? csharpJsArrayBufferTargetType()
        : undefined;
    case "data-view":
      return typeArguments.length === 0
        ? csharpJsDataViewTargetType()
        : undefined;
    case "typed-array":
      return typeArguments.length === 0
        ? csharpJsTypedArrayTargetType(
            identity.sourceName as CsharpJsTypedArrayName,
          )
        : undefined;
    case "intl-date-time-format":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlDateTimeFormat")
        : undefined;
    case "intl-number-format":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlNumberFormat")
        : undefined;
    case "intl-collator":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlCollator")
        : undefined;
    case "intl-date-time-part":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlDateTimeFormatPart")
        : undefined;
    case "intl-number-part":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlNumberFormatPart")
        : undefined;
    case "intl-date-time-options":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlResolvedDateTimeFormatOptions")
        : undefined;
    case "intl-number-options":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlResolvedNumberFormatOptions")
        : undefined;
    case "intl-collator-options":
      return typeArguments.length === 0
        ? csharpJsIntlTargetType("IntlResolvedCollatorOptions")
        : undefined;
    case "iterable":
      return typeArguments.length === 1
        ? csharpEnumerableTargetType(typeArguments[0]!)
        : undefined;
  }
}

export function generatorProtocol(
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
  typeArguments: readonly TargetTypeRef[],
): { readonly yieldType: TargetTypeRef; readonly returnType: TargetTypeRef } | undefined {
  return typeArguments.length === 2
    ? {
        yieldType: closeCsharpGeneratorProtocolType(typeArguments[0]!),
        returnType: closeCsharpGeneratorProtocolType(typeArguments[1]!),
      }
    : undefined;
}
