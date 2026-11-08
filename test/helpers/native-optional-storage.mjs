import { csharpTargetNamedType } from "../../dist/target-model/types/factories.js";

export function nativeOptionalStorageDefinitions(identity = "fixture:NativeOptional") {
  const definition = (name, constraints) => {
    const parameters = Object.freeze(constraints.map((keywords, index) => Object.freeze({ kind: "type-parameter",
      identity: `${identity}:${name}:${index}`, name: `T${index}`,
      csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze(keywords.map(keyword => Object.freeze({ kind: "keyword", keyword }))) }) })));
    const carrier = Object.freeze(csharpTargetNamedType(`${identity}:${name}`, parameters,
      Object.freeze({ kind: "named", namespace: Object.freeze(["Fixture", "NativeOptional"]), name }),
      { allowsRefLikeTypeArguments: parameters.map(() => false), ...(name === "IOptionalStorage" ? {} : { valueType: true }) }));
    return Object.freeze({ carrier, parameters: Object.freeze(parameters.map(parameter => parameter.identity)) });
  };
  return Object.freeze({ contract: definition("IOptionalStorage", [[], []]), value: definition("ValueOptionalStorage", [["struct"]]),
    nullableValue: definition("NullableValueOptionalStorage", [["struct"]]), reference: definition("ReferenceOptionalStorage", [["class"]]),
    absence: definition("AbsentOptionalStorage", []), jsValue: definition("JsValueOptionalStorage", []) });
}
