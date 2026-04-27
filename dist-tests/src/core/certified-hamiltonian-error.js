"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertifiedHamiltonianInvariantError = void 0;
class CertifiedHamiltonianInvariantError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CertifiedHamiltonianInvariantError';
    }
}
exports.CertifiedHamiltonianInvariantError = CertifiedHamiltonianInvariantError;
