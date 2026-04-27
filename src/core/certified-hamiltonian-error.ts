export class CertifiedHamiltonianInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertifiedHamiltonianInvariantError';
  }
}
