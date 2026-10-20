import type { CsharpTargetMember, CsharpTargetParameter, TargetTypeRef } from "../../../types/index.js";
import { csharpDelegateTargetType, csharpEnumerableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpCollectionElementTargetType, getCsharpDelegateSignature, getCsharpJsArrayElementTargetType, targetTypeRefEquals } from "../../../../target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import type { CsharpSourceProfileCallPolicy } from "../../../model/source-profiles.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { selectCsharpArrayCopy } from "./array-copy.js";
import { csharpArrayLikeElement } from "../../../../target-model/types/carriers/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { jsRuntimeTargetType, staticMethod, targetParameter } from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const stringType = csharpStringTargetType();
const arrayStaticsType = jsRuntimeTargetType("JSArrayStatics");

export function arrayOfMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const element = arrayOfElementType(context);
  return element === undefined
    ? undefined
    : staticMethod(
        "Tsonic.CSharp.Js.JSArrayStatics.of",
        "of",
        "of",
        arrayStaticsType,
        [targetParameter("items", { kind: "array", element }, { paramsArray: true })],
        csharpJsArrayTargetType(element),
        { typeParameters: [{ name: "T", csharpAllowsRefLike: false }] },
      );
}

export function arrayFromMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayFromShape(context);
  if (shape === undefined) {
    return undefined;
  }
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
  const isJsArray = getCsharpJsArrayElementTargetType(argument) !== undefined;
  const isArrayUnion = getCsharpRuntimeUnionArms(argument, context.host.typeDefinitions) !== undefined;
  const copy = isJsArray || isArrayUnion ? selectCsharpArrayCopy(context) : undefined;
  if ((isJsArray || isArrayUnion) && copy === undefined) return undefined;
  if (copy?.method === "CopyDense" && context.source.sourceSelectedSignatureParameters.length !== 1) return undefined;
  const parameters: CsharpTargetParameter[] = [
    targetParameter(
      "arrayLike",
      copy?.sourceType ?? (sourceIsString(context)
        ? stringType
        : csharpEnumerableTargetType(shape.sourceElement)),
    ),
  ];
  if (context.source.sourceSelectedSignatureParameters.length === 2) {
    parameters.push(targetParameter(
      "mapfn",
      csharpDelegateTargetType(
        "System.Func",
        [shape.sourceElement, intType],
        shape.resultElement,
      ),
    ));
  }
  return staticMethod(
    `Tsonic.CSharp.Js.${copy?.method === "CopyDense" ? "ArrayLike" : "JSArrayStatics"}.${copy?.method ?? "from"}`,
    "from",
    copy?.method ?? "from",
    copy?.method === "CopyDense" ? jsRuntimeTargetType("ArrayLike") : arrayStaticsType,
    parameters,
    shape.resultType,
    {
      typeParameters: arrayFromTypeParameterNames(context)
        .map((name) => ({ name, csharpAllowsRefLike: false })),
    },
  );
}

export function arrayOfTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const element = arrayOfElementType(context);
  return element === undefined ? undefined : [element];
}

function arrayOfElementType(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): TargetTypeRef | undefined {
  const selected = context.source.sourceSelectedMethodTypeArguments ?? [];
  const explicit = selected.length === 1 &&
      selected[0]?.explicitTypeNode !== undefined
    ? context.inputs.selectedType.get(selected[0].explicitTypeNode, selected[0].selectedType)
    : undefined;
  if (explicit !== undefined) {
    return explicit;
  }
  const argumentTypes = context.source.sourceArguments.map((argument) =>
    resolveCsharpSelectedSourceValue(context, argument)
  );
  if (
    argumentTypes.length > 0 &&
    argumentTypes[0] !== undefined &&
    argumentTypes.every((argument) =>
      argument !== undefined && targetTypeRefEquals(argument, argumentTypes[0]!)
    )
  ) {
    return argumentTypes[0];
  }
  return resolvedMethodTypeArguments(context)[0];
}

function arrayFromShape(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): {
  readonly sourceElement: TargetTypeRef;
  readonly resultElement: TargetTypeRef;
  readonly resultType: TargetTypeRef;
} | undefined {
  const sourceArgument = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  const sourceElement = sourceIsString(context)
    ? stringType
    : getCsharpCollectionElementTargetType(sourceArgument) ?? csharpArrayLikeElement(sourceArgument, context.host.typeDefinitions);
  if (sourceElement === undefined) {
    return undefined;
  }
  const mapper = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[1],
  );
  const mappedResult = getCsharpDelegateSignature(mapper)?.returnType;
  const selectedArguments = resolvedMethodTypeArguments(context);
  const selectedResults = context.source.sourceSelectedMethodTypeArguments ?? [];
  const selectedResult = selectedResults[selectedResults.length - 1];
  const resultElement = context.source.sourceArguments.length === 1
    ? sourceElement
    : selectedResult?.explicitTypeNode === undefined
      ? mappedResult ?? selectedArguments[selectedArguments.length - 1]
      : context.inputs.selectedType.get(selectedResult.explicitTypeNode, selectedResult.selectedType);
  return resultElement === undefined
    ? undefined
    : {
        sourceElement,
        resultElement,
        resultType: csharpJsArrayTargetType(resultElement),
      };
}

export function arrayFromTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const shape = arrayFromShape(context);
  const copy = selectCsharpArrayCopy(context);
  if (copy !== undefined && shape !== undefined) {
    return context.source.sourceSelectedSignatureParameters.length === 1
      ? copy.typeArguments : [...copy.typeArguments, shape.resultElement];
  }
  return shape === undefined
    ? undefined
    : sourceIsString(context)
      ? context.source.sourceSelectedSignatureParameters.length === 1
        ? []
        : [shape.resultElement]
      : context.source.sourceSelectedSignatureParameters.length === 1
        ? [shape.sourceElement]
        : [shape.sourceElement, shape.resultElement];
}

function arrayFromTypeParameterNames(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly string[] {
  const copy = selectCsharpArrayCopy(context);
  if (copy !== undefined) {
    return [
      ...copy.typeArguments.map((_, index) => `TSource${index}`),
      ...(context.source.sourceSelectedSignatureParameters.length === 1 ? [] : ["TResult"]),
    ];
  }
  return sourceIsString(context)
    ? context.source.sourceSelectedSignatureParameters.length === 1
      ? []
      : ["TResult"]
    : context.source.sourceSelectedSignatureParameters.length === 1
      ? ["TSource"]
      : ["TSource", "TResult"];
}

function sourceIsString(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): boolean {
  const source = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  return source?.kind === "target-named" && source.id === "System.String";
}

export function resolvedMethodTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] {
  return (context.source.sourceSelectedMethodTypeArguments ?? []).flatMap(
    (argument) => {
      const resolved = context.inputs.selectedType.get(argument.explicitTypeNode, argument.selectedType);
      return resolved === undefined ? [] : [resolved];
    },
  );
}
