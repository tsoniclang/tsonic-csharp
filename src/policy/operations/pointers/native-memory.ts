import type { AstReader, ExtensionFactSubject, Node, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import { selectTsonicRawLocationOperation } from "@tsonic/source-core/facts";
import type { TsonicMemoryLayoutFact, TsonicRawLocationSelection } from "@tsonic/source-core/facts";
import type { CsharpTypePolicy } from "../../types/index.js";
import { csharpRuntimeLocationPointee, csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType, isCsharpRuntimeUndefinedTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType, csharpNullableReferenceTargetType } from "../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpPolicyContext } from "../../context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";

export function readCsharpRawLocation(ast: AstReader, facts: ReadonlySourceFactResolver | undefined, subject: ExtensionFactSubject): TsonicRawLocationSelection | undefined {
  return facts === undefined ? undefined : selectTsonicRawLocationOperation(ast, facts, subject);
}

export function selectCsharpNativeMemoryLayout(
  types: CsharpTypePolicy, layout: TsonicMemoryLayoutFact, sourceFile: SourceFile,
): CsharpNativeMemoryLayout | undefined {
  const pointeeType = types.resolveSelectedType(layout.explicitTypeNode, layout.sourceType, sourceFile);
  if (pointeeType?.kind !== "source-primitive" || layout.fields.length !== 0) return undefined;
  const sizes: Readonly<Partial<Record<string, number>>> = {
    int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4,
    int64: 8, uint64: 8, int128: 16, uint128: 16, float16: 2, float32: 4, float64: 8,
    "native-int": layout.dataLayout.addressWidth / 8, "native-uint": layout.dataLayout.addressWidth / 8,
  };
  if (sizes[pointeeType.name] !== layout.byteSize) return undefined;
  return Object.freeze({ pointeeType, size: layout.byteSize, alignment: layout.byteAlignment,
    width: layout.dataLayout.addressWidth, littleEndian: layout.dataLayout.byteOrder === "little" });
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
  const layout = selectCsharpNativeMemoryLayout(input.types, selected.layout, file);
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
