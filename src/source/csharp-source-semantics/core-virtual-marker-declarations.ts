import type {
  ProviderExportDeclaration,
  SourceCallMarkerDeclaration,
  SourcePrimitiveKind,
  SourceTypeMarkerDeclaration,
} from "@tsonic/tsts";
import {
  csharpTargetId,
  sourcePrimitiveTargetBindingId,
} from "./identity.js";

export function providerTypeMarkerDeclaration(exportName: string, marker: SourceTypeMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameters = marker === "ptr"
    ? [{ name: "T" }]
    : [{ name: "TArgs" }, { name: "TReturn" }];
  return {
    id: exportName,
    name: exportName,
    kind: "type",
    typeParameters,
    type: { kind: "unknown" },
  };
}

export function providerCallMarkerDeclaration(exportName: string, marker: SourceCallMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameter = { kind: "type-parameter" as const, name: "T" };
  switch (marker) {
    case "out":
    case "ref":
    case "inref":
    case "borrow":
    case "borrowMut":
    case "move":
    case "struct":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}(value)`,
          typeParameters: [{ name: "T" }],
          parameters: [{ name: "value", type: typeParameter }],
          returnType: typeParameter,
        }],
      };
    case "field":
    case "defaultof":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>()`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: typeParameter,
        }],
      };
    case "attribute":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>(...args)`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: {
            kind: "provider-ref",
            name: "__TsonicAttributeBuilder",
            typeArguments: [typeParameter],
          },
        }],
      };
  }
}

export function providerPrimitiveDeclaration(
  exportName: string,
  primitive: SourcePrimitiveKind,
): ProviderExportDeclaration {
  return {
    id: exportName,
    name: exportName,
    kind: "type",
    type: { kind: "source-primitive", name: primitive },
    targetIdentity: {
      target: csharpTargetId,
      id: sourcePrimitiveTargetBindingId(primitive),
      displayName: exportName,
    },
  };
}
