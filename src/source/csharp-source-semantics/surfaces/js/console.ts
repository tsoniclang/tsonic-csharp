import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
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
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (sourceMember.declaringName !== "Console") {
    return undefined;
  }
  const member = getConsoleTargetMember(sourceMember.memberName);
  if (member === undefined) {
    return undefined;
  }
  const invalidArgumentIndex = request.arguments.findIndex((argument) => {
    const type = host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: false,
    });
    return !isClosedConsoleArgumentTargetType(type);
  });
  if (invalidArgumentIndex >= 0) {
    return rejectObservation(host.csharpProviderDiagnostic(
      host.extensionId,
      "CSHARP_JS_CONSOLE_ARGUMENT_REQUIRES_TARGET_FACT",
      9100140,
      `C# JS surface console call '${sourceMember.declaringName}.${sourceMember.memberName}' requires finalized closed target facts for argument ${invalidArgumentIndex + 1}.`,
    ));
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

function isClosedConsoleArgumentTargetType(type: TargetTypeRef | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  switch (type.kind) {
    case "source-primitive":
    case "target-named":
    case "target-specific":
      return true;
    case "array":
      return isClosedConsoleArgumentTargetType(type.element);
    case "tuple":
      return type.elements.every(isClosedConsoleArgumentTargetType);
    case "pointer":
      return isClosedConsoleArgumentTargetType(type.pointee);
    case "function-pointer":
      return type.args.every(isClosedConsoleArgumentTargetType) &&
        isClosedConsoleArgumentTargetType(type.result);
    case "associated-type":
      return isClosedConsoleArgumentTargetType(type.owner);
    case "type-parameter":
    case "opaque":
    case "lifetime":
      return false;
  }
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
