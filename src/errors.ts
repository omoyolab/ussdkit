export class UssdkitError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "UssdkitError";
    this.hint = hint;
  }
}
