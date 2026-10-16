import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceExpressionResultDisposition, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../policy/types/resolution/source-profile.js";
import type { CsharpProgramRecords } from "../../target-model/records/program.js";
import type { CsharpPromiseDiscard, CsharpPromiseResult, CsharpPromiseResults } from "../../target-model/records/promise-results.js";
import { getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly records: CsharpProgramRecords;
  readonly definitions: CsharpTypeDefinitions;
  readonly sourceCarrier: (type: Type, file: SourceFile) => TargetTypeRef | undefined;
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [];
  const { ast } = input.source;
  const select = (carrier: TargetTypeRef, depth = 0): CsharpPromiseDiscard | undefined => {
    if (depth > 128) return undefined;
    const nullable = getCsharpNullableElementTargetType(carrier);
    if (nullable !== undefined) {
      const present = select(nullable, depth + 1);
      return present === undefined ? undefined : Object.freeze({ kind: "optional", valueType: isCsharpValueTypeTargetType(nullable), present });
    }
    if (getCsharpTaskResultTargetType(carrier) !== undefined) return Object.freeze({ kind: "task" });
    const alternatives = getCsharpRuntimeUnionArms(carrier, input.definitions);
    if (alternatives === undefined) return undefined;
    const arms = alternatives.flatMap((alternative, index) => {
      const selection = select(alternative, depth + 1);
      return selection === undefined ? [] : [Object.freeze({ index, selection })];
    });
    return arms.length === 0 ? undefined : Object.freeze({ kind: "union", arms: Object.freeze(arms) });
  };
  for (const node of input.nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = input.records.valueRead.get(node)?.value;
    const selection = carrier === undefined ? undefined : select(carrier);
    if (selection === undefined) continue;
    const disposition = sourceExpressionResultDisposition(ast, node);
    if (disposition.kind !== "discarded") {
      results.set(node, Object.freeze({ disposition }));
      continue;
    }
    const file = ast.getSourceFile(node);
    const semantics = input.source.semantics.forNode(node);
    const type = semantics.types.expressionType(node);
    let native = false;
    let js = false;
    let remaining = 4096;
    const inspect = (selected: Type, depth: number): void => {
      if (--remaining < 0 || depth > 128) { native = true; return; }
      const parts = semantics.types.isUnion(selected) || semantics.types.isIntersection(selected)
        ? semantics.types.unionOrIntersectionTypes(selected) : [];
      if (parts.length > 0) { for (const part of parts) inspect(part, depth + 1); return; }
      const profile = classifyCsharpSourceProfileType(selected, semantics, ast);
      if (profile?.kind === "promise") {
        if (profile.ownerId === "js") js = true;
        else native = true;
      } else {
        const physical = file === undefined ? undefined : input.sourceCarrier(selected, file);
        if (physical !== undefined && select(physical) !== undefined) native = true;
      }
    };
    if (type !== undefined) inspect(type, 0);
    if (!js || native) {
      diagnostics.push(Object.freeze({ code: "CSHARP_DISCARDED_NATIVE_ASYNC_CALL", category: "error", source: "tsonic-csharp",
        sourceNode: node, message: "A native async call must be awaited, returned, passed or stored; discarding its result is unsupported.",
        evidence: ["target.capability=csharp.async.native-result-use"] }));
      continue;
    }
    results.set(node, Object.freeze({ disposition, discard: selection }));
  }
  return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
}
