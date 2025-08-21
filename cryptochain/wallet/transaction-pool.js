// cryptochain/wallet/transaction-pool.js
const Transaction = require('./transaction');

class TransactionPool {
  constructor() {
    // store as a plain object: { [id]: tx }
    this.transactionMap = {};
  }

  setTransaction(tx) {
    this.transactionMap[tx.id] = tx;
  }

  existingTransaction({ inputAddress }) {
    return Object.values(this.transactionMap)
      .find(tx => tx.input && tx.input.address === inputAddress);
  }

  validTransactions() {
    // IMPORTANT: Object.values (not .values())
    return Object.values(this.transactionMap)
      .filter(tx => Transaction.validTransaction(tx));
  }

  clear() {
    this.transactionMap = {};
  }

  clearBlockchainTransactions({ chain }) {
    // remove any tx that already made it into blocks
    for (let i = 1; i < chain.length; i++) {
      for (const tx of chain[i].data) {
        if (this.transactionMap[tx.id]) delete this.transactionMap[tx.id];
      }
    }
  }

  getAll() {
    return Object.values(this.transactionMap);
  }
}

module.exports = TransactionPool;
