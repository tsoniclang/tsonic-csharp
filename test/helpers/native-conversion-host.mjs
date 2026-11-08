import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { emptyCsharpTypeDefinitions } from "../../dist/target-model/types/native-definitions.js";
import { targetTypeRefKey } from "../../dist/target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../dist/target-model/types/carriers/nullable.js";

export function createNativeConversionHost({
  providers = [],
  providerPolicies = [],
  heritage = [],
  shapes = [],
  typeDefinitions = emptyCsharpTypeDefinitions,
  target = {},
} = {}) {
  const supertypes = nativeEntries(heritage.map(({ carrier, supertypes: parents }) =>
    [carrier, Object.freeze([...parents])]), "heritage");
  const objectShapes = nativeEntries(shapes.map(({ carrier, shape }) => [carrier, shape]), "shape");
  return Object.freeze({
    providers: createCsharpProviderRelationResolver({ providers, providerPolicies }),
    typeDefinitions,
    target,
    projectTypes: Object.freeze({
      catalog: Object.freeze({
        definitionForId: () => undefined,
        targetTypeForDeclaration: () => undefined,
      }),
      directSupertypes: carrier => supertypes.get(targetTypeRefKey(carrier)),
    }),
    objectShapes: Object.freeze({
      resolveTarget(carrier) {
        return carrier === undefined ? undefined
          : objectShapes.get(targetTypeRefKey(getCsharpNullableElementTargetType(carrier) ?? carrier));
      },
    }),
  });
}

function nativeEntries(entries, label) {
  const values = new Map();
  for (const [carrier, value] of entries) {
    const key = targetTypeRefKey(carrier);
    if (values.has(key)) throw new Error(`Duplicate Native conversion ${label} fixture for ${key}.`);
    values.set(key, value);
  }
  return values;
}
