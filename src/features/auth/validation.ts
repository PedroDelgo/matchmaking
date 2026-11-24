export const authPasswordMinimum = 10;
export class AuthUserError extends Error {}

export function normalizeEmail(value: string) {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AuthUserError("Informe um e-mail válido.");
  return email;
}

export function validatePassword(value: string) {
  if (value.length < authPasswordMinimum || value.length > 128)
    throw new AuthUserError("Use uma senha com 10 a 128 caracteres.");
  return value;
}

export function normalizeNickname(value: string) {
  // Reject controls, invisible format characters and bidi overrides before trimming.
  if (
    /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(
      value,
    )
  )
    throw new AuthUserError(
      "O apelido contém caracteres que não são permitidos.",
    );
  const nickname = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(nickname).length;
  if (length < 2 || length > 40)
    throw new AuthUserError("Use um apelido com 2 a 40 caracteres.");
  return nickname;
}

export function authErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "invalid_credentials") return "E-mail ou senha incorretos.";
  if (code === "email_not_confirmed")
    return "Confirme seu e-mail antes de entrar.";
  if (code === "weak_password")
    return "Essa senha não atende à política de segurança. Use outra senha.";
  if (["over_request_rate_limit", "over_email_send_rate_limit"].includes(code))
    return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (
    [
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
    ].includes(code)
  )
    return "Este link expirou ou já foi usado. Solicite um novo e-mail.";
  if (
    [
      "session_not_found",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "user_not_found",
      "bad_jwt",
    ].includes(code)
  )
    return "Sua sessão terminou. Entre novamente.";
  if (code === "user_already_exists")
    return "Não foi possível concluir o cadastro. Tente entrar ou recuperar a senha.";
  if (code === "same_password")
    return "Escolha uma senha diferente da anterior.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
