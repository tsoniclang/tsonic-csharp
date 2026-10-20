export const csharpNativeBinaryTokens = Object.freeze({
  "&&": "AmpersandAmpersandToken", "||": "BarBarToken", "??": "QuestionQuestionToken", "&": "AmpersandToken",
  "|": "BarToken", "^": "CaretToken", "==": "EqualsEqualsToken", "!=": "ExclamationEqualsToken", "<": "LessThanToken",
  "<=": "LessThanEqualsToken", ">": "GreaterThanToken", ">=": "GreaterThanEqualsToken", "<<": "LessThanLessThanToken",
  ">>": "GreaterThanGreaterThanToken", ">>>": "GreaterThanGreaterThanGreaterThanToken", "+": "PlusToken", "-": "MinusToken",
  "*": "AsteriskToken", "/": "SlashToken", "%": "PercentToken",
} as const);

export const csharpNativeAssignmentTokens = Object.freeze({
  "??=": "QuestionQuestionEqualsToken", "=": "EqualsToken", "+=": "PlusEqualsToken", "-=": "MinusEqualsToken",
  "*=": "AsteriskEqualsToken", "/=": "SlashEqualsToken", "%=": "PercentEqualsToken", "&=": "AmpersandEqualsToken",
  "|=": "BarEqualsToken", "^=": "CaretEqualsToken", "<<=": "LessThanLessThanEqualsToken", ">>=": "GreaterThanGreaterThanEqualsToken",
  ">>>=": "GreaterThanGreaterThanGreaterThanEqualsToken",
} as const);
