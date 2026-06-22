import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";

export function attributeBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const memberBuilder: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeBuilder",
    name: "__TsonicAttributeBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "array", elementType: { kind: "unknown" } }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeBuilder.property", "property", [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: ownerType }],
          returnType: { kind: "unknown" },
        },
      }], memberBuilder),
      methodMember("__TsonicAttributeBuilder.method", "method", [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: ownerType }],
          returnType: { kind: "unknown" },
        },
      }], memberBuilder),
      methodMember("__TsonicAttributeBuilder.constructor", "constructor", [], memberBuilder),
    ],
  };
}

export function attributeMemberBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const self: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeMemberBuilder",
    name: "__TsonicAttributeMemberBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeMemberBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "array", elementType: { kind: "unknown" } }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeMemberBuilder.parameter", "parameter", [
        { name: "name", type: { kind: "string" } },
      ], self),
    ],
  };
}

function methodMember(
  id: string,
  sourceName: string,
  parameters: readonly ProviderParameterDeclaration[],
  returnType: ProviderTypeExpression,
  typeParameters: readonly { readonly name: string }[] = [],
) {
  return {
    id,
    name: sourceName,
    kind: "method" as const,
    signatures: [{
      id,
      name: sourceName,
      parameters,
      returnType,
      ...(typeParameters.length === 0 ? {} : { typeParameters }),
    }],
  };
}
