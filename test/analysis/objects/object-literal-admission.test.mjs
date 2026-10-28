import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkedSource, requiredNode } from "../../../../tsonic/test/fixtures/source-navigation.mjs";
import { analyzeCsharpObjectLiterals } from "../../../dist/analysis/objects/object-literals.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";

test("object spread admission rejects an actually missing finalized member carrier", async () => {
  const checked = await checkedSource("object-spread-missing-finalized-carrier", { "src/index.ts":
    "export function shrink(input: { value: number; label: string }): { value: number } { return { ...input }; }" });
  assert.equal(checked.diagnostics.length, 0, "the original spread source is valid TypeScript");
  const source = createTargetSourceProgram(checked);
  const file = source.sourceFiles.find(candidate => source.ast.getFileName(candidate).endsWith("/src/index.ts"));
  assert.equal(file !== undefined, true, "exact checked source file");
  const literal = requiredNode(source.ast, file, node => source.ast.is.IsObjectLiteralExpression(node));
  const spread = requiredNode(source.ast, literal, node => source.ast.is.IsSpreadAssignment(node));
  const operand = source.ast.as.AsSpreadAssignment(spread).Expression;
  const member = (name, type) => Object.freeze({ sourceKey: Object.freeze({ kind: "property", name }),
    sourceName: name, targetName: name, memberKind: "property", type });
  const value = member("value", csharpSourcePrimitiveTargetType("float64"));
  const label = member("label", csharpStringTargetType());
  const environment = () => assert.fail("the monomorphic checked spread has no generic binder");
  const target = Object.freeze({ targetType: createStructuralObjectShapeTarget([value], undefined, environment),
    members: Object.freeze([value]) });
  const original = Object.freeze({ targetType: createStructuralObjectShapeTarget([value, label], undefined, environment),
    members: Object.freeze([value, label]) });
  const childSite = csharpNativeUseSite(literal, { kind: "member", index: 0 });
  const child = Object.freeze({ kind: "value", expression: operand, children: Object.freeze([]),
    completion: Object.freeze({ kind: "value", type: original.targetType }) });
  const use = Object.freeze({ kind: "value", expression: literal, objectShape: target, children: Object.freeze([childSite]),
    completion: Object.freeze({ kind: "value", type: target.targetType }) });
  const selected = analyzeCsharpObjectLiterals({ source,
    demand: { entries: [{ use }], nativeUse: { get: site => site === childSite ? child : undefined } },
    shapes: { resolveNode: node => node === operand ? original : undefined },
    methods: { objectCaptures: { get: () => Object.freeze([]) } },
    members: { objectMember: { get: () => undefined } },
    storage: { requiredStorageType: { get: () => undefined } }, callables: { get: () => undefined } });
  assert.equal(selected.issues.length, 1, "one admission refusal for the actually absent target member");
  assert.equal(selected.issues[0].code, "CSHARP_UNSUPPORTED_AST");
  assert.equal(selected.issues[0].sourceNode === spread, true, "the exact spread admission owns the rejection");
  assert.equal(selected.issues[0].message,
    "Object literal spread source member 'label' requires a finalized target object-shape member carrier before C# emission.");
});
