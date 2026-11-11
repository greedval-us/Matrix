import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const isDeviceApiKey = (value) => value.startsWith("mxk_");

function assertDeviceApiKey(value) {
  if (!/^mxk_[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Проверьте формат ключа доступа Matrix");
}

const storageError = () => new Error("Не удалось открыть защищённое хранилище Matrix в этом профиле системы");

export function createDeviceIdentityStore(profileDirectory) {
  const filename = path.join(profileDirectory, "matrix-device-key-v1.dpapi");
  return {
    getOrCreate(create) {
      try { return readFileSync(filename, "utf8"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }

      mkdirSync(profileDirectory, { recursive: true });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      const value = create();
      try {
        writeFileSync(temporary, value, { flag: "wx", mode: 0o600, flush: true });
        // Publishing a complete file without overwrite keeps the first identity across concurrent launches.
        try { linkSync(temporary, filename); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
        return readFileSync(filename, "utf8");
      } finally {
        try { unlinkSync(temporary); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    },
  };
}

export class DeviceAccessCredentials {
  #identity;

  constructor({ safeStorage, identityStore, platform = process.platform }) {
    this.safeStorage = safeStorage;
    this.identityStore = identityStore;
    this.platform = platform;
  }

  #requireStorage() {
    if (!this.safeStorage?.isEncryptionAvailable()) throw storageError();
    if (this.platform === "linux") {
      const backend = this.safeStorage.getSelectedStorageBackend?.();
      if (!backend || backend === "basic_text" || backend === "unknown") throw storageError();
    }
  }

  #encrypt(value) {
    try {
      this.#requireStorage();
      return this.safeStorage.encryptString(value).toString("base64url");
    } catch { throw storageError(); }
  }

  #decrypt(value) {
    try {
      this.#requireStorage();
      return this.safeStorage.decryptString(Buffer.from(value, "base64url"));
    } catch { throw storageError(); }
  }

  protectApiKey(apiKey, authority) {
    assertDeviceApiKey(apiKey);
    return this.#encrypt(JSON.stringify({ apiKey, authority }));
  }

  openApiKey(ciphertext, authority) {
    let saved;
    try { saved = JSON.parse(this.#decrypt(ciphertext)); }
    catch { throw storageError(); }
    if (saved?.authority !== authority) throw new Error("Введите API-ключ для нового адреса или сертификата сервера");
    assertDeviceApiKey(saved.apiKey);
    return saved.apiKey;
  }

  #getIdentity() {
    if (this.#identity) return this.#identity;
    try {
      this.#requireStorage();
      const protectedKey = this.identityStore.getOrCreate(() => {
        const { privateKey } = generateKeyPairSync("ed25519");
        return this.#encrypt(privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"));
      });
      const privateKey = createPrivateKey({
        key: Buffer.from(this.#decrypt(protectedKey), "base64url"), format: "der", type: "pkcs8",
      });
      if (privateKey.asymmetricKeyType !== "ed25519") throw storageError();
      const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64url");
      this.#identity = { privateKey, publicKey };
      return this.#identity;
    } catch { throw storageError(); }
  }

  createSigner(apiKey) {
    assertDeviceApiKey(apiKey);
    const { privateKey, publicKey } = this.#getIdentity();
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    return (methodPath) => {
      if (!methodPath) throw new Error("Не удалось определить метод защищённого запроса Matrix");
      const time = String(Date.now());
      const nonce = randomBytes(16).toString("base64url");
      const message = Buffer.from(["matrix-device-v1", methodPath, keyHash, time, nonce].join("\n"), "utf8");
      return {
        "x-matrix-device-key": publicKey,
        "x-matrix-device-time": time,
        "x-matrix-device-nonce": nonce,
        "x-matrix-device-signature": sign(null, message, privateKey).toString("base64url"),
      };
    };
  }
}
