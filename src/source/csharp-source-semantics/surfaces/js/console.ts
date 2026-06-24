import {
  acceptObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingResult,
  ExtensionObservation,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetMethod,
  targetParameter,
} from "./source-library.js";

const consoleTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.console", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "console"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringTargetType = csharpTargetNamedType("System.String", undefined, { kind: "predefined", name: "string" });

export function mapCsharpJsConsoleCheckedCall(
  sourceMember: SourceLibraryMember,
  _host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (sourceMember.declaringName !== "Console") {
    return undefined;
  }
  const member = getConsoleTargetMember(sourceMember.memberName);
  if (member === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface console call selected from checked TypeScript standard-library declaration 'Console.${sourceMember.memberName}'.` }]);
}

function getConsoleTargetMember(sourceName: string): TargetMember | undefined {
  return consoleTargetMembers.get(sourceName);
}

function consoleMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[] = [consoleDataParameter()],
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.console.${sourceName}`, sourceName, sourceName, parameters, csharpVoidTargetType(), {
    declaringType: consoleTargetType,
    static: true,
  });
}

function consoleDataParameter(): ReturnType<typeof targetParameter> {
  return targetParameter("data", { kind: "array", element: objectTargetType } satisfies TargetTypeRef, { paramsArray: true });
}

function optionalStringParameter(name: string): ReturnType<typeof targetParameter> {
  return targetParameter(name, stringTargetType, { optional: true });
}

const consoleTargetMembers = new Map<string, TargetMember>([
  "log",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "group",
  "groupCollapsed",
  "dirxml",
].map((name) => [name, consoleMethod(name)] as const));

consoleTargetMembers.set("clear", consoleMethod("clear", []));
consoleTargetMembers.set("groupEnd", consoleMethod("groupEnd", []));
consoleTargetMembers.set("dir", consoleMethod("dir", [targetParameter("obj", objectTargetType)]));
consoleTargetMembers.set("table", consoleMethod("table", [targetParameter("data", objectTargetType)]));
consoleTargetMembers.set("time", consoleMethod("time", [optionalStringParameter("label")]));
consoleTargetMembers.set("timeEnd", consoleMethod("timeEnd", [optionalStringParameter("label")]));
consoleTargetMembers.set("count", consoleMethod("count", [optionalStringParameter("label")]));
consoleTargetMembers.set("countReset", consoleMethod("countReset", [optionalStringParameter("label")]));
