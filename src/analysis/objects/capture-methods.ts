import type { AstReader } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpCaptureMethodEmission } from "../../target-model/records/capture-methods.js";
import { getCsharpExpressionTreeDelegateType, isCsharpVoidTargetType } from "../../target-model/types/index.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-demand.js";
import { selectCsharpObjectLiteralCallable } from "../../policy/objects/object-literals.js";
import { createCsharpCaptureMethodRecords } from "../program/records/capture-methods.js";

export function analyzeCsharpCaptureMethods(ast: AstReader, captures: CsharpCaptureStorage) {
  const values = new Map<string, readonly CsharpCaptureMethodEmission[]>();
  const issues: TargetDiagnostic[] = [];
  for (const frame of captures.frames) {
    const methods: CsharpCaptureMethodEmission[] = [];
    for (const method of frame.methods) {
      const selected = selectCsharpObjectLiteralCallable({ carrier: method.type, storage: method.type, receiver: undefined });
      if (selected.kind === "rejected" || ast.getSourceFile(method.declaration) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: method.declaration,
          message: "A native captured method requires its sealed callable signature." }); continue;
      }
      const quotation = getCsharpExpressionTreeDelegateType(method.type) !== undefined;
      methods.push(Object.freeze({ method, form: ast.is.IsFunctionDeclaration(method.declaration) ? "declaration"
        : ast.is.IsArrowFunction(method.declaration) ? "arrow" : "function", quotation,
        returnsVoid: isCsharpVoidTargetType(selected.signature.returnType), returnType: quotation ? method.type : selected.signature.returnType, signature: selected.signature }));
    }
    values.set(objectShapeArtifactKey(frame.shape), Object.freeze(methods));
  }
  return Object.freeze({ records: createCsharpCaptureMethodRecords(values), issues: Object.freeze(issues) });
}
