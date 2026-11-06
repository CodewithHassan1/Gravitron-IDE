import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export class PasswordService {
  /**
   * Hashes a plaintext password using bcrypt.
   * @param password Plaintext password
   */
  static async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compares a plaintext password against a hash.
   * @param password Plaintext password
   * @param hash Bcrypt hash
   */
  static async compare(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generates a dummy hash and performs a dummy compare to mitigate timing attacks
   * when a user is not found.
   */
  static async dummyCompare(): Promise<void> {
    const dummyHash = await bcrypt.hash('dummy_password_for_timing', SALT_ROUNDS);
    await bcrypt.compare('dummy_input', dummyHash);
  }
}
