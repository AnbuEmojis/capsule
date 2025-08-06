const uuid = require('uuid/v1');
const { verifySignature, cryptoHash } = require('../util');
const { REWARD_INPUT, MINING_REWARD } = require('../config');

class Transaction {
    constructor({ senderWallet, recipient, amount, fee = 0, outputMap, input }) {
        this.id = uuid();
        this.outputMap = outputMap || this.createOutputMap({ senderWallet, recipient, amount, fee });
        this.input = input || this.createInput({ senderWallet, outputMap: this.outputMap });
    }

    createOutputMap({ senderWallet, recipient, amount, fee = 0 }) {
        const outputMap = {};
    
        outputMap[recipient] = amount;
        outputMap[senderWallet.publicKey] = senderWallet.balance - amount - fee;
    
        if (fee > 0) {
            outputMap['feeCollector'] = fee;
        }
    
        return outputMap;
    }

    createInput({ senderWallet, outputMap }) {
        return {
            timestamp: Date.now(),
            amount: (senderWallet && senderWallet.balance) ? senderWallet.balance : 0,
            address: senderWallet.publicKey,
            signature: senderWallet.sign(cryptoHash(outputMap))
        };
    }

    update({ senderWallet, recipient, amount, fee = 0 }) {
        if ((amount + fee) > this.outputMap[senderWallet.publicKey]) {
            throw new Error('Amount plus fee exceeds balance');
        }
    
        if (!this.outputMap[recipient]) {
            this.outputMap[recipient] = amount;
        } else {
            this.outputMap[recipient] += amount;
        }
    
        this.outputMap[senderWallet.publicKey] -= (amount + fee);
    
        if (fee > 0) {
            if (!this.outputMap['feeCollector']) {
                this.outputMap['feeCollector'] = fee;
            } else {
                this.outputMap['feeCollector'] += fee;
            }
        }
    
        this.input = this.createInput({ senderWallet, outputMap: this.outputMap });
    }

    static validTransaction(transaction) {
        const { input: { address, amount, signature }, outputMap } = transaction;

        const outputTotal = Object.values(outputMap).reduce((total, outputAmount) => total + outputAmount);

        if (amount !== outputTotal) {
            console.error(`Invalid transaction from ${address}`);
            return false;
        }

        if (!verifySignature({ publicKey: address, data: outputMap, signature })) {
            console.error(`Invalid signature from ${address}`);
            return false;
        }

        return true;
    }
    static rewardTransaction({ minerWallet, totalFees = 0 }) {
        const reward = MINING_REWARD + totalFees;
      
        return new Transaction({
          input: Transaction.createInput({ senderWallet: minerWallet }),
          outputMap: {
            [minerWallet.publicKey]: reward
          }
        });
      }
      
      
      static createInput({ senderWallet, outputMap }) {
        return {
            timestamp: Date.now(),
            amount: (senderWallet && senderWallet.balance) ? senderWallet.balance : 0,
            address: senderWallet.publicKey,
            signature: senderWallet.sign(cryptoHash(outputMap))
        };
    }
      
}

module.exports = Transaction;
