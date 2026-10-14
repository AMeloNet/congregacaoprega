export type AuthFailureReason =
  | 'flow_cookie_missing'
  | 'flow_cookie_invalid'
  | 'flow_missing_or_consumed'
  | 'flow_expired'
  | 'state_mismatch'
  | 'identity_mismatch'
  | 'token_exchange_request_failed'
  | 'token_response_invalid'
  | 'jwks_unavailable'
  | 'jwks_invalid'
  | 'id_token_missing'
  | 'token_malformed'
  | 'token_algorithm_invalid'
  | 'token_key_missing'
  | 'token_signature_invalid'
  | 'token_issuer_mismatch'
  | 'token_audience_mismatch'
  | 'token_expired'
  | 'token_nonce_mismatch'
  | 'token_subject_missing'
  | 'token_email_missing';

export class AuthDiagnosticError extends Error {
  readonly stage: string;

  constructor(readonly reason: AuthFailureReason) {
    const flow = reason.startsWith('flow_') || reason === 'state_mismatch';
    super(
      flow
        ? 'Fluxo de entrada inválido ou já utilizado.'
        : 'Resposta de identidade inválida.',
    );
    this.stage = flow
      ? 'login_flow'
      : reason.startsWith('jwks_')
        ? 'jwks'
        : reason.startsWith('token_exchange_') ||
            reason === 'token_response_invalid' ||
            reason === 'id_token_missing'
          ? 'token_exchange'
          : 'id_token_validation';
  }
}
