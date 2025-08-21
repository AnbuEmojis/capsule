// /cryptochain/app/pubsub.js

const { createClient } = require('redis');

const CHANNELS = {
  TEST:        'TEST',
  BLOCKCHAIN:  'BLOCKCHAIN',
  TRANSACTION: 'TRANSACTION'
};

class PubSub {
  constructor({ blockchain, transactionPool }) {
    this.blockchain      = blockchain;
    this.transactionPool = transactionPool;

    // Redis v4 clients need to be connected before use
    this.publisher  = createClient();
    this.subscriber = createClient();

    this.publisher.connect();
    this.subscriber.connect();

    // Subscribe directly with callbacks instead of .on('message')
    this.subscriber.subscribe(
      CHANNELS.BLOCKCHAIN,
      (message) => this.handleMessage(CHANNELS.BLOCKCHAIN, message)
    );
    this.subscriber.subscribe(
      CHANNELS.TRANSACTION,
      (message) => this.handleMessage(CHANNELS.TRANSACTION, message)
    );
  }

      handleMessage(channel, message) {
        const parsed = JSON.parse(message);
 
    switch (channel) {
      case CHANNELS.BLOCKCHAIN:
            this.blockchain.replaceChain(parsed, true, () => {
             this.transactionPool.clearBlockchainTransactions({ chain: parsed });
             this.transactionPool.clear();
          });
        break;

      case CHANNELS.TRANSACTION:
        // inject a single transaction into the pool
        this.transactionPool.setTransaction(parsed);
        break;

      default:
        // ignore
        return;
    }
  }

  subscribeToChannels() {
    Object.values(CHANNELS).forEach(channel =>
      this.subscriber.subscribe(channel)
    );
  }

  publish({ channel, message }) {
    // simplest form; you can re-subscribe logic if you like
    this.publisher.publish(channel, message);
  }

  broadcastChain() {
    this.publish({
      channel: CHANNELS.BLOCKCHAIN,
      message: JSON.stringify(this.blockchain.chain)
    });
  }

  broadcastTransaction(transaction) {
    this.publish({
      channel: CHANNELS.TRANSACTION,
      message: JSON.stringify(transaction)
    });
  }
}

module.exports = PubSub;
