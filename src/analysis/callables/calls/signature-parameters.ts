// Value parameters of a signature declaration (nextgen C-2542, R1, R4). The slots and their arity kinds are the Host's
// (facts.analyses.signatureParameters, the same slots every call selecting the signature publishes in
// SourceCallSelection.signatureParameters); C# reads the authored identifier only as a C# parameter name.
import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import type { SourceCallSelection, SourceProgramFacts } from "@tsonic/target-api/source";

export interface CsharpSignatureParameter {
  readonly declaration: Node;
  /** Position among the value parameters (a leading `this` parameter excluded). */
  readonly index: number;
  /** The authored identifier, a C# naming input only; undefined for a binding pattern. */
  readonly name: string | undefined;
  /** The Host arity kind: `rest` for `...p`; `optional` when a call may omit the argument; else `required`. */
  readonly form: "required" | "optional" | "rest";
  /** The call may omit this argument (Host kind `optional` or `rest`). */
  readonly acceptsOmission: boolean;
}

interface CsharpSignatureParameterSource {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
}

function authoredName(ast: AstReader, declaration: Node): string | undefined {
  const parameter = ast.as.AsParameterDeclaration(declaration);
  return parameter?.name === undefined || !ast.is.IsIdentifier(parameter.name) ? undefined : ast.text(parameter.name);
}

/**
 * The Host value-parameter slots of a function, method, constructor, accessor, arrow, function expression or signature
 * declaration; undefined for a node that is not a signature declaration.
 */
export function csharpSignatureParameters(source: CsharpSignatureParameterSource, signature: Node): readonly CsharpSignatureParameter[] | undefined {
  const published = source.facts.analyses.signatureParameters(signature);
  if (published === undefined) return undefined;
  return Object.freeze(published.map((parameter, index) => Object.freeze({
    declaration: parameter.declaration, index, name: authoredName(source.ast, parameter.declaration),
    form: parameter.kind, acceptsOmission: parameter.kind !== "required",
  })));
}

/** One effective parameter slot of a selected call signature: a tuple-typed rest parameter yields one slot per element. */
export interface CsharpCallParameterSlot {
  readonly declaration: Node;
  /** The selected signature parameter (index into SourceCallSelection.parameters). */
  readonly parameterIndex: number;
  readonly name: string | undefined;
  readonly form: "required" | "optional" | "rest";
}

/**
 * The effective parameter slots of a call's selected signature, from the Host selection: one slot per selected
 * parameter, except a rest parameter whose instantiated type is a tuple, which yields one slot per tuple element with
 * the element's Host kind (`...args: [A, B?, ...C[]]` gives required, optional, rest), as at baseline
 * (selectSourceCallParameterSlots).
 */
export function csharpCallParameterSlots(source: CsharpSignatureParameterSource, call: SourceCallSelection): readonly CsharpCallParameterSlot[] {
  const slots: CsharpCallParameterSlot[] = [];
  for (const [parameterIndex, parameter] of call.parameters.entries()) {
    const slot = call.signatureParameters[parameterIndex];
    if (slot === undefined || slot.declaration !== parameter.declaration || slot.kind !== parameter.kind) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A selected call parameter requires its aligned signature slot.", call.use);
    }
    const name = authoredName(source.ast, parameter.declaration);
    const structure = parameter.kind === "rest" ? sourceTypeDescriptorStructure(parameter.type) : undefined;
    if (structure?.kind !== "tuple") {
      slots.push(Object.freeze({ declaration: parameter.declaration, parameterIndex, name, form: parameter.kind }));
      continue;
    }
    for (const [element, entry] of structure.elements.entries()) {
      slots.push(Object.freeze({ declaration: parameter.declaration, parameterIndex, name: `${name ?? "arg"}${element}`, form: entry.kind }));
    }
  }
  return Object.freeze(slots);
}
