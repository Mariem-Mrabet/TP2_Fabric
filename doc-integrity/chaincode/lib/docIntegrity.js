'use strict';

const { Contract } = require('fabric-contract-api');

class DocIntegrity extends Contract {

    // ---------- Fonctions utilitaires ----------

    _checkDocId(docId) {
        if (typeof docId !== 'string' || docId.trim() === '') {
            throw new Error('Identifiant de document invalide (vide)');
        }
    }

    _checkHash(hash) {
        // SHA-256 en hexadécimal = 64 caractères
        if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) {
            throw new Error('Hash invalide : un SHA-256 hexadécimal de 64 caractères est attendu');
        }
    }

    async _readDoc(ctx, docId) {
        const data = await ctx.stub.getState(docId);
        if (!data || data.length === 0) {
            return null;
        }
        return JSON.parse(data.toString());
    }

    // ---------- Fonctions du chaincode ----------

    // Enregistrer une empreinte (refuse d'écraser un document existant)
    async registerHash(ctx, docId, hash) {
        this._checkDocId(docId);
        this._checkHash(hash);

        const existing = await this._readDoc(ctx, docId);
        if (existing) {
            throw new Error(`Le document ${docId} possède déjà une empreinte enregistrée`);
        }

        // Timestamp de la transaction : identique pour tous les peers (déterministe)
        const ts = ctx.stub.getTxTimestamp();
        const seconds = typeof ts.seconds === 'number' ? ts.seconds : ts.seconds.low;
        const timestamp = new Date(seconds * 1000).toISOString();

        const doc = {
            docId: docId,
            hash: hash.toLowerCase(),
            timestamp: timestamp
        };
        await ctx.stub.putState(docId, Buffer.from(JSON.stringify(doc)));
        return JSON.stringify({ status: 'REGISTERED', message: 'Empreinte enregistrée', document: doc });
    }

    // Récupérer l'empreinte d'un document
    async getHash(ctx, docId) {
        this._checkDocId(docId);
        const doc = await this._readDoc(ctx, docId);
        if (!doc) {
            return JSON.stringify({ status: 'NOT_FOUND', message: 'Document introuvable' });
        }
        return JSON.stringify({ status: 'FOUND', message: 'Document trouvé', document: doc });
    }

    // Vérifier une empreinte
    async verifyHash(ctx, docId, hash) {
        this._checkDocId(docId);
        this._checkHash(hash);

        const doc = await this._readDoc(ctx, docId);
        if (!doc) {
            return JSON.stringify({ status: 'NOT_FOUND', message: 'Document introuvable' });
        }
        if (doc.hash === hash.toLowerCase()) {
            return JSON.stringify({ status: 'VALID', message: 'Intégrité valide', document: doc });
        }
        return JSON.stringify({ status: 'INVALID', message: 'Intégrité invalide', document: doc });
    }

    // Vérifier l'existence
    async documentExists(ctx, docId) {
        this._checkDocId(docId);
        const doc = await this._readDoc(ctx, docId);
        return JSON.stringify({ docId: docId, exists: doc !== null });
    }

    // Consulter tous les documents enregistrés
    async getAllDocuments(ctx) {
        const results = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let res = await iterator.next();
        while (!res.done) {
            results.push(JSON.parse(res.value.value.toString()));
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }
}

module.exports = DocIntegrity;