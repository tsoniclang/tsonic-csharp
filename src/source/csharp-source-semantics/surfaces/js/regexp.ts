import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpRegularExpressionLiteralFactKey,
} from "../../../csharp-facts.js";
import {
  type CsharpTargetNamedTypeRef,
  asNodeSubject,
  asType,
  csharpTargetMemberOperation,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  isSourceLibraryType,
  recordCsharpTargetOperation,
  targetMethod,
  targetParameter,
} from "./source-library.js";

const csharpJsRegExpTypeId = "Tsonic.CSharp.Js.RegExp";

type CsharpJsRegExpTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "regexp";
};

export function csharpJsRegExpTargetType(): CsharpJsRegExpTargetTypeRef {
  return {
    ...csharpTargetNamedType(csharpJsRegExpTypeId),
    csharpJsSurfaceKind: "regexp",
  } satisfies CsharpJsRegExpTargetTypeRef;
}

export function mapCsharpJsRegExpRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  recordCsharpJsRegExpLiteralFact(request.sourceTypeReference, context);
  const carrier = getCsharpJsRegExpRuntimeCarrierForSubject(request.sourceTypeReference, context) ??
    getCsharpJsRegExpRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface runtime carrier mapped from checked JavaScript library type." }]);
}

function recordCsharpJsRegExpLiteralFact(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): void {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node === undefined || ast?.is.IsRegularExpressionLiteral(node) !== true) {
    return;
  }
  const literal = parseRegularExpressionLiteral(ast.text(node));
  if (literal === undefined) {
    return;
  }
  context.facts.set(node, csharpRegularExpressionLiteralFactKey, literal, [{ message: "C# JS surface RegExp literal pattern and flags recorded from source syntax." }]);
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation("tsonic.csharp.js.regexp.literal.constructor", "constructor", "RegExp", {
    declaringType: csharpJsRegExpTargetType(),
    resultType: csharpJsRegExpTargetType(),
  }), [{ message: "C# JS surface RegExp literal constructor operation recorded from source syntax." }]);
}

function parseRegularExpressionLiteral(text: string): { readonly pattern: string; readonly flags: string } | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return {
        pattern: text.slice(1, index),
        flags: text.slice(index + 1),
      };
    }
  }
  return undefined;
}

export function getCsharpJsRegExpRuntimeCarrierForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast?.is.IsRegularExpressionLiteral(node) === true) {
    return csharpJsRegExpTargetType();
  }
  const directType = asType(subject);
  if (directType !== undefined) {
    return getCsharpJsRegExpRuntimeCarrierForType(directType, context);
  }
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  return getCsharpJsRegExpRuntimeCarrierForType(checker.getTypeAtLocation(node, { sourceFile }), context);
}

export function getCsharpJsRegExpRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceLibraryType(type, context, "RegExp")
    ? csharpJsRegExpTargetType()
    : undefined;
}

export function isCsharpJsRegExpRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsRegExpTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsRegExpTargetTypeRef).csharpJsSurfaceKind === "regexp";
}

export function getRegExpTargetMembers(sourceName: string): readonly TargetMember[] {
  const regExpType = csharpJsRegExpTargetType();
  const stringType = csharpStringTargetType();
  const boolType = csharpSourcePrimitiveTargetType("bool");
  if (sourceName === "constructor") {
    return [{
      id: "Tsonic.CSharp.Js.RegExp..ctor(System.String,System.String)",
      sourceName,
      targetName: "RegExp",
      kind: "constructor",
      parameters: [
        targetParameter("pattern", stringType),
        targetParameter("flags", stringType, { optional: true }),
      ],
      returnType: regExpType,
      declaringType: regExpType,
    }];
  }
  if (sourceName === "test") {
    return [targetMethod("Tsonic.CSharp.Js.RegExp.test", "test", "test", [
      targetParameter("value", stringType),
    ], boolType)];
  }
  return [];
}
