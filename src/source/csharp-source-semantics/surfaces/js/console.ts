import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
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
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSourceMember,
} from "./target-member-metadata.js";

const consoleTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.console", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "console"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringTargetType = csharpTargetNamedType("System.String", undefined, { kind: "predefined", name: "string" });
type ConsoleTargetParameter = ReturnType<typeof targetParameter>;

interface ConsoleMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters?: readonly ConsoleTargetParameter[];
}

export function consoleTargetMembersForSourceMember(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceMember(consoleTargetMembersBySourceIdentity, sourceMember);
}

function consoleMethodMetadata(row: ConsoleMethodMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters ?? [consoleDataParameter()],
    returnType: csharpVoidTargetType(),
    declaringType: consoleTargetType,
    static: true,
  };
}

function consoleDataParameter(): ConsoleTargetParameter {
  return targetParameter("data", objectTargetType, {
    paramsArray: true,
    csharpAcceptsClosedSourceArgument: true,
  });
}

function optionalStringParameter(name: string): ConsoleTargetParameter {
  return targetParameter(name, stringTargetType, { optional: true });
}

const consoleTargetMemberMetadata = [
  ...[
    { id: "Tsonic.CSharp.Js.console.log", sourceName: "log", targetName: "log" },
    { id: "Tsonic.CSharp.Js.console.error", sourceName: "error", targetName: "error" },
    { id: "Tsonic.CSharp.Js.console.warn", sourceName: "warn", targetName: "warn" },
    { id: "Tsonic.CSharp.Js.console.info", sourceName: "info", targetName: "info" },
    { id: "Tsonic.CSharp.Js.console.debug", sourceName: "debug", targetName: "debug" },
    { id: "Tsonic.CSharp.Js.console.trace", sourceName: "trace", targetName: "trace" },
    { id: "Tsonic.CSharp.Js.console.group", sourceName: "group", targetName: "group" },
    { id: "Tsonic.CSharp.Js.console.groupCollapsed", sourceName: "groupCollapsed", targetName: "groupCollapsed" },
  ].map(consoleMethodMetadata),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.clear", sourceName: "clear", targetName: "clear", parameters: [] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.groupEnd", sourceName: "groupEnd", targetName: "groupEnd", parameters: [] }),
  consoleMethodMetadata({
    id: "Tsonic.CSharp.Js.console.assert",
    sourceName: "assert",
    targetName: "assert",
    parameters: [
      targetParameter("condition", csharpSourcePrimitiveTargetType("bool")),
      optionalStringParameter("message"),
    ],
  }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.dir", sourceName: "dir", targetName: "dir", parameters: [targetParameter("obj", objectTargetType, { csharpAcceptsClosedSourceArgument: true })] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.dirxml", sourceName: "dirxml", targetName: "dirxml", parameters: [targetParameter("obj", objectTargetType, { csharpAcceptsClosedSourceArgument: true })] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.table", sourceName: "table", targetName: "table", parameters: [targetParameter("data", objectTargetType, { csharpAcceptsClosedSourceArgument: true })] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.time", sourceName: "time", targetName: "time", parameters: [optionalStringParameter("label")] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.timeEnd", sourceName: "timeEnd", targetName: "timeEnd", parameters: [optionalStringParameter("label")] }),
  consoleMethodMetadata({
    id: "Tsonic.CSharp.Js.console.timeLog",
    sourceName: "timeLog",
    targetName: "timeLog",
    parameters: [
      optionalStringParameter("label"),
      consoleDataParameter(),
    ],
  }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.count", sourceName: "count", targetName: "count", parameters: [optionalStringParameter("label")] }),
  consoleMethodMetadata({ id: "Tsonic.CSharp.Js.console.countReset", sourceName: "countReset", targetName: "countReset", parameters: [optionalStringParameter("label")] }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const consoleTargetMembersBySourceIdentity = jsSurfaceTargetMemberMetadataIdentityIndex("Console", consoleTargetMemberMetadata);
