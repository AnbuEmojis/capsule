// capsule-coin.test.js
const CapsuleCoin = require('./capsule-coin');
const Wallet = require('./wallet');
const { verifySignature } = require('./util');

describe('CapsuleCoin', () => {
  let founderWallet, recipientWallet;

  beforeEach(() => {
    founderWallet = new Wallet();
    recipientWallet = new Wallet();
  });

  describe('createGenesisDistribution()', () => {
    it('creates a valid genesis distribution transaction', () => {
      const tx = CapsuleCoin.createGenesisDistribution({ founderAddress: founderWallet.publicKey });
      expect(tx.type).toBe('CAPSULE_DISTRIBUTION');
      expect(tx.outputMap[founderWallet.publicKey]).toBe(CapsuleCoin.TOTAL_SUPPLY);
      expect(tx.input.address).toBe('*capsule-coin-genesis*');
    });
  });

  describe('createTransfer()', () => {
    it('creates a valid token transfer from sender to recipient', () => {
      founderWallet.tokenBalance = CapsuleCoin.TOTAL_SUPPLY;
      const tx = CapsuleCoin.createTransfer({
        senderWallet: founderWallet,
        recipient: recipientWallet.publicKey,
        amount: 1000
      });

      expect(tx.type).toBe('CAPSULE_TRANSFER');
      expect(tx.outputMap[recipientWallet.publicKey]).toBe(1000);
      expect(tx.outputMap[founderWallet.publicKey]).toBe(CapsuleCoin.TOTAL_SUPPLY - 1000);
      expect(
        verifySignature({
          publicKey: founderWallet.publicKey,
          data: tx.outputMap,
          signature: tx.input.signature
        })
      ).toBe(true);
    });
  });

  describe('validTransfer()', () => {
    it('returns true for a valid transfer', () => {
      founderWallet.tokenBalance = CapsuleCoin.TOTAL_SUPPLY;
      const tx = CapsuleCoin.createTransfer({
        senderWallet: founderWallet,
        recipient: recipientWallet.publicKey,
        amount: 5000
      });

      expect(CapsuleCoin.validTransfer(tx)).toBe(true);
    });

    it('returns false if output total mismatches input amount', () => {
      founderWallet.tokenBalance = CapsuleCoin.TOTAL_SUPPLY;
      const tx = CapsuleCoin.createTransfer({
        senderWallet: founderWallet,
        recipient: recipientWallet.publicKey,
        amount: 5000
      });
      tx.outputMap[recipientWallet.publicKey] = 9999; // tamper
      expect(CapsuleCoin.validTransfer(tx)).toBe(false);
    });

    it('returns false for invalid signature', () => {
      founderWallet.tokenBalance = CapsuleCoin.TOTAL_SUPPLY;
      const tx = CapsuleCoin.createTransfer({
        senderWallet: founderWallet,
        recipient: recipientWallet.publicKey,
        amount: 1000
      });
      tx.input.signature = new Wallet().sign('fake-data');
      expect(CapsuleCoin.validTransfer(tx)).toBe(false);
    });
  });
});
