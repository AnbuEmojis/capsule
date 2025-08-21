// cryptochain/wallet/transaction.js
const { v4: uuid } = require('uuid');
const { verifySignature, cryptoHash } = require('../util');
const { REWARD_INPUT, MINING_REWARD } = require('../config');

class Transaction {
  /**
   * Flexible constructor:
   * - Normal tx:  new Transaction({ senderWallet, recipient, amount, fee })
   * - System/reward tx: new Transaction({ input, outputMap })
   */
  constructor({ id, senderWallet, recipient, amount, fee = 0, input, outputMap }) {
    this.id = id || uuid();

    // Reward/system transaction path (already formed)
    if (outputMap) {
      this.outputMap = outputMap;
      this.input = input || null;
      return;
    }

    // Normal user-signed transaction
    if (!senderWallet) throw new Error('senderWallet required for normal tx');

    this.outputMap = this.createOutputMap({ senderWallet, recipient, amount, fee });
    this.input = this.createInput({ senderWallet, outputMap: this.outputMap });
  }

  createOutputMap({ senderWallet, recipient, amount, fee }) {
    const map = {};
    map[recipient] = Number(amount);
    map[senderWallet.publicKey] =
      Number(senderWallet.balance) - Number(amount) - Number(fee || 0);
    return map;
  }

  createInput({ senderWallet, outputMap }) {
    return {
      timestamp: Date.now(),
      amount: senderWallet.balance,
      address: senderWallet.publicKey,
      signature: senderWallet.sign(cryptoHash(outputMap))
    };
  }

  /**
   * Validation:
   * - System/reward tx: allowed (REWARD_INPUT or input.address === 'SYSTEM')
   * - Normal tx: sum of outputs must equal input.amount & signature must verify
   */
  static validTransaction(tx) {
    const { input, outputMap } = tx;

    // System / reward transactions
    if (!input || input.address === 'SYSTEM' ||
        (REWARD_INPUT && input.address === REWARD_INPUT.address)) {
      return true;
    }

    // Sum check
    const outputTotal = Object.values(outputMap)
      .reduce((t, a) => t + Number(a), 0);
    if (outputTotal !== Number(input.amount)) {
      console.log(`Invalid transaction total from ${input.address}`);
      return false;
    }

    // Signature check
    const ok = verifySignature({
      publicKey: input.address,
      data: cryptoHash(outputMap),
      signature: input.signature
    });
    if (!ok) {
      console.log(`Invalid signature from ${input.address}`);
      return false;
    }
    return true;
  }

  /**
   * Reward transaction for the miner.
   * Use REWARD_INPUT for coinbase semantics.
   * Call as: Transaction.rewardTransaction({ minerAddress, amount })
   */
  static rewardTransaction({ minerAddress, amount = MINING_REWARD }) {
    if (!minerAddress) throw new Error('minerAddress required');
    return new this({
      input: REWARD_INPUT,
      outputMap: { [minerAddress]: Number(amount) }
    });
  }
}

module.exports = Transaction;
