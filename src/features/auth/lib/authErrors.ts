import { ApiError } from "@/shared/api";

const ERROR_CODES = new Map([
  ["INVALID_CREDENTIALS", "invalid_credentials"],
  ["EMAIL_ALREADY_USED", "email_already_used"],
  ["USERNAME_TAKEN", "username_taken"],
  ["INVALID_USERNAME", "invalid_username"],
  ["INVALID_INPUT", "invalid_input"],
]);

const ERROR_MESSAGES = new Map([
  ["INVALID_CREDENTIALS", "Email or password is incorrect."],
  ["EMAIL_ALREADY_USED", "This email is already in use."],
  ["USERNAME_TAKEN", "This username is already taken. Please choose another."],
  ["INVALID_USERNAME", "Username must be 3-30 lowercase characters (a-z, 0-9, _)."],
]);

const UNREACHABLE_CODE = "server_unavailable";
const UNKNOWN_CODE = "unknown_error";
const UNREACHABLE_MESSAGE = "Unable to reach the server.";
const UNKNOWN_MESSAGE = "Something went wrong. Please try again.";

export function getAuthErrorCode(error: unknown): string {
  if (!(error instanceof ApiError)) return UNREACHABLE_CODE;
  return ERROR_CODES.get(error.code ?? "") ?? UNKNOWN_CODE;
}

/** Unknown server errors stay generic, so a raw response body never reaches the screen. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return UNREACHABLE_MESSAGE;
  return ERROR_MESSAGES.get(error.code ?? "") ?? UNKNOWN_MESSAGE;
}
