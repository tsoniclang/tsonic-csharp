import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "./source-library.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "./target-member-metadata.js";

const consoleTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.console", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "console"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringTargetType = csharpTargetNamedType("System.String", undefined, { kind: "predefined", name: "string" });

export function consoleTargetMembersForSourceMember(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  const member = consoleTargetMembersBySourceIdentity.get(sourceMember.id);
  return member === undefined ? [] : [member];
}

function consoleMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[] = [consoleDataParameter()],
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.console.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType: csharpVoidTargetType(),
    declaringType: consoleTargetType,
    static: true,
  };
}

function consoleDataParameter(): ReturnType<typeof targetParameter> {
  return targetParameter("data", objectTargetType, {
    paramsArray: true,
    csharpAcceptsClosedSourceArgument: true,
  });
}

function optionalStringParameter(name: string): ReturnType<typeof targetParameter> {
  return targetParameter(name, stringTargetType, { optional: true });
}

const consoleTargetMemberMetadata = [
  ...[
    "log",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "group",
    "groupCollapsed",
  ].map((sourceName) => consoleMethodMetadata(sourceName)),
  consoleMethodMetadata("clear", []),
  consoleMethodMetadata("groupEnd", []),
  consoleMethodMetadata("assert", [
    targetParameter("condition", csharpSourcePrimitiveTargetType("bool")),
    optionalStringParameter("message"),
  ]),
  consoleMethodMetadata("dir", [targetParameter("obj", objectTargetType, { csharpAcceptsClosedSourceArgument: true })]),
  consoleMethodMetadata("dirxml", [targetParameter("obj", objectTargetType, { csharpAcceptsClosedSourceArgument: true })]),
  consoleMethodMetadata("table", [targetParameter("data", objectTargetType, { csharpAcceptsClosedSourceArgument: true })]),
  consoleMethodMetadata("time", [optionalStringParameter("label")]),
  consoleMethodMetadata("timeEnd", [optionalStringParameter("label")]),
  consoleMethodMetadata("timeLog", [
    optionalStringParameter("label"),
    consoleDataParameter(),
  ]),
  consoleMethodMetadata("count", [optionalStringParameter("label")]),
  consoleMethodMetadata("countReset", [optionalStringParameter("label")]),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const consoleTargetMembersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, TargetMember> =
  new Map(consoleTargetMemberMetadata.map((record) => [
    consoleSourceKey(record.sourceName),
    jsSurfaceTargetMemberFromMetadata(record),
  ]));

function consoleSourceKey(sourceName: string): SourceLibraryMemberKey {
  return `Console.${sourceName}`;
}
