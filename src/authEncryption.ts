import * as Crypto from 'expo-crypto';
import forge from 'node-forge';
import { API_ROOT } from './config';

type AuthEncryptionKey = {
  key_id: string;
  algorithm: string;
  public_key: string;
};

type EncryptedAuthPayload = {
  key_id: string;
  encrypted_key: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

let cachedKey: AuthEncryptionKey | null = null;

export async function encryptAuthPayload(payload: Record<string, unknown>): Promise<EncryptedAuthPayload> {
  const key = await getAuthEncryptionKey();
  const publicKey = forge.pki.publicKeyFromPem(key.public_key);
  const aesKey = bytesToForgeString(Crypto.getRandomBytes(32));
  const iv = bytesToForgeString(Crypto.getRandomBytes(12));
  const json = JSON.stringify({
    ...payload,
    issued_at: new Date().toISOString(),
  });
  const cipher = forge.cipher.createCipher('AES-GCM', aesKey);

  cipher.start({
    iv,
    tagLength: 128,
  });
  cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(json)));

  if (!cipher.finish()) {
    throw new Error('Unable to encrypt login details.');
  }

  const encryptedKey = publicKey.encrypt(aesKey, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha256.create(),
    },
  });

  return {
    key_id: key.key_id,
    encrypted_key: forge.util.encode64(encryptedKey),
    iv: forge.util.encode64(iv),
    ciphertext: forge.util.encode64(cipher.output.getBytes()),
    tag: forge.util.encode64(cipher.mode.tag.getBytes()),
  };
}

async function getAuthEncryptionKey() {
  if (cachedKey) {
    return cachedKey;
  }

  const response = await fetch(`${API_ROOT}/auth/encryption-key/`);
  if (!response.ok) {
    throw new Error('Secure login is not ready. Please try again soon.');
  }

  const payload = (await response.json()) as AuthEncryptionKey;
  if (!payload.public_key || !payload.key_id) {
    throw new Error('Secure login key is missing.');
  }

  cachedKey = payload;
  return payload;
}

function bytesToForgeString(bytes: Uint8Array) {
  let value = '';
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });
  return value;
}
