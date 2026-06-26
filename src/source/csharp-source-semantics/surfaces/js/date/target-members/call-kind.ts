import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  targetParameter,
} from "../../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../../target-member-metadata.js";
import {
  dateConstructorMetadata,
} from "./builders.js";
import {
  dateTargetMemberTypes,
} from "./types.js";

export type DateCallKind = "call" | "new";

const dateConstructorMemberMetadata = [
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor()", []),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Double)", [
    targetParameter("milliseconds", dateTargetMemberTypes.doubleType),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.String)", [
    targetParameter("dateString", dateTargetMemberTypes.stringType),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Object)", [
    targetParameter("value", dateTargetMemberTypes.objectType, { csharpAcceptsCheckedSourceArgument: true }),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)", [
    targetParameter("year", dateTargetMemberTypes.intType),
    targetParameter("month", dateTargetMemberTypes.intType),
    targetParameter("day", dateTargetMemberTypes.intType, { optional: true }),
    targetParameter("hours", dateTargetMemberTypes.intType, { optional: true }),
    targetParameter("minutes", dateTargetMemberTypes.intType, { optional: true }),
    targetParameter("seconds", dateTargetMemberTypes.intType, { optional: true }),
    targetParameter("milliseconds", dateTargetMemberTypes.intType, { optional: true }),
  ]),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const dateConstructorMembers = dateConstructorMemberMetadata.map(jsSurfaceTargetMemberFromMetadata);

const dateFunctionMember = [{
  id: "Tsonic.CSharp.Js.Date.call",
  sourceName: "constructor",
  targetName: "call",
  kind: "method",
  parameters: [],
  returnType: dateTargetMemberTypes.stringType,
  declaringType: dateTargetMemberTypes.dateType,
  static: true,
} satisfies JsSurfaceTargetMemberMetadata].map(jsSurfaceTargetMemberFromMetadata);

const dateCallKindTargetMemberIndex = new Map<string, readonly TargetMember[]>([
  [dateCallKindKey("constructor", "call"), dateFunctionMember],
  [dateCallKindKey("constructor", "new"), dateConstructorMembers],
]);

export function dateCallKindTargetMembersForSourceMember(sourceMember: SourceLibraryMember, callKind: DateCallKind): readonly TargetMember[] | undefined {
  return dateCallKindTargetMemberIndex.get(dateCallKindKey(sourceMember.name, callKind));
}

function dateCallKindKey(sourceName: string, callKind: DateCallKind): string {
  return `${sourceName}\u0000${callKind}`;
}
