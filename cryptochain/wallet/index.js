const crypto = require('crypto');
const Transaction = require('./transaction');
const { STARTING_BALANCE } = require('../config');
const { ec, cryptoHash } = require('../util');

class Wallet {
    constructor() {
        this.balance = STARTING_BALANCE;

        this.keyPair = ec.genKeyPair();
        this.publicKey = this.keyPair.getPublic().encode('hex');
        this.address = Wallet.generateAddress(this.publicKey);
    }

    sign(data) {
        return this.keyPair.sign(cryptoHash(data));
    }

    createTransaction({ recipient, amount, fee = 0, chain }) {
        if (chain) {
          this.balance = Wallet.calculateBalance({
            chain,
            address: this.publicKey
          });
        }
      
        if (amount + fee > this.balance) {
          throw new Error(`Amount plus fee exceeds current balance`);
        }
      
        return new Transaction({
          senderWallet: this,
          recipient,
          amount,
          fee
        });
      }

      static calculateBalance({ chain, address }) {
        if (!address) throw new Error("Address is required to calculate balance");
        // continue with logic...
      }      
      

    static generateAddress(publicKey) {
        return crypto
            .createHash('ripemd160')
            .update(crypto.createHash('sha256').update(publicKey).digest())
            .digest('hex');
    }

    static calculateBalance({ chain, address }) {
        if (!address) {
          throw new Error("calculateBalance: Wallet address is undefined");
        }
      
        let hasConductedTransaction = false;
        let outputTotal = 0;
      
        for (let i = chain.length - 1; i > 0; i--) {
          const block = chain[i];
      
          for (let transaction of block.data) {
            if (!transaction.input) continue;
      
            // Check if this wallet was the sender
            if (transaction.input.address === address) {
              hasConductedTransaction = true;
            }
      
            const output = transaction.outputMap?.[address];
            if (output !== undefined) {
              outputTotal += output;
            }
          }
      
          if (hasConductedTransaction) break;
        }
      
        return hasConductedTransaction ? outputTotal : STARTING_BALANCE;
      }
      

    static verifySignature({ publicKey, data, signature }) {
        const keyFromPublic = ec.keyFromPublic(publicKey, 'hex');
        return keyFromPublic.verify(cryptoHash(data), signature);
    }

    toString(chain) {
        const currentBalance = chain
            ? Wallet.calculateBalance({ chain, address: this.publicKey })
            : this.balance;

        return `Wallet -
  Address: ${this.address}
  Balance: ${currentBalance}`;
    }

    getInfo(chain) {
        const balance = Wallet.calculateBalance({
            chain,
            address: this.publicKey
        });

        return {
            publicKey: this.publicKey,
            address: this.address,
            balance
        };
    }
}

module.exports = Wallet;
