// capsule-coin.js
const { cryptoHash } = require('./util');
const { verifySignature } = require('./util');

class CapsuleCoin {
  static TOKEN_NAME = 'Capsule Coin';
  static SYMBOL = 'CAP';
  static TOTAL_SUPPLY = 60_000_000;

  static createGenesisDistribution({ founderAddress }) {
    return {
      type: 'CAPSULE_DISTRIBUTION',
      outputMap: {
        [founderAddress]: CapsuleCoin.TOTAL_SUPPLY
      },
      input: {
        timestamp: Date.now(),
        amount: CapsuleCoin.TOTAL_SUPPLY,
        address: '*capsule-coin-genesis*',
        signature: 'GENESIS'
      },
      hash: cryptoHash('CAPSULE_DISTRIBUTION', founderAddress, CapsuleCoin.TOTAL_SUPPLY)
    };
  }

  static createTransfer({ senderWallet, recipient, amount }) {
    const outputMap = {
      [recipient]: amount,
      [senderWallet.publicKey]: senderWallet.tokenBalance - amount
    };

    return {
      type: 'CAPSULE_TRANSFER',
      outputMap,
      input: {
        timestamp: Date.now(),
        amount: senderWallet.tokenBalance,
        address: senderWallet.publicKey,
        signature: senderWallet.sign(cryptoHash(outputMap))
      },
      hash: cryptoHash('CAPSULE_TRANSFER', senderWallet.publicKey, recipient, amount)
    };
  }

  static validTransfer(transaction) {
    const { input, outputMap } = transaction;

    const outputTotal = Object.values(outputMap).reduce((total, val) => total + val, 0);
    if (outputTotal !== input.amount) {
      console.error('CAP transaction total output mismatch');
      return false;
    }

    const isValid = verifySignature({
      publicKey: input.address,
      data: outputMap,
      signature: input.signature
    });

    if (!isValid) {
      console.error('Invalid CAP transaction signature');
    }

    return isValid;
  }
}

module.exports = CapsuleCoin;
