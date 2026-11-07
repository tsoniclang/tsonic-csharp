// Value parameters of a signature declaration, read from its authored syntax (names and forms only; nextgen C-2542).
// The parameter types come from published facts (values.slot / selection.parameters), never from this module.
import type { AstReader, Node } from "@tsonic/tsts";

export interface CsharpSignatureParameter {
  readonly declaration: Node;
  /** Position among the value parameters (a leading `this` parameter excluded). */
  readonly index: number;
  readonly name: string | undefined;
  /** `rest` for `...p`; `optional` for `p?` or a parameter with an initializer; else `required`. */
  readonly form: "required" | "optional" | "rest";
  /** The call may omit this argument: a rest parameter, or an optional one with no required parameter after it. */
  readonly acceptsOmission: boolean;
}

/** The value parameters of a function, method, constructor, accessor or signature declaration; undefined for a non-signature node. */
export function csharpSignatureParameters(ast: AstReader, signature: Node): readonly CsharpSignatureParameter[] | undefined {
  const parameters: Omit<CsharpSignatureParameter, "acceptsOmission">[] = [];
  for (const declaration of ast.parameters(signature)) {
    if (declaration === undefined) return undefined;
    const parameter = ast.as.AsParameterDeclaration(declaration);
    if (parameter === undefined) return undefined;
    const name = parameter.name === undefined || !ast.is.IsIdentifier(parameter.name) ? undefined : ast.text(parameter.name);
    if (parameters.length === 0 && name === "this") continue;
    parameters.push(({
      declaration, index: parameters.length, name,
      form: parameter.DotDotDotToken !== undefined ? "rest"
        : parameter.QuestionToken !== undefined || parameter.Initializer !== undefined ? "optional" : "required",
    }));
  }
  return Object.freeze(parameters.map((parameter, index) => Object.freeze({ ...parameter,
    acceptsOmission: parameter.form !== "required" && parameters.slice(index + 1).every(later => later.form !== "required") })));
}
