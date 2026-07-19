import type {
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentity,
} from "./target-member-metadata.js";
import {
  csharpJsObjectCarrierTargetType,
} from "./objects.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

const jsonRuntimeType = csharpTargetNamedType("Tsonic.CSharp.Js.JSON", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSON"));
const jsonValueTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const numberTargetType = csharpSourcePrimitiveTargetType("float64");
const jsonArrayElementType: TargetTypeRef = {
  kind: "type-parameter",
  name: "T",
};

interface JsonSemanticExceptionMetadata {
  readonly reason: string;
  readonly provenance: string;
  readonly capabilityId: string;
  readonly requiredFacts: readonly string[];
}

type JsonTargetMemberMetadata = JsSurfaceTargetMemberMetadata & {
  readonly semanticException?: JsonSemanticExceptionMetadata;
};

interface JsonStaticMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType: TargetTypeRef;
  readonly typeParameters?: readonly TargetTypeParameter[];
  readonly semanticException?: JsonSemanticExceptionMetadata;
  readonly csharpCallFinalization?: JsSurfaceTargetMemberMetadata["csharpCallFinalization"];
  readonly csharpDeferredTargetSelection?: JsSurfaceTargetMemberMetadata["csharpDeferredTargetSelection"];
}

const jsonObjectShapeStringifySelectionFamilyId = "tsonic.csharp.js.json.stringify.closed-object-shape";

const closedJsonValueFinalization = {
  kind: "closed-json-value",
  argumentIndex: 0,
} as const;

const closedJsonObjectShapeFinalization = {
  kind: "closed-json-object-shape",
  argumentIndex: 0,
} as const;

export function csharpJsJsonValueTargetType(): TargetTypeRef {
  return jsonValueTargetType;
}

export function isCsharpJsJsonValueTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsonValueTargetType.id;
}

export function jsonRecordDictionaryStringifyTargetMembers(
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
): readonly ReturnType<typeof jsSurfaceTargetMemberFromMetadata>[] {
  return [jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:dictionary",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", dictionaryType)],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
    semanticException: {
      reason: "JSON.stringify accepts closed string-keyed Record dictionary carriers through the JSON runtime shim.",
      provenance: "Selected Tsonic JS source-profile JSON.stringify overload with finalized string-keyed Record dictionary carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed string-keyed Record dictionary argument carrier", "JSON.stringify dictionary runtime metadata row"],
    },
  })].map(jsSurfaceTargetMemberFromMetadata);
}

export function jsonObjectShapeStringifyTargetMembers(
  objectShapeTargetType: TargetTypeRef,
): readonly ReturnType<typeof jsSurfaceTargetMemberFromMetadata>[] {
  const identity = objectShapeTargetType.kind === "target-named"
    ? objectShapeTargetType.id
    : JSON.stringify(objectShapeTargetType);
  return [jsonStaticMethodMetadata({
    id: `Tsonic.CSharp.Js.JSON.stringify:object-shape:${identity}`,
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", objectShapeTargetType, {
      csharpAcceptsClosedSourceArgument: true,
    })],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonObjectShapeFinalization,
    csharpDeferredTargetSelection: {
      familyId: jsonObjectShapeStringifySelectionFamilyId,
      variant: "implementation",
    },
    semanticException: {
      reason: "JSON.stringify accepts a compiler-proven closed object shape through generated no-reflection JSON writer code.",
      provenance: "Selected Tsonic JS source-profile JSON.stringify declaration with finalized object-shape members and target carriers.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed object-shape argument fact", "generated JSON writer contract"],
    },
  })].map(jsSurfaceTargetMemberFromMetadata);
}

export function deferredJsonObjectShapeStringifyTargetMembers(): readonly ReturnType<typeof jsSurfaceTargetMemberFromMetadata>[] {
  const deferredType: TargetTypeRef = {
    kind: "type-parameter",
    name: "TJsonObjectShape",
  };
  return [jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:deferred-object-shape",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", deferredType, {
      csharpAcceptsCheckedSourceArgument: true,
    })],
    returnType: stringTargetType,
    typeParameters: [{ name: "TJsonObjectShape" }],
    csharpCallFinalization: closedJsonObjectShapeFinalization,
    csharpDeferredTargetSelection: {
      familyId: jsonObjectShapeStringifySelectionFamilyId,
      variant: "canonical",
    },
  })].map(jsSurfaceTargetMemberFromMetadata);
}

function jsonStaticMethodMetadata(row: JsonStaticMethodMetadataRow): JsonTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: jsonRuntimeType,
    static: true,
    ...(row.typeParameters === undefined ? {} : { typeParameters: row.typeParameters }),
    capabilityId: "surface.js.math-json-regexp",
    requiredFacts: [
      "selected source declaration/signature identity",
      "closed JSON argument target facts",
      "Tsonic.CSharp.Js.JSON runtime metadata row",
    ],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.JSON runtime member preserves ECMAScript JSON operation semantics for closed JSON carriers.",
    ...(row.semanticException === undefined ? {} : { semanticException: row.semanticException }),
    ...(row.csharpCallFinalization === undefined ? {} : { csharpCallFinalization: row.csharpCallFinalization }),
    ...(row.csharpDeferredTargetSelection === undefined ? {} : { csharpDeferredTargetSelection: row.csharpDeferredTargetSelection }),
  };
}

const jsonTargetMemberMetadata = [
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.parse",
    sourceName: "parse",
    targetName: "parse",
    parameters: [targetParameter("text", stringTargetType)],
    returnType: jsonValueTargetType,
    semanticException: {
      reason: "JSON.parse returns the closed TsValue runtime carrier instead of System.Object.",
      provenance: "Tsonic JS source-profile JSON.parse declaration selected with a provider-proven string argument.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.parse source signature", "closed string argument carrier", "closed TsValue result carrier metadata"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:string",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", stringTargetType)],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:number",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", numberTargetType)],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:bool",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", boolTargetType)],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:object",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", csharpJsObjectCarrierTargetType())],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
    semanticException: {
      reason: "JSON.stringify accepts the closed JSObject carrier through the JSON runtime shim.",
      provenance: "Selected Tsonic JS source-profile JSON.stringify overload with finalized JSObject carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed JSObject argument carrier", "JSON.stringify object runtime metadata row"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:array",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", csharpJsArrayCarrierTargetType(jsonArrayElementType))],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
    semanticException: {
      reason: "JSON.stringify accepts the closed JSArray carrier through the JSON runtime shim.",
      provenance: "Selected Tsonic JS source-profile JSON.stringify overload with finalized JSArray carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed JSArray argument carrier", "JSON.stringify array runtime metadata row"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:tsvalue",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", jsonValueTargetType)],
    returnType: stringTargetType,
    csharpCallFinalization: closedJsonValueFinalization,
    semanticException: {
      reason: "JSON.stringify preserves the closed TsValue carrier produced by JSON.parse.",
      provenance: "Selected Tsonic JS source-profile JSON.stringify overload with finalized TsValue carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed TsValue argument carrier", "JSON.stringify TsValue runtime metadata row"],
    },
  }),
] satisfies readonly JsonTargetMemberMetadata[];
export const jsonTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("JSON", jsonTargetMemberMetadata),
);
