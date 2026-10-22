import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpObjectMethodSourceCapture } from "../../../target-model/records/native-value-carriers.js";

export function selectCsharpObjectMethodImplementation(
  members: readonly CsharpObjectShapeMemberFact[],
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
  selectedLiteral?: Node,
): CsharpObjectShapeFact["methodImplementation"] | undefined {
  const methods = [...new Set(members.filter(member => member.memberKind === "method").flatMap(member => (member.sourceDeclarations ?? [])
    .filter(declaration => host.ast.is.IsMethodDeclaration(declaration) && host.ast.body(declaration) !== undefined &&
      host.ast.is.IsObjectLiteralExpression(host.ast.parent(declaration)!) &&
      (selectedLiteral === undefined || host.ast.parent(declaration) === selectedLiteral))))]
    .sort((left, right) => host.ast.pos(left) - host.ast.pos(right));
  if (methods.length === 0) return undefined;
  const literal = host.ast.parent(methods[0]!);
  if (literal === undefined || methods.some(method => host.ast.parent(method) !== literal)) return undefined;
  const selected = host.objectMethodSources.get(literal);
  if (selected === undefined) return undefined;
  const selectedCaptures = new Map<Node, CsharpObjectMethodSourceCapture>();
  for (const method of methods) {
    const captures = selected.captures(method);
    if (captures === undefined) return undefined;
    for (const capture of captures) {
      if (!selectedCaptures.has(capture.declaration)) selectedCaptures.set(capture.declaration, capture);
    }
  }
  const names = new Set(members.map(member => member.targetName));
  const captures = [...selectedCaptures.values()].map((capture, index) => {
    const reference = capture.reference;
    const type = host.typeResolver.resolveNode(capture.declaration, host.ast.getSourceFile(capture.declaration), nextState(state));
    if (reference === undefined || type === undefined) return undefined;
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    return Object.freeze({ declaration: capture.declaration, reference, fieldName, type,
      mutable: capture.mutable,
    });
  });
  if (captures.some(capture => capture === undefined)) return undefined;
  return Object.freeze({ declaration: literal, identity: selected.identity, methods: Object.freeze(methods),
    captures: Object.freeze(captures as NonNullable<typeof captures[number]>[]),
  });
}
