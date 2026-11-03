import type { AstReader, ExtensionFactSubject, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { selectTsonicRawLocationOperation } from "@tsonic/source-core/facts";
import type { TsonicRawLocationSelection } from "@tsonic/source-core/facts";

export function readCsharpRawLocation(ast: AstReader, facts: ReadonlySourceFactResolver | undefined, subject: ExtensionFactSubject): TsonicRawLocationSelection | undefined {
  return facts === undefined ? undefined : selectTsonicRawLocationOperation(ast, facts, subject);
}
