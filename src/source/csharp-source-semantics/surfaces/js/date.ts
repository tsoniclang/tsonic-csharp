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
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "./target-member-metadata.js";
import {
  getSourceLibraryDeclarationName,
} from "../../source-library.js";
import {
  isSourceStandardLibraryDateType,
} from "../../source-type-classification.js";

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
  return type !== undefined && isSourceStandardLibraryDateType(type, context)
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

export function dateTargetMembersForSourceName(sourceName: string, callKind: "call" | "new"): readonly TargetMember[] {
  return dateCallKindTargetMemberIndex.get(dateCallKindKey(sourceName, callKind)) ??
    jsSurfaceTargetMembersForSourceName(dateTargetMemberIndex, sourceName);
}

function dateConstructorMetadata(
  id: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
): JsSurfaceTargetMemberMetadata {
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

function dateStaticMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Date.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateType,
    static: true,
  };
}

function dateMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  targetName = sourceName,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Date.${sourceName}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateType,
  };
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

const dateConstructorMemberMetadata = [
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor()", []),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Double)", [
    targetParameter("milliseconds", doubleType),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.String)", [
    targetParameter("dateString", stringType),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Object)", [
    targetParameter("value", objectType, { csharpAcceptsCheckedSourceArgument: true }),
  ]),
  dateConstructorMetadata("Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)", [
    targetParameter("year", intType),
    targetParameter("month", intType),
    targetParameter("day", intType, { optional: true }),
    targetParameter("hours", intType, { optional: true }),
    targetParameter("minutes", intType, { optional: true }),
    targetParameter("seconds", intType, { optional: true }),
    targetParameter("milliseconds", intType, { optional: true }),
  ]),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const dateConstructorMemberIndex = jsSurfaceTargetMemberMetadataIndex(dateConstructorMemberMetadata);
const dateConstructorMembers = jsSurfaceTargetMembersForSourceName(dateConstructorMemberIndex, "constructor");

const dateFunctionMember = jsSurfaceTargetMembersForSourceName(jsSurfaceTargetMemberMetadataIndex([{
  id: "Tsonic.CSharp.Js.Date.call",
  sourceName: "constructor",
  targetName: "call",
  kind: "method",
  parameters: [],
  returnType: stringType,
  declaringType: dateType,
  static: true,
}] satisfies readonly JsSurfaceTargetMemberMetadata[]), "constructor");
const dateCallKindTargetMemberIndex = new Map<string, readonly TargetMember[]>([
  [dateCallKindKey("constructor", "call"), dateFunctionMember],
  [dateCallKindKey("constructor", "new"), dateConstructorMembers],
]);

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

const dateTargetMemberMetadata = [
  dateStaticMethodMetadata("now", [], longType),
  dateStaticMethodMetadata("parse", [targetParameter("dateString", stringType)], doubleType),
  dateStaticMethodMetadata("UTC", utcParameters, doubleType),
  dateMethodMetadata("getTime", [], longType),
  dateMethodMetadata("valueOf", [], longType),
  dateMethodMetadata("toString", [], stringType, "ToString"),
  ...dateGetterNames.map((sourceName) => dateMethodMetadata(sourceName, [], intType)),
  ...dateStringMethodNames.map((sourceName) => dateMethodMetadata(sourceName, [], stringType)),
  dateMethodMetadata("setTime", [targetParameter("milliseconds", doubleType)], doubleType),
  dateMethodMetadata("setMilliseconds", [targetParameter("ms", intType)], doubleType),
  dateMethodMetadata("setSeconds", [
    targetParameter("sec", intType),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setMinutes", [
    targetParameter("min", intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setHours", [
    targetParameter("hour", intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setDate", [targetParameter("day", intType)], doubleType),
  dateMethodMetadata("setMonth", [
    targetParameter("month", intType),
    optionalIntParameter("day"),
  ], doubleType),
  dateMethodMetadata("setFullYear", [
    targetParameter("year", intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], doubleType),
  dateMethodMetadata("setUTCMilliseconds", [targetParameter("ms", intType)], doubleType),
  dateMethodMetadata("setUTCSeconds", [
    targetParameter("sec", intType),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setUTCMinutes", [
    targetParameter("min", intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setUTCHours", [
    targetParameter("hour", intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], doubleType),
  dateMethodMetadata("setUTCDate", [targetParameter("day", intType)], doubleType),
  dateMethodMetadata("setUTCMonth", [
    targetParameter("month", intType),
    optionalIntParameter("day"),
  ], doubleType),
  dateMethodMetadata("setUTCFullYear", [
    targetParameter("year", intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], doubleType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const dateTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(dateTargetMemberMetadata);

function dateCallKindKey(sourceName: string, callKind: "call" | "new"): string {
  return `${sourceName}\u0000${callKind}`;
}
