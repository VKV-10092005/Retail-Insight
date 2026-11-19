export function canExposeDevOtp(mailResult, env = process.env) {
  return env.NODE_ENV === 'development'
    && env.ALLOW_DEV_OTP === '1'
    && mailResult?.configured === false;
}
