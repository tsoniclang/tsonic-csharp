import {
  defaultValueFactKey,
  fieldFactKey,
  functionPointerFactKey,
  pointerFactKey,
  structFactKey,
} from "@tsonic/tsts";
import { tsonicFixedArrayFactKey } from "@tsonic/source-core/facts";
import type {
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";

export interface CsharpSourceDefaultValue {
  readonly kind: "csharp-default-value";
  readonly sourceType: Node;
}

export interface CsharpSourceField {
  readonly sourceName: string;
  readonly sourceType: Node;
  readonly readonly: boolean;
}

export interface CsharpSourceStruct {
  readonly kind: "csharp-struct";
  readonly valueType: boolean;
  readonly fields: readonly CsharpSourceField[];
}

export interface CsharpSourcePointerType {
  readonly kind: "csharp-typed-location";
  readonly sourcePointee: Node;
  readonly mutability: "readonly" | "readwrite" | "unspecified";
}

export interface CsharpSourceFunctionPointerType {
  readonly kind: "csharp-function-pointer";
  readonly sourceParameters: readonly Node[];
  readonly sourceResult: Node;
  readonly abi: readonly string[];
}

export interface CsharpSourceFixedArrayType {
  readonly kind: "csharp-fixed-array";
  readonly sourceElementType: Node;
  readonly length: number;
}

export function readCsharpSourceDefaultValue(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceDefaultValue | undefined {
  const fact = sourceFacts?.getFact(subject, defaultValueFactKey);
  return fact === undefined
    ? undefined
    : Object.freeze({
        kind: "csharp-default-value",
        sourceType: fact.type,
      });
}

export function readCsharpSourceField(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): CsharpSourceField | undefined {
  for (const subject of subjects) {
    const fact = sourceFacts?.getFact(subject, fieldFactKey);
    if (fact !== undefined) {
      return csharpSourceField(fact.name, fact.type, fact.readonly === true);
    }
  }
  return undefined;
}

export function readCsharpSourceStruct(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceStruct | undefined {
  const fact = sourceFacts?.getFact(subject, structFactKey);
  return fact === undefined
    ? undefined
    : Object.freeze({
        kind: "csharp-struct",
        valueType: fact.valueType,
        fields: Object.freeze(
          (fact.fields ?? []).map((field) =>
            csharpSourceField(
              field.name,
              field.type,
              field.readonly === true,
            )
          ),
        ),
      });
}

export function readCsharpSourcePointerType(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourcePointerType | undefined {
  const fact = sourceFacts?.getFact(subject, pointerFactKey);
  return fact === undefined
    ? undefined
    : Object.freeze({
        kind: "csharp-typed-location",
        sourcePointee: fact.pointee,
        mutability: fact.mutability,
      });
}

export function readCsharpSourceFunctionPointerType(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceFunctionPointerType | undefined {
  const fact = sourceFacts?.getFact(subject, functionPointerFactKey);
  return fact === undefined
    ? undefined
    : Object.freeze({
        kind: "csharp-function-pointer",
        sourceParameters: Object.freeze([...fact.parameters]),
        sourceResult: fact.result,
        abi: Object.freeze([...fact.abi]),
      });
}

export function readCsharpSourceFixedArrayType(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceFixedArrayType | undefined {
  const fact = sourceFacts?.getFact(subject, tsonicFixedArrayFactKey);
  return fact === undefined
    ? undefined
    : Object.freeze({
        kind: "csharp-fixed-array",
        sourceElementType: fact.elementType,
        length: fact.length,
      });
}

function csharpSourceField(
  sourceName: string,
  sourceType: Node,
  readonly: boolean,
): CsharpSourceField {
  return Object.freeze({ sourceName, sourceType, readonly });
}
