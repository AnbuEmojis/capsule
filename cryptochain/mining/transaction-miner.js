// cryptochain/mining/transaction-miner.js
const { blockSubsidy } = require('../emissions.js');
let Transaction;
try { Transaction = require('../wallet/transaction'); }
catch { try { Transaction = require('../../wallet/transaction'); } catch { Transaction = require('../wallet/transaction'); } }

class TransactionMiner {
  constructor({ blockchain, transactionPool, wallet }) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.wallet = wallet;
  }

  mineTransactions() {
    const txs = this.transactionPool?.validTransactions
      ? this.transactionPool.validTransactions()
      : Object.values(this.transactionPool?.transactionMap || {});

    const height = this.blockchain.chain.length;
    const subsidy = blockSubsidy(height);
    const totalFees = txs.reduce((sum, t) => sum + (Number(t.fee) || 0), 0);
    const rewardAmount = subsidy + totalFees;

    const rewardTx = (Transaction.rewardTransaction)
      ? Transaction.rewardTransaction({ minerAddress: this.wallet.publicKey, amount: rewardAmount })
      : new Transaction({ input: { address: '*coinbase*' }, outputMap: { [this.wallet.publicKey]: rewardAmount } });

    const blockData = [rewardTx, ...txs];
    this.blockchain.addBlock({ data: blockData });

    if (this.transactionPool?.clearBlockchainTransactions) {
      this.transactionPool.clearBlockchainTransactions({ chain: this.blockchain.chain });
    } else if (this.transactionPool?.clear) {
      this.transactionPool.clear();
    }
  }
}

module.exports = TransactionMiner;
