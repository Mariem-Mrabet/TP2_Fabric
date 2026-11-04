'use strict';

const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

// ---------- Configuration ----------
const channelName = 'mychannel';
const chaincodeName = 'docintegrity';
const mspId = 'Org1MSP';

const cryptoPath = path.resolve(
    process.env.HOME, 'fabric', 'fabric-samples', 'test-network',
    'organizations', 'peerOrganizations', 'org1.example.com'
);
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'keystore');
const certDirectoryPath = path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'signcerts');
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');

const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';

// ---------- Identité Fabric ----------
async function firstFileIn(dir) {
    const files = await fs.readdir(dir);
    if (files.length === 0) {
        throw new Error(`Aucun fichier dans ${dir}`);
    }
    return path.join(dir, files[0]);
}

async function newIdentity() {
    const credentials = await fs.readFile(await firstFileIn(certDirectoryPath));
    return { mspId, credentials };
}

async function newSigner() {
    const privateKeyPem = await fs.readFile(await firstFileIn(keyDirectoryPath));
    return signers.newPrivateKeySigner(crypto.createPrivateKey(privateKeyPem));
}

async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, credentials, {
        'grpc.ssl_target_name_override': peerHostAlias
    });
}

// ---------- Utilitaires ----------
const decoder = new TextDecoder();

function errorMessage(err) {
    if (err.details && err.details.length > 0) {
        return err.details.map((d) => d.message).join(' | ');
    }
    return err.message;
}

function isValidHash(h) {
    return typeof h === 'string' && /^[0-9a-fA-F]{64}$/.test(h);
}

function isValidDocId(id) {
    return typeof id === 'string' && id.trim() !== '';
}

// ---------- Démarrage ----------
async function main() {
    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256
    });
    const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // Enregistrer une empreinte (transaction)
    app.post('/api/register', async (req, res) => {
        const { docId, hash: h } = req.body;
        if (!isValidDocId(docId) || !isValidHash(h)) {
            return res.status(400).json({ error: 'Identifiant ou hash invalide' });
        }
        try {
            const result = await contract.submitTransaction('registerHash', docId.trim(), h);
            res.json(JSON.parse(decoder.decode(result)));
        } catch (err) {
            res.status(500).json({ error: errorMessage(err) });
        }
    });

    // Lire l'empreinte enregistrée (lecture)
    app.get('/api/document/:docId', async (req, res) => {
        try {
            const result = await contract.evaluateTransaction('getHash', req.params.docId);
            res.json(JSON.parse(decoder.decode(result)));
        } catch (err) {
            res.status(500).json({ error: errorMessage(err) });
        }
    });

    // Vérifier l'intégrité (lecture)
    app.post('/api/verify', async (req, res) => {
        const { docId, hash: h } = req.body;
        if (!isValidDocId(docId) || !isValidHash(h)) {
            return res.status(400).json({ error: 'Identifiant ou hash invalide' });
        }
        try {
            const result = await contract.evaluateTransaction('verifyHash', docId.trim(), h);
            res.json(JSON.parse(decoder.decode(result)));
        } catch (err) {
            res.status(500).json({ error: errorMessage(err) });
        }
    });

    app.listen(3000, () => {
        console.log('Application disponible sur http://localhost:3000');
    });
}

main().catch((err) => {
    console.error('Erreur au démarrage :', err);
    process.exit(1);
});