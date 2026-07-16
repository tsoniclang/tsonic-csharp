import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentity,
} from "./target-member-metadata.js";

const globalsTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Globals", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Globals"));
const timersTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Timers", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Timers"));
const actionTargetType = csharpDelegateTargetType("System.Action", []);
const stringTargetType = csharpStringTargetType();
const numberTargetType = csharpSourcePrimitiveTargetType("float64");
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const globalCapabilityId = "surface.js.global-functions";

interface GlobalFunctionMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly declaringType: TargetTypeRef;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType: TargetTypeRef;
}

function globalFunctionMetadata(row: GlobalFunctionMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: row.declaringType,
    static: true,
    capabilityId: globalCapabilityId,
    requiredFacts: [
      "selected JS source-profile global declaration/signature identity",
      "closed callback and argument target facts",
      "Tsonic.CSharp.Js global runtime metadata row",
    ],
    semanticEquivalence: "Selected Tsonic JS source-profile global operation maps to its closed Tsonic.CSharp.Js runtime implementation.",
  };
}

const globalTargetMemberMetadata = [
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Globals.parseInt",
    sourceName: "parseInt",
    targetName: "parseInt",
    declaringType: globalsTargetType,
    parameters: [
      targetParameter("value", stringTargetType),
      targetParameter("radix", intTargetType, { optional: true }),
    ],
    returnType: numberTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Globals.parseFloat",
    sourceName: "parseFloat",
    targetName: "parseFloat",
    declaringType: globalsTargetType,
    parameters: [targetParameter("value", stringTargetType)],
    returnType: numberTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Globals.isNaN",
    sourceName: "isNaN",
    targetName: "isNaN",
    declaringType: globalsTargetType,
    parameters: [targetParameter("value", numberTargetType)],
    returnType: boolTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Globals.isFinite",
    sourceName: "isFinite",
    targetName: "isFinite",
    declaringType: globalsTargetType,
    parameters: [targetParameter("value", numberTargetType)],
    returnType: boolTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Timers.setTimeout",
    sourceName: "setTimeout",
    targetName: "setTimeout",
    declaringType: timersTargetType,
    parameters: [
      targetParameter("callback", actionTargetType),
      targetParameter("delay", numberTargetType, { optional: true }),
    ],
    returnType: numberTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Timers.clearTimeout",
    sourceName: "clearTimeout",
    targetName: "clearTimeout",
    declaringType: timersTargetType,
    parameters: [targetParameter("id", numberTargetType)],
    returnType: csharpVoidTargetType(),
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Timers.setInterval",
    sourceName: "setInterval",
    targetName: "setInterval",
    declaringType: timersTargetType,
    parameters: [
      targetParameter("callback", actionTargetType),
      targetParameter("delay", numberTargetType),
    ],
    returnType: numberTargetType,
  }),
  globalFunctionMetadata({
    id: "Tsonic.CSharp.Js.Timers.clearInterval",
    sourceName: "clearInterval",
    targetName: "clearInterval",
    declaringType: timersTargetType,
    parameters: [targetParameter("id", numberTargetType)],
    returnType: csharpVoidTargetType(),
  }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

export const globalTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("Global", globalTargetMemberMetadata),
);
