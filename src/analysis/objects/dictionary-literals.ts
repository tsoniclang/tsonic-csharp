import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpDictionaryLiteral } from "../../target-model/records/objects/dictionary-literals.js";
import { isCsharpRecordDictionaryTargetType } from "../../target-model/types/carriers/collections.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpDictionaryLiteralRecords } from "../program/records/objects/dictionary-literals.js";

export function analyzeCsharpDictionaryLiterals(ast: AstReader, demand: CsharpNativeDemandAnalysis) {
  const values = new Map<Node, Map<string, CsharpDictionaryLiteral>>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const { use } of demand.entries) {
    if (use.kind === "erased" || !ast.is.IsObjectLiteralExpression(use.expression) || !isCsharpRecordDictionaryTargetType(use.carrier)) continue;
    const node = use.expression;
    const carrier = use.carrier;
    const carriers = values.get(node) ?? new Map<string, CsharpDictionaryLiteral>();
    const key = targetTypeRefKey(carrier);
    if (carriers.has(key)) continue;
    if (!selectCsharpTypeEmission({ carrier })) { refuse(node, "Record dictionary object literal emission requires a renderable provider-owned Dictionary target type."); continue; }
    const [keyType, valueType] = carrier.kind === "target-named" ? carrier.typeArguments ?? [] : [];
    if (keyType === undefined || valueType === undefined) { refuse(node, "Record dictionary object literal emission requires finalized key and value target type facts before C# emission."); continue; }
    if (!selectCsharpTypeEmission({ carrier: valueType })) { refuse(node, "Record dictionary object literal values require a renderable finalized value target type before C# emission."); continue; }
    const properties = ast.as.AsObjectLiteralExpression(node)?.Properties?.Nodes ?? [];
    if (properties.length !== 0 && use.propertyKeys === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted dictionary construction requires its exact native key bindings.", node);
    const keys = new Map(use.propertyKeys?.map(key => [key.property, key]));
    const parts: CsharpDictionaryLiteral["parts"][number][] = [];
    for (const property of properties) {
      if (property === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted dictionary literal requires dense checked source members.", node);
      // AstReader casts do not test the node kind; each member form is selected by its kind first.
      const spread = ast.is.IsSpreadAssignment(property) ? ast.as.AsSpreadAssignment(property) : undefined;
      if (spread !== undefined) {
        const expression = spread.Expression;
        const selected = expression === undefined ? undefined : demand.nativeUse.expression(expression)?.use;
        const source = selected === undefined || selected.kind === "erased" || selected.completion.kind !== "value" ? undefined : selected.completion.type;
        if (expression === undefined || source === undefined || !targetTypeRefEquals(source, carrier)) {
          refuse(property, "Indexed-record spread requires the exact finalized source and destination dictionary carriers."); continue;
        }
        parts.push(Object.freeze({ kind: "spread", property, expression, copy: parts.length === 0 })); continue;
      }
      const assignment = ast.is.IsPropertyAssignment(property) ? ast.as.AsPropertyAssignment(property) : undefined;
      const shorthand = ast.is.IsShorthandPropertyAssignment(property) ? ast.as.AsShorthandPropertyAssignment(property) : undefined;
      if (assignment === undefined && shorthand === undefined) {
        refuse(property, ast.is.IsMethodDeclaration(property) ? "Record dictionary object literal methods require finalized callable value carrier facts before C# emission."
          : "Record dictionary object literal member is outside the current C# planning surface."); continue;
      }
      if (shorthand?.ObjectAssignmentInitializer !== undefined) { refuse(property, "Record dictionary shorthand defaults require finalized default-value semantics before C# emission."); continue; }
      const value = assignment === undefined ? ast.name(property) : assignment.Initializer;
      if (value === undefined) { refuse(property, assignment === undefined ? "Record dictionary shorthand must carry a finalized source name and value carrier before C# emission."
        : "Record dictionary property assignment must have an initializer."); continue; }
      const selectedKey = keys.get(property)
        ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted dictionary member requires its exact key literal recipe.", property);
      parts.push(Object.freeze({ kind: "value", property, key: selectedKey.literal, value }));
    }
    carriers.set(key, Object.freeze({ carrier, key: keyType, value: valueType, parts: Object.freeze(parts) })); values.set(node, carriers);
  }
  return Object.freeze({ records: createCsharpDictionaryLiteralRecords(values), issues: Object.freeze(issues) });
}
