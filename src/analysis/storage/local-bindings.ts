import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProgramRecords } from "../../target-model/records/program.js";
import type { CsharpLocalBindingCompletion } from "../../target-model/records/local-bindings.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpLocalBindingRecords } from "../program/records/local-bindings.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import type { CsharpOptionalLocalPlan } from "./optional-locals.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../target-model/types/carriers/scalar-types.js";

export function analyzeCsharpLocalBindings(input: {
  readonly ast: AstReader; readonly navigation: SourceProgramNavigation; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean;
  readonly nativeRefs: CsharpProgramRecords["nativeRefReturn"]; readonly storage: CsharpProgramRecords["storageType"];
  readonly moduleInitialization: CsharpProgramRecords["moduleBindingInitialization"];
  readonly required: CsharpRequiredRecord[];
  readonly optionalLocals: CsharpOptionalLocalPlan;
}) {
  const values = new Map<Node, CsharpLocalBindingCompletion>();
  for (const node of input.nodes) {
    if (!input.admitted(node) || !input.ast.is.IsVariableDeclaration(node)) continue;
    const owner = input.ast.parent(node);
    if (owner !== undefined && input.ast.is.IsCatchClause(owner)) continue;
    const statement = owner === undefined ? undefined : input.ast.parent(owner);
    if (statement !== undefined && (input.ast.is.IsForInStatement(statement) || input.ast.is.IsForOfStatement(statement))) continue;
    const variable = input.ast.as.AsVariableDeclaration(node);
    const initializer = variable?.Initializer;
    const nativeRef = initializer !== undefined && input.ast.variableDeclarationKind(node) === "const"
      ? input.nativeRefs.get(initializer) : undefined;
    const carrier = nativeRef?.kind === "resolved" ? nativeRef.returnType : input.storage.get(node);
    if (carrier === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted local requires its native storage carrier before publication.", node);
    const recursiveInitializer = initializer !== undefined && input.navigation.declarationUseSummary(node).uses.some(use => {
      if (use.kind === "type-only") return false;
      for (let current: Node | undefined = use.reference; current !== undefined; current = input.ast.parent(current)) {
        if (current === initializer) return true;
      }
      return false;
    });
    const optionalLocal = input.optionalLocals.get(node);
    values.set(node, Object.freeze({ carrier,
      initialization: initializer !== undefined ? "source" : input.moduleInitialization.get(node) !== "declaration" &&
        csharpCarrierAdmitsSourceAbsence(input.storage.get(node)) ? "absence" : "declaration",
      refKind: nativeRef?.kind === "resolved" ? nativeRef.returnPassing === "byref-readonly" ? "ref-readonly" : "ref" : undefined,
      recursiveInitializer, ...(optionalLocal === undefined ? {} : { optionalLocal }) }));
    requireCsharpRecord(input.required, { family: "localBinding", subject: node,
      construct: input.ast.kindName(node), producer: "analyzeCsharpLocalBindings" });
  }
  for (const { node, operation } of input.optionalLocals.entries) {
    if (operation.kind === "declaration" || !input.admitted(node)) continue;
    const carrier = operation.kind === "absence-test" ? csharpSourcePrimitiveTargetType("bool")
      : operation.kind === "write" || operation.kind === "coalesce" && operation.assignment
        ? csharpVoidTargetType() : operation.placement.payload;
    values.set(node, Object.freeze({ carrier, initialization: "declaration", refKind: undefined,
      recursiveInitializer: false, optionalLocal: operation }));
    requireCsharpRecord(input.required, { family: "localBinding", subject: node,
      construct: input.ast.kindName(node), producer: "analyzeCsharpLocalBindings" });
  }
  return createCsharpLocalBindingRecords(values);
}
