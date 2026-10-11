// An error that already knows which HTTP status and message the user should see.
// Throw it from any route: the error handler turns it into { "error": message }.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
