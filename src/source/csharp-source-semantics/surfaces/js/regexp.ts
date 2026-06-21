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
  asNodeSubject,
  asType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  isSourceLibraryType,
  targetMethod,
  targetParameter,
} from "./source-library.js";

export const csharpJsRegExpTypeId = "Tsonic.CSharp.Js.RegExp";

export function mapCsharpJsRegExpRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsRegExpRuntimeCarrierForSubject(request.sourceTypeReference, context) ??
    getCsharpJsRegExpRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsRegExpRuntimeCarrierForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast?.is.IsRegularExpressionLiteral(node) === true) {
    return csharpTargetNamedType(csharpJsRegExpTypeId);
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
    ? csharpTargetNamedType(csharpJsRegExpTypeId)
    : undefined;
}

export function isCsharpJsRegExpRuntimeCarrier(type: TargetTypeRef | undefined): type is TargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsRegExpTypeId;
}

export function getRegExpTargetMembers(sourceName: string): readonly TargetMember[] {
  const regExpType = csharpTargetNamedType(csharpJsRegExpTypeId);
  const stringType = csharpTargetNamedType("System.String");
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
