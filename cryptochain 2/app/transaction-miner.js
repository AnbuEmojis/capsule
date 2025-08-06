const Transaction = require('../wallet/transaction');

class TransactionMiner {
    constructor({ blockchain, transactionPool, wallet, pubsub }) {
        this.blockchain = blockchain;
        this.transactionPool = transactionPool;
        this.wallet = wallet;
        this.pubsub = pubsub;

    }

    mineTransactions() {
        // Get all valid transactions from the pool
        const validTransactions = this.transactionPool.validTransactions();

        // Calculate total fees from the valid transactions
        const totalFees = validTransactions.reduce((total, transaction) => {
            const fee = transaction.outputMap?.['feeCollector'] || 0;
            return total + fee;
        }, 0);

        // Add the mining reward transaction with the total fees included
        validTransactions.push(
            
            Transaction.rewardTransaction({
                minerWallet: this.wallet,
                totalFees
            })
        );

        // Add a new block with the valid transactions + reward transaction
        this.blockchain.addBlock({ data: validTransactions });

        // Broadcast the updated blockchain to the network
        this.pubsub.broadcastChain();

        // Clear the transaction pool
        this.transactionPool.clear();
    }
}

module.exports = TransactionMiner;
