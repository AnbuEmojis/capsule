const cryptoHash = require('./crypto-hash');

describe('cryptoHash()', () => {
    
    it('generates a SHA-256 hashed output', () => {
        expect(cryptoHash('foo'))
        .toEqual('b2213295d564916f89a6a42455567c87c3f480fcd7a1c15e220f17d7169a790b')
    });

    it('produces the same hash with the same input arguments in any order', () => {
        expect(cryptoHash('one', 'three', 'two')).toEqual(cryptoHash('three', 'two', 'one'))
    });

    it('produces a unique hash when the properties have changed on an input', () => {
        const foo = {};
        const originalHash = cryptoHash(foo);
        foo['a'] = 'a';

        expect(cryptoHash(foo)).not.toEqual(originalHash);
    });

    it('returns the same hash given the same input multiple times', () => {
        expect(cryptoHash('block-data')).toEqual(cryptoHash('block-data'));
    });
    
    it('returns different hashes for different inputs', () => {
        expect(cryptoHash('foo')).not.toEqual(cryptoHash('bar'));
    });
    it('verifies a valid signature', () => {
        const keyPair = ec.genKeyPair();
        const data = 'hello';
        const signature = keyPair.sign(cryptoHash(data));
      
        expect(verifySignature({
          publicKey: keyPair.getPublic().encode('hex'),
          data,
          signature
        })).toBe(true);
      });
      
      it('rejects an invalid signature', () => {
        const keyPair = ec.genKeyPair();
        const wrongKeyPair = ec.genKeyPair();
        const data = 'hello';
        const signature = keyPair.sign(cryptoHash(data));
      
        expect(verifySignature({
          publicKey: wrongKeyPair.getPublic().encode('hex'),
          data,
          signature
        })).toBe(false);
      });
      
    
});