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
  csharpSourcePrimitiveTargetType,
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
  const argumentTypes = request.arguments.map((argument) =>
    host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: true,
    }));
  const invalidArgumentIndex = argumentTypes.findIndex((type) => !isClosedConsoleArgumentTargetType(type));
  if (invalidArgumentIndex >= 0) {
    return rejectObservation(host.csharpProviderDiagnostic(
      host.extensionId,
      "CSHARP_JS_CONSOLE_ARGUMENT_REQUIRES_TARGET_FACT",
      9100140,
      `C# JS surface console call '${sourceMember.id}' requires finalized closed target facts for argument ${invalidArgumentIndex + 1}.`,
    ));
  }
  if (!consoleArgumentsMatchMember(member, argumentTypes)) {
    return rejectObservation(host.csharpProviderDiagnostic(
      host.extensionId,
      "CSHARP_JS_CONSOLE_ARGUMENT_REQUIRES_TARGET_FACT",
      9100140,
      `C# JS surface console call '${sourceMember.id}' requires finalized argument facts compatible with the selected runtime member shape.`,
    ));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface console call selected from checked TypeScript standard-library declaration '${sourceMember.id}'.` }]);
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

function consoleArgumentsMatchMember(
  member: TargetMember,
  argumentTypes: readonly (TargetTypeRef | undefined)[],
): boolean {
  const required = member.parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = member.parameters.some((parameter) => parameter.paramsArray === true);
  if (argumentTypes.length < required || (!hasParamsArray && argumentTypes.length > member.parameters.length)) {
    return false;
  }
  for (let index = 0; index < argumentTypes.length; index += 1) {
    const parameter = member.parameters[index] ?? member.parameters[member.parameters.length - 1];
    const argumentType = argumentTypes[index];
    if (parameter === undefined || argumentType === undefined) {
      return false;
    }
    const expected = parameter.paramsArray === true && parameter.type.kind === "array"
      ? parameter.type.element
      : parameter.type;
    if (!consoleArgumentMatchesExpectedTargetType(argumentType, expected)) {
      return false;
    }
  }
  return true;
}

function consoleArgumentMatchesExpectedTargetType(
  actual: TargetTypeRef,
  expected: TargetTypeRef,
): boolean {
  if (expected.kind === "target-named" && expected.id === "System.Object") {
    return isClosedConsoleArgumentTargetType(actual);
  }
  if (actual.kind !== expected.kind) {
    return false;
  }
  switch (expected.kind) {
    case "source-primitive":
      return actual.kind === "source-primitive" && actual.name === expected.name;
    case "target-named":
      return actual.kind === "target-named" && actual.id === expected.id;
    case "target-specific":
      return actual.kind === "target-specific" && actual.target === expected.target && actual.name === expected.name;
    case "array":
      return actual.kind === "array" && consoleArgumentMatchesExpectedTargetType(actual.element, expected.element);
    case "tuple":
      return actual.kind === "tuple" &&
        actual.elements.length === expected.elements.length &&
        actual.elements.every((element, index) => {
          const expectedElement = expected.elements[index];
          return expectedElement !== undefined && consoleArgumentMatchesExpectedTargetType(element, expectedElement);
        });
    case "pointer":
      return actual.kind === "pointer" && consoleArgumentMatchesExpectedTargetType(actual.pointee, expected.pointee);
    case "function-pointer":
      return actual.kind === "function-pointer" &&
        consoleArgumentMatchesExpectedTargetType(actual.result, expected.result) &&
        actual.args.length === expected.args.length &&
        actual.args.every((argument, index) => {
          const expectedArgument = expected.args[index];
          return expectedArgument !== undefined && consoleArgumentMatchesExpectedTargetType(argument, expectedArgument);
        });
    case "associated-type":
      return actual.kind === "associated-type" && consoleArgumentMatchesExpectedTargetType(actual.owner, expected.owner);
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
].map((name) => [name, consoleMethod(name)] as const));

consoleTargetMembers.set("clear", consoleMethod("clear", []));
consoleTargetMembers.set("groupEnd", consoleMethod("groupEnd", []));
consoleTargetMembers.set("assert", consoleMethod("assert", [
  targetParameter("condition", csharpSourcePrimitiveTargetType("bool")),
  optionalStringParameter("message"),
]));
consoleTargetMembers.set("dir", consoleMethod("dir", [targetParameter("obj", objectTargetType)]));
consoleTargetMembers.set("dirxml", consoleMethod("dirxml", [targetParameter("obj", objectTargetType)]));
consoleTargetMembers.set("table", consoleMethod("table", [targetParameter("data", objectTargetType)]));
consoleTargetMembers.set("time", consoleMethod("time", [optionalStringParameter("label")]));
consoleTargetMembers.set("timeEnd", consoleMethod("timeEnd", [optionalStringParameter("label")]));
consoleTargetMembers.set("timeLog", consoleMethod("timeLog", [
  optionalStringParameter("label"),
  consoleDataParameter(),
]));
consoleTargetMembers.set("count", consoleMethod("count", [optionalStringParameter("label")]));
consoleTargetMembers.set("countReset", consoleMethod("countReset", [optionalStringParameter("label")]));
