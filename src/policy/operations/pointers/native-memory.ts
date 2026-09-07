import type { AstReader, ExtensionFactSubject, Node, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import { countTsonicMemoryLayoutValues, selectTsonicRawLocationOperation } from "@tsonic/source-core/facts";
import type { TsonicMemoryLayoutFact, TsonicRawLocationSelection } from "@tsonic/source-core/facts";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { readCsharpSourceStruct } from "../../types/resolution/source-markers.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../../types/callables/member-substitution.js";
import { csharpRuntimeLocationPointee, csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType, isCsharpRuntimeUndefinedTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType, csharpNullableReferenceTargetType } from "../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpPolicyContext } from "../../context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTargetBindingFact } from "../../../target-model/types/model.js";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";

export function readCsharpRawLocation(ast: AstReader, facts: ReadonlySourceFactResolver | undefined, subject: ExtensionFactSubject): TsonicRawLocationSelection | undefined {
  return facts === undefined ? undefined : selectTsonicRawLocationOperation(ast, facts, subject);
}

export function selectCsharpNativeMemoryLayout(
  input: CsharpPolicyContext, layout: TsonicMemoryLayoutFact, sourceFile: SourceFile,
  selected = new Map<TsonicMemoryLayoutFact, CsharpNativeMemoryLayout | undefined>(),
): CsharpNativeMemoryLayout | undefined {
  if (selected.size === 0 && countTsonicMemoryLayoutValues(layout, 131_072) === undefined) return undefined;
  if (selected.has(layout)) return selected.get(layout);
  selected.set(layout, undefined);
  const pointeeType = input.types.resolveSelectedType(layout.explicitTypeNode, layout.sourceType, sourceFile);
  if (pointeeType === undefined) return undefined;
  const sizes: Readonly<Partial<Record<string, number>>> = {
    int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4,
    int64: 8, uint64: 8, int128: 16, uint128: 16, float16: 2, float32: 4, float64: 8,
    "native-int": layout.dataLayout.addressWidth / 8, "native-uint": layout.dataLayout.addressWidth / 8,
  };
  const fields: import("../../../target-model/operations/native-memory.js").CsharpNativeMemoryField[] = [];
  if (pointeeType.kind === "source-primitive") {
    if (layout.fields.length !== 0 || sizes[pointeeType.name] !== layout.byteSize) return undefined;
  } else {
    if (pointeeType.kind !== "target-named") return undefined;
    const queries = input.semantics(sourceFile);
    const properties = queries.types.propertyInfos(layout.sourceType);
    const project = input.projectTypes.catalog.definitionForTarget(pointeeType);
    const sourceStruct = project?.kind === "struct"
      ? readCsharpSourceStruct(input.sourceFacts, project.declaration) : undefined;
    const usedFields = new Set<string>();
    const targetFields = csharpTargetBindingFact(input.providers.findTargetBindingByTargetId(pointeeType.id));
    const completeFields: readonly string[] | undefined = sourceStruct?.valueType
      ? sourceStruct.fields.map(field => field.sourceName)
      : targetFields?.kind === "struct" ? targetFields.csharpNativeMemoryFieldIds : undefined;
    if (completeFields === undefined || new Set(completeFields).size !== completeFields.length) return undefined;
    for (const field of layout.fields) {
      const property = properties.find(candidate => candidate.symbol === field.selectedSymbol ||
        candidate.rootSymbols.includes(field.selectedSymbol!) ||
        queries.declarations.symbolDeclarations(candidate.symbol).includes(field.selectedDeclaration));
      if (property === undefined || property.optional) return undefined;
      const child = selectCsharpNativeMemoryLayout(input, field.fieldLayout,
        input.ast.getSourceFile(field.fieldLayout.call) ?? sourceFile, selected);
      if (child === undefined) return undefined;
      let name: string;
      let identity: string;
      let type: TargetTypeRef | undefined;
      if (sourceStruct?.valueType) {
        const sourceField = sourceStruct.fields.find(candidate => candidate.sourceName === property.name);
        if (sourceField === undefined || sourceField.readonly) return undefined;
        name = sourceField.sourceName;
        identity = name;
        type = input.types.resolveSelectedType(sourceField.sourceType, field.fieldType, sourceFile);
      } else {
        const declaration = input.sourceFacts?.getFact(field.selectedDeclaration, providerVirtualDeclarationFactKey);
        const resolution = input.providers.resolveMember(declaration);
        if (resolution.kind !== "resolved" || resolution.relations.length !== 1) return undefined;
        const relation = resolution.relations[0]!;
        if (relation.kind !== "member" || relation.targetBinding.kind !== "struct" ||
          relation.targetBinding.id !== pointeeType.id || relation.receiver.kind !== "instance" ||
          relation.targetMember.kind !== "field" || relation.targetMember.static || relation.targetMember.readonly) return undefined;
        const ids = relation.targetBinding.csharpNativeMemoryFieldIds;
        if (ids === undefined || new Set(ids).size !== ids.length ||
          completeFields !== undefined && (completeFields.length !== ids.length || completeFields.some(id => !ids.includes(id)))) return undefined;
        const substitutions = csharpTargetBindingSubstitutions(relation.targetBinding, pointeeType.typeArguments ?? []);
        if (substitutions === undefined) return undefined;
        const member = substituteCsharpTargetMember(relation.targetMember, substitutions);
        identity = member.id;
        name = member.targetName;
        type = member.returnType;
      }
      if (usedFields.has(identity) || fields.some(field => field.name === name) ||
        type === undefined || !targetTypeRefEquals(type, child.pointeeType)) return undefined;
      usedFields.add(identity);
      fields.push(Object.freeze({ name, offset: field.byteOffset, alignment: field.byteAlignment, layout: child }));
    }
    if (completeFields === undefined || completeFields.length !== fields.length ||
      completeFields.some(identity => !usedFields.has(identity))) return undefined;
  }
  const result: CsharpNativeMemoryLayout = Object.freeze({ kind: pointeeType.kind === "source-primitive" ? "scalar" : "record",
    pointeeType, size: layout.byteSize, alignment: layout.byteAlignment,
    width: layout.dataLayout.addressWidth, littleEndian: layout.dataLayout.byteOrder === "little", fields: Object.freeze(fields) });
  selected.set(layout, result);
  return result;
}

