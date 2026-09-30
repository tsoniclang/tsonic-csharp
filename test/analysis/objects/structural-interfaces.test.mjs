import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { resolveCsharpOptionalStorage } from "../../../dist/target-model/types/optional-storage.js";

const element = { kind: "type-parameter", identity: "interface:Element", name: "Element" };
const captured = { kind: "type-parameter", identity: "class:Element", name: "Element" };
const integer = { kind: "source-primitive", name: "int64" };
const sourceSymbol = {};
const destinationSymbol = {};
const expression = {};
const sourceType = {};
const destinationType = {};
const optional = type => csharpNullableTargetType(type);
const slot = type => ({ kind: "target-named", id: "test.Slot", csharpSourceDeclarationKind: "interface",
  typeArguments: [type, resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [element] }, type), optional(type)] });
const field = (symbol, type) => ({ sourceName: "value", targetName: "value", sourceKey: { kind: "property", name: "value" },
  sourceSubjects: [symbol], memberKind: "property", type });
const destinationTemplate = { targetType: slot(element), sourceType: destinationType, members: [field(destinationSymbol, optional(element))] };
const destination = { targetType: slot(integer), sourceType: destinationType, members: [field(destinationSymbol, optional(integer))],
  declarationTemplate: destinationTemplate };
const policy = { semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers: () => ({
  kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
    source: { property: { symbol: sourceSymbol, rootSymbols: [] }, declarations: [] },
    destination: { property: { symbol: destinationSymbol, rootSymbols: [] }, declarations: [] },
  }],
}) } }) };

test("structural optional interfaces bind their payload and every dependent native argument", () => {
  for (const generic of [false, true]) {
    const template = { targetType: { kind: "target-named", id: "test.Record", typeArguments: generic ? [captured] : [] },
      members: [field(sourceSymbol, optional(generic ? captured : integer))] };
    const source = { targetType: { kind: "target-named", id: "test.Record", typeArguments: generic ? [integer] : [] },
      members: [field(sourceSymbol, optional(integer))], declarationTemplate: template };
    const selected = selectCsharpStructuralInterface(policy, expression, source, destination);
    assert.deepEqual(selected, { sourceType: template.targetType, interfaceType: slot(generic ? captured : integer), methods: [] });
    const mismatched = { ...source, members: [field(sourceSymbol, optional({ kind: "source-primitive", name: "uint64" }))] };
    assert.equal(selectCsharpStructuralInterface(policy, expression, mismatched, destination), undefined);
    const incomplete = { ...destination, declarationTemplate: { ...destinationTemplate,
      targetType: { ...destinationTemplate.targetType, typeArguments: [...destinationTemplate.targetType.typeArguments,
        csharpProjectedType({ kind: "optional", part: "operations", arguments: [{ ...element, identity: "unbound:Element" }] })] },
    } };
    assert.equal(selectCsharpStructuralInterface(policy, expression, source, incomplete), undefined);
  }
});
