import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Type,
} from "@tsonic/tsts";
import {
  csharpAnyRuntimeCarrier,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  asNodeSubject,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  asType,
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  getCallableExpressionTargetTypeRef,
} from "./callable-target-types.js";
import {
  recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects,
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects,
} from "./runtime-carrier-object-shapes.js";
import {
  subjectIsSourceCoreStructDeclarationPayload,
} from "./object-shape-recorded-facts.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";

export function mapRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  if (subjectIsSourceCoreStructDeclarationPayload(request.sourceTypeReference, context)) {
    return deferObservation;
  }
  const callableCarrier = getCallableRuntimeCarrier(request, context, host);
  if (callableCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: callableCarrier,
    }, [{ message: "C# callable runtime carrier mapped from checked TSTS signature and source parameter facts." }]);
  }
  const requestType = asType(request.type);
  if (isAnyRuntimeCarrierType(requestType, context)) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: csharpAnyRuntimeCarrier(),
    }, [{ message: "C# opaque any runtime carrier recorded from explicit TypeScript any boundary; dynamic behavior requires separate finalized target facts." }]);
  }
  const primitive = (request.sourceTypeReference === undefined ? undefined : context.factResolver.resolve(request.sourceTypeReference, sourcePrimitiveFactKey)) ??
    (request.sourceTypeSymbol === undefined ? undefined : context.factResolver.resolve(request.sourceTypeSymbol, sourcePrimitiveFactKey));
  const syntaxCarrier = request.sourceTypeReference === undefined
    ? undefined
    : host.getTargetTypeRefForSubject(request.sourceTypeReference, context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false });
  const typeSyntaxCarrier = syntaxCarrier ??
    getTypeSyntaxCarrierFromFinalizedTypeFacts(request, context, host);
  if (typeSyntaxCarrier !== undefined) {
    recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, typeSyntaxCarrier, host);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: typeSyntaxCarrier,
    }, [{ message: "C# runtime carrier mapped from source syntax/provider facts." }]);
  }
  const commonUnionCarrier = getCommonNonNullishUnionRuntimeCarrier(request, context, host);
  if (commonUnionCarrier !== undefined) {
    if (commonUnionCarrier.objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, commonUnionCarrier.objectShape);
    }
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: commonUnionCarrier.carrier,
    }, [{ message: "C# non-nullish union runtime carrier mapped from identical finalized constituent carriers." }]);
  }
  const runtimeUnionCarrier = getNonNullishRuntimeUnionCarrier(request, context, host);
  if (runtimeUnionCarrier !== undefined) {
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: runtimeUnionCarrier,
    }, [{ message: "C# runtime union carrier mapped from TSTS union constituents and finalized constituent carrier facts." }]);
  }
  if (primitive === undefined) {
    if (isCallableTypeWithoutCarrierEvidence(request, context)) {
      return deferObservation;
    }
    const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
      host.getRecordedCsharpObjectShapeFactForSubject(request.type, context);
    if (objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
      return acceptObservation<RuntimeCarrierFactResult>({
        carrier: objectShape.targetType,
      }, [{ message: "C# runtime carrier mapped from finalized structural object-shape facts." }]);
    }
    const carrier = host.getTargetTypeRefForType(requestType, context, { allowRuntimeCarrier: false });
    return carrier === undefined
      ? deferObservation
      : acceptObservation<RuntimeCarrierFactResult>({
          carrier,
        }, [{ message: "C# runtime carrier mapped from checked TSTS type shape." }]);
  }
  return acceptObservation<RuntimeCarrierFactResult>({
    carrier: csharpSourcePrimitiveTargetType(primitive.kind),
  }, [{ message: "C# runtime carrier mapped from source primitive fact." }]);
}

function getNonNullishRuntimeUnionCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const compiler = context.compiler;
  const type = asType(request.type);
  if (compiler === undefined || type === undefined || !compiler.types.isUnion(type)) {
    return undefined;
  }
  const members = compiler.types.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined);
  const nonNullishMembers = members.filter((member) => !compiler.types.isNullish(member));
  if (nonNullishMembers.length < 2 || nonNullishMembers.length !== members.length) {
    return undefined;
  }
  const memberCarriers = nonNullishMembers.map((member) => getUnionConstituentRuntimeCarrier(member, context, host)?.carrier);
  if (!memberCarriers.every((member): member is RuntimeCarrierFactResult["carrier"] => member !== undefined)) {
    return undefined;
  }
  if (containsDuplicateTargetCarrier(memberCarriers)) {
    return undefined;
  }
  return csharpRuntimeUnionTargetType(memberCarriers);
}

