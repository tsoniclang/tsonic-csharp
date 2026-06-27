import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "./target-member-metadata.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

const objectRuntimeTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Object", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Object"));
const jsObjectCarrierType = csharpTargetNamedType("Tsonic.CSharp.Js.JSObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSObject"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const objectMemberTypeParameter = { kind: "type-parameter" as const, name: "T" };
type ObjectTargetParameter = ReturnType<typeof targetParameter>;
export type ObjectRecordDictionaryOperation = "keys" | "values" | "entries";

interface ObjectRuntimeMethodRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ObjectTargetParameter[];
  readonly returnType: TargetTypeRef;
}

interface ObjectHelperMethodRow {
  readonly id: string;
  readonly sourceName: "keys" | "values" | "entries";
  readonly targetName: string;
  readonly valueType: TargetTypeRef;
  readonly returnElementType: TargetTypeRef;
}

interface JsObjectInstanceMethodRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ObjectTargetParameter[];
  readonly returnType: TargetTypeRef;
}

interface ObjectRecordDictionaryOperationRow {
  readonly id: string;
  readonly sourceName: ObjectRecordDictionaryOperation;
  readonly targetName: string;
  readonly returnElement: "key" | "value" | "entry";
}

export function csharpJsObjectCarrierTargetType(): TargetTypeRef {
  return jsObjectCarrierType;
}

export function isCsharpJsObjectCarrierTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsObjectCarrierType.id;
}

function objectRuntimeMethod(row: ObjectRuntimeMethodRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: objectRuntimeTargetType,
    static: true,
  };
}

function objectHelperMethod(row: ObjectHelperMethodRow): JsSurfaceTargetMemberMetadata {
  return objectRuntimeMethod({
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    parameters: [targetParameter("value", row.valueType)],
    returnType: csharpListTargetType(row.returnElementType),
  });
}

export function objectRecordDictionaryTargetMembersForOperation(
  operation: "keys" | "values" | "entries",
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
): readonly TargetMember[] {
  const valueType = dictionaryType.typeArguments?.[1];
  const operationRow = objectRecordDictionaryOperationRows[operation];
  if (valueType === undefined || operationRow === undefined) {
    return [];
  }
  return [objectHelperMethod({
    id: operationRow.id,
    sourceName: operationRow.sourceName,
    targetName: operationRow.targetName,
    valueType: dictionaryType,
    returnElementType: objectRecordDictionaryReturnElementType(operationRow.returnElement, valueType),
  })].map(jsSurfaceTargetMemberFromMetadata);
}

function jsObjectInstanceMethod(row: JsObjectInstanceMethodRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: jsObjectCarrierType,
  };
}

const objectTargetMemberMetadata = [
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.keys:jsobject", sourceName: "keys", targetName: "keys", valueType: jsObjectCarrierType, returnElementType: csharpStringTargetType() }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.keys:jsarray", sourceName: "keys", targetName: "keys", valueType: csharpJsArrayCarrierTargetType(objectMemberTypeParameter), returnElementType: csharpStringTargetType() }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.keys:string", sourceName: "keys", targetName: "keys", valueType: csharpStringTargetType(), returnElementType: csharpStringTargetType() }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.values:jsobject", sourceName: "values", targetName: "values", valueType: jsObjectCarrierType, returnElementType: objectTargetType }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.values:jsarray", sourceName: "values", targetName: "values", valueType: csharpJsArrayCarrierTargetType(objectMemberTypeParameter), returnElementType: objectMemberTypeParameter }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.values:string", sourceName: "values", targetName: "values", valueType: csharpStringTargetType(), returnElementType: csharpStringTargetType() }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.entries:jsobject", sourceName: "entries", targetName: "entries", valueType: jsObjectCarrierType, returnElementType: { kind: "tuple", elements: [csharpStringTargetType(), objectTargetType] } }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.entries:jsarray", sourceName: "entries", targetName: "entries", valueType: csharpJsArrayCarrierTargetType(objectMemberTypeParameter), returnElementType: { kind: "tuple", elements: [csharpStringTargetType(), objectMemberTypeParameter] } }),
  objectHelperMethod({ id: "Tsonic.CSharp.Js.Object.entries:string", sourceName: "entries", targetName: "entries", valueType: csharpStringTargetType(), returnElementType: { kind: "tuple", elements: [csharpStringTargetType(), csharpStringTargetType()] } }),
  objectRuntimeMethod({
    id: "Tsonic.CSharp.Js.Object.assign",
    sourceName: "assign",
    targetName: "assign",
    parameters: [
      targetParameter("target", jsObjectCarrierType),
      targetParameter("sources", jsObjectCarrierType, { paramsArray: true }),
    ],
    returnType: jsObjectCarrierType,
  }),
  objectRuntimeMethod({
    id: "Tsonic.CSharp.Js.Object.hasOwn",
    sourceName: "hasOwn",
    targetName: "hasOwn",
    parameters: [
      targetParameter("value", jsObjectCarrierType),
      targetParameter("key", csharpStringTargetType()),
    ],
    returnType: csharpSourcePrimitiveTargetType("bool"),
  }),
  jsObjectInstanceMethod({
    id: "Tsonic.CSharp.Js.JSObject.hasOwnProperty",
    sourceName: "hasOwnProperty",
    targetName: "hasOwnProperty",
    parameters: [targetParameter("key", csharpStringTargetType())],
    returnType: csharpSourcePrimitiveTargetType("bool"),
  }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const objectTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Object", objectTargetMemberMetadata);

const objectRecordDictionaryOperationRows = {
  keys: {
    id: "Tsonic.CSharp.Js.Object.keys:dictionary",
    sourceName: "keys",
    targetName: "keys",
    returnElement: "key",
  },
  values: {
    id: "Tsonic.CSharp.Js.Object.values:dictionary",
    sourceName: "values",
    targetName: "values",
    returnElement: "value",
  },
  entries: {
    id: "Tsonic.CSharp.Js.Object.entries:dictionary",
    sourceName: "entries",
    targetName: "entries",
    returnElement: "entry",
  },
} satisfies Record<ObjectRecordDictionaryOperation, ObjectRecordDictionaryOperationRow>;

function objectRecordDictionaryReturnElementType(
  returnElement: ObjectRecordDictionaryOperationRow["returnElement"],
  valueType: TargetTypeRef,
): TargetTypeRef {
  switch (returnElement) {
    case "key":
      return csharpStringTargetType();
    case "value":
      return valueType;
    case "entry":
      return { kind: "tuple", elements: [csharpStringTargetType(), valueType] };
  }
}
