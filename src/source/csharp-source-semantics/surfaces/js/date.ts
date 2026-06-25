import type {
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Node,
  SourceFile,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  visitAstReaderNodes,
  asNodeSubject,
  getNodeField,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getSymbolDeclarations,
} from "../../symbol-utils.js";
import {
  type CsharpTargetNamedTypeRef,
  asType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  isSourceLibraryType,
  targetMethod,
  targetParameter,
} from "./source-library.js";
import {
  getSourceLibraryDeclarationName,
} from "../../source-library.js";

const csharpJsDateTypeId = "Tsonic.CSharp.Js.Date";

type CsharpJsDateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "date";
};

export function csharpJsDateTargetType(): CsharpJsDateTargetTypeRef {
  return {
    ...csharpTargetNamedType(csharpJsDateTypeId, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Date")),
    csharpJsSurfaceKind: "date",
  } satisfies CsharpJsDateTargetTypeRef;
}

export function mapCsharpJsDateRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsDateRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Date runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsDateRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceLibraryType(type, context, "Date")
    ? csharpJsDateTargetType()
    : undefined;
}

export function isCsharpJsDateRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsDateTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsDateTargetTypeRef).csharpJsSurfaceKind === "date";
}

export function recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsNewExpression(node) !== true || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
        return;
      }
      if (!isCheckedSourceLibraryDateConstruction(node, sourceFile, context)) {
        return;
      }
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
        carrier: csharpJsDateTargetType(),
      }, [{ message: "C# JS surface Date constructor runtime carrier recorded from checked TypeScript Date construction." }]);
    });
  }
}

function isCheckedSourceLibraryDateConstruction(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (compiler === undefined || expression === undefined) {
    return false;
  }
  const symbol = compiler.checker.getSymbolAtLocation(expression, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(expression, { sourceFile });
  return getSymbolDeclarations(symbol).some((declaration) =>
    getSourceLibraryDeclarationName(declaration, context) === "Date");
}

export function getDateTargetMembers(sourceName: string, callKind: "call" | "new"): readonly TargetMember[] {
  if (sourceName === "constructor") {
    return callKind === "new" ? dateConstructorMembers : [dateFunctionMember];
  }
  const targetMember = dateTargetMembers.get(sourceName);
  return targetMember === undefined ? [] : [targetMember];
}

function dateConstructor(
  id: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
): TargetMember {
  return {
    id,
    sourceName: "constructor",
    targetName: "Date",
    kind: "constructor",
    parameters,
    returnType: dateType,
    declaringType: dateType,
  };
}

function dateStaticMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Date.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: dateType,
    static: true,
  });
}

function dateMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  targetName = sourceName,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Date.${sourceName}`, sourceName, targetName, parameters, returnType, {
    declaringType: dateType,
  });
}

function optionalIntParameter(name: string): ReturnType<typeof targetParameter> {
  return targetParameter(name, nullableIntType, { optional: true });
}

const dateType = csharpJsDateTargetType();
const stringType = csharpStringTargetType();
const objectType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const intType = csharpSourcePrimitiveTargetType("int32");
const longType = csharpSourcePrimitiveTargetType("int64");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const nullableIntType = csharpNullableValueTargetType(intType);

const dateConstructorMembers: readonly TargetMember[] = [
  dateConstructor("Tsonic.CSharp.Js.Date..ctor()", []),
  dateConstructor("Tsonic.CSharp.Js.Date..ctor(System.Double)", [
    targetParameter("milliseconds", doubleType),
  ]),
  dateConstructor("Tsonic.CSharp.Js.Date..ctor(System.String)", [
    targetParameter("dateString", stringType),
  ]),
  dateConstructor("Tsonic.CSharp.Js.Date..ctor(System.Object)", [
    targetParameter("value", objectType),
  ]),
  dateConstructor("Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)", [
    targetParameter("year", intType),
    targetParameter("month", intType),
    targetParameter("day", intType, { optional: true }),
    targetParameter("hours", intType, { optional: true }),
    targetParameter("minutes", intType, { optional: true }),
    targetParameter("seconds", intType, { optional: true }),
    targetParameter("milliseconds", intType, { optional: true }),
  ]),
];

const dateFunctionMember = targetMethod("Tsonic.CSharp.Js.Date.call", "constructor", "call", [], stringType, {
  declaringType: dateType,
  static: true,
});

const utcParameters = [
  targetParameter("year", intType),
  targetParameter("month", intType),
  targetParameter("day", intType, { optional: true }),
  targetParameter("hours", intType, { optional: true }),
  targetParameter("minutes", intType, { optional: true }),
  targetParameter("seconds", intType, { optional: true }),
  targetParameter("milliseconds", intType, { optional: true }),
];

const dateGetterNames = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "getTimezoneOffset",
  "getUTCFullYear",
  "getUTCMonth",
  "getUTCDate",
  "getUTCDay",
  "getUTCHours",
  "getUTCMinutes",
  "getUTCSeconds",
  "getUTCMilliseconds",
] as const;

const dateStringMethodNames = [
  "toDateString",
  "toTimeString",
  "toISOString",
  "toUTCString",
  "toJSON",
  "toLocaleDateString",
  "toLocaleTimeString",
  "toLocaleString",
] as const;

const dateTargetMembers = new Map<string, TargetMember>([
  ["now", dateStaticMethod("now", [], longType)],
  ["parse", dateStaticMethod("parse", [targetParameter("dateString", stringType)], doubleType)],
  ["UTC", dateStaticMethod("UTC", utcParameters, doubleType)],
  ["getTime", dateMethod("getTime", [], longType)],
  ["valueOf", dateMethod("valueOf", [], longType)],
  ["toString", dateMethod("toString", [], stringType, "ToString")],
  ...dateGetterNames.map((name) => [name, dateMethod(name, [], intType)] as const),
  ...dateStringMethodNames.map((name) => [name, dateMethod(name, [], stringType)] as const),
  ["setTime", dateMethod("setTime", [targetParameter("milliseconds", doubleType)], doubleType)],
  ["setMilliseconds", dateMethod("setMilliseconds", [targetParameter("ms", intType)], doubleType)],
  ["setSeconds", dateMethod("setSeconds", [
    targetParameter("sec", intType),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setMinutes", dateMethod("setMinutes", [
    targetParameter("min", intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setHours", dateMethod("setHours", [
    targetParameter("hour", intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setDate", dateMethod("setDate", [targetParameter("day", intType)], doubleType)],
  ["setMonth", dateMethod("setMonth", [
    targetParameter("month", intType),
    optionalIntParameter("day"),
  ], doubleType)],
  ["setFullYear", dateMethod("setFullYear", [
    targetParameter("year", intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], doubleType)],
  ["setUTCMilliseconds", dateMethod("setUTCMilliseconds", [targetParameter("ms", intType)], doubleType)],
  ["setUTCSeconds", dateMethod("setUTCSeconds", [
    targetParameter("sec", intType),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setUTCMinutes", dateMethod("setUTCMinutes", [
    targetParameter("min", intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setUTCHours", dateMethod("setUTCHours", [
    targetParameter("hour", intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType)],
  ["setUTCDate", dateMethod("setUTCDate", [targetParameter("day", intType)], doubleType)],
  ["setUTCMonth", dateMethod("setUTCMonth", [
    targetParameter("month", intType),
    optionalIntParameter("day"),
  ], doubleType)],
  ["setUTCFullYear", dateMethod("setUTCFullYear", [
    targetParameter("year", intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], doubleType)],
]);