function isAnyRuntimeCarrierType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): boolean {
  return type !== undefined && context.compiler?.types.isAny(type) === true;
}

interface CommonUnionRuntimeCarrier {
  readonly carrier: RuntimeCarrierFactResult["carrier"];
  readonly objectShape?: CsharpObjectShapeFact;
}

function getCommonNonNullishUnionRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): CommonUnionRuntimeCarrier | undefined {
  const compiler = context.compiler;
  const type = asType(request.type);
  if (compiler === undefined || type === undefined || !compiler.types.isUnion(type)) {
    return undefined;
  }
  const members = compiler.types.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined);
  const nonNullishMembers = members.filter((member) => !compiler.types.isNullish(member));
  if (nonNullishMembers.length < 2 || nonNullishMembers.length !== members.length) {
    return undefined;
  }
  const memberCarriers = nonNullishMembers.map((member) => getUnionConstituentRuntimeCarrier(member, context, host));
  if (!memberCarriers.every((member): member is CommonUnionRuntimeCarrier => member !== undefined)) {
    return undefined;
  }
  const first = memberCarriers[0];
  if (first === undefined || !memberCarriers.every((member) => targetTypeRefEquals(first.carrier, member.carrier))) {
    return undefined;
  }
  const objectShape = getCommonUnionObjectShape(memberCarriers.map((member) => member.objectShape));
  return {
    carrier: first.carrier,
    ...(objectShape === undefined ? {} : { objectShape }),
  };
}

function getUnionConstituentRuntimeCarrier(
  type: Type,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): CommonUnionRuntimeCarrier | undefined {
  const runtimeCarrier = context.factResolver.resolve(type, runtimeCarrierFactKey)?.carrier;
  const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(type, context);
  const carrier = runtimeCarrier ??
    objectShape?.targetType ??
    host.getTargetTypeRefForType(type, context, { allowRuntimeCarrier: true });
  return carrier === undefined
    ? undefined
    : {
        carrier,
        ...(objectShape !== undefined && targetTypeRefEquals(objectShape.targetType, carrier) ? { objectShape } : {}),
      };
}

function getCommonUnionObjectShape(
  objectShapes: readonly (CsharpObjectShapeFact | undefined)[],
): CsharpObjectShapeFact | undefined {
  const first = objectShapes[0];
  return first !== undefined && objectShapes.every((objectShape) => objectShape !== undefined && objectShapeFactEquals(first, objectShape))
    ? first
    : undefined;
}

function objectShapeFactEquals(left: CsharpObjectShapeFact, right: CsharpObjectShapeFact): boolean {
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    targetTypeRefArrayEquals(left.implements, right.implements) &&
    left.constructible === right.constructible &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => {
      const other = right.members[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.readonly === other.readonly &&
        targetTypeRefEquals(member.type, other.type);
    });
}

function targetTypeRefArrayEquals(
  left: readonly RuntimeCarrierFactResult["carrier"][] | undefined,
  right: readonly RuntimeCarrierFactResult["carrier"][] | undefined,
): boolean {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  return leftItems.length === rightItems.length &&
    leftItems.every((item, index) => {
      const other = rightItems[index];
      return other !== undefined && targetTypeRefEquals(item, other);
    });
}

function containsDuplicateTargetCarrier(carriers: readonly RuntimeCarrierFactResult["carrier"][]): boolean {
  return carriers.some((carrier, index) =>
    carriers.slice(index + 1).some((candidate) => targetTypeRefEquals(carrier, candidate))
  );
}

function getTypeSyntaxCarrierFromFinalizedTypeFacts(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(request.sourceTypeReference);
  return ast !== undefined && node !== undefined && isTypeSyntaxNode(ast, node)
    ? host.getTargetTypeRefForSubject(node, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false })
    : undefined;
}

function isCallableTypeWithoutCarrierEvidence(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): boolean {
  const compiler = context.compiler;
  const type = asType(request.type);
  return compiler !== undefined &&
    type !== undefined &&
    compiler.types.getCallSignatures(type).length > 0;
}

function getCallableRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
) {
  const compiler = context.compiler;
  const node = asNodeSubject(request.sourceTypeReference);
  const type = asType(request.type);
  if (compiler === undefined || node === undefined || type === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  return sourceFile === undefined
    ? undefined
    : getCallableExpressionTargetTypeRef(node, type, sourceFile, context, host);
}
