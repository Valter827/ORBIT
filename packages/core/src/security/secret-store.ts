/**
 * ORBIT never stores a provider API key in Postgres, in a JSON config file,
 * or in source. The real implementation on Windows/macOS/Linux is a Tauri
 * command backed by the OS keychain (Windows Credential Manager, macOS
 * Keychain, libsecret) — that binding lives in the Rust layer this
 * repository does not yet contain (see ARCHITECTURE.md).
 *
 * `EnvSecretStore` is the Node-side stand-in used for development and for
 * these tests: it reads from the process environment, which is itself
 * outside the app's persisted storage. It is not a replacement for the
 * keychain binding, only a way to exercise the AIProvider contract honestly
 * before that binding exists.
 */

export interface SecretStore {
  get(key: string): Promise<string | null>;
}

export class EnvSecretStore implements SecretStore {
  get(key: string): Promise<string | null> {
    return Promise.resolve(process.env[key] ?? null);
  }
}

export class InMemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }
}