export type CsharpRawLocationSelection =
  | { readonly kind: "rejected"; readonly operation: "raw-location"; readonly reason: string }
  | { readonly kind: "raw-location"; readonly method: "ToRaw" | "Reinterpret";
      readonly expression: Node; readonly inputType: TargetTypeRef; readonly layout: CsharpNativeMemoryLayout };

export function selectCsharpRawLocation(input: CsharpPolicyContext, node: Node, file: SourceFile): CsharpRawLocationSelection | undefined {
  const selected = readCsharpRawLocation(input.ast, input.sourceFacts, node);
  if (selected === undefined) return undefined;
  const reject = (reason: string): CsharpRawLocationSelection => ({ kind: "rejected", operation: "raw-location", reason });
  if (selected.kind === "rejected") return reject(selected.reason);
  const layout = selectCsharpNativeMemoryLayout(input, selected.layout, file);
  if (layout === undefined) return reject("The selected layout has no closed all-bit-pattern C# native value representation.");
  const operation = selected.operation;
  const inputType = input.types.resolveSelectedValue(selected.expression,
    operation.operation === "to-raw" ? operation.pointerType : operation.rawType, file);
  if (inputType === undefined) return reject("The raw conversion operand has no exact native carrier.");
  if (operation.operation === "to-raw") {
    const pointee = csharpRuntimeLocationPointee(inputType);
    if (!isCsharpRuntimeUndefinedTargetType(inputType) &&
      (pointee === undefined || !targetTypeRefEquals(pointee, layout.pointeeType))) {
      return reject("The typed location and selected memory layout have different C# pointee representations.");
    }
  } else {
    const raw = getCsharpNullableElementTargetType(inputType) ?? inputType;
    if (!isCsharpRuntimeUndefinedTargetType(raw) && !targetTypeRefEquals(raw, csharpRuntimeRawPointerTargetType())) {
      return reject("Reinterpretation requires the exact raw address carrier.");
    }
    const pointee = input.types.resolveSelectedType(operation.explicitPointeeTypeNode ?? selected.layout.explicitTypeNode,
      operation.pointeeType, file);
    if (pointee === undefined || !targetTypeRefEquals(pointee, layout.pointeeType)) {
      return reject("Reinterpretation and its selected layout have different exact C# pointee types.");
    }
  }
  return Object.freeze({ kind: "raw-location", method: operation.operation === "to-raw" ? "ToRaw" : "Reinterpret",
    expression: selected.expression,
    inputType: csharpNullableReferenceTargetType(operation.operation === "to-raw"
      ? csharpRuntimeLocationTargetType(layout.pointeeType) : csharpRuntimeRawPointerTargetType()), layout });
}
