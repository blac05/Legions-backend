import speakeasy from "speakeasy";
import QRCode from "qrcode";

export function generateTwoFASecret(email) {
  const secret = speakeasy.generateSecret({
    name: `Legion (${email})`,
    length: 20,
  });

  return secret;
}

export async function generateQRCode(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyTwoFAToken(base32Secret, token) {
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: "base32",
    token,
    window: 1,
  });
}

export function generateBackupCodes(count = 8) {
  const codes = [];

  for (let i = 0; i < count; i++) {
    codes.push(
      Math.random().toString(36).slice(2, 6) +
        "-" +
        Math.random().toString(36).slice(2, 6)
    );
  }

  return codes;
}

export function findMatchingBackupCode(inputCode, backupCodes = []) {
  return (
    backupCodes.find(
      code => code.toLowerCase() === inputCode.toLowerCase()
    ) || null
  );
}