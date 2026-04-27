export class CertifiedHamiltonianInvariantError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CertifiedHamiltonianInvariantError';
    }
}
