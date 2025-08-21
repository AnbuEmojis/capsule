const Block = require('./block');
const Transaction = require('../wallet/transaction');
const Wallet = require('../wallet');
const { cryptoHash } = require('../util');
const { REWARD_INPUT, MINING_REWARD } = require('../config');
const path  = require('path');
const { Level } = require('level');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'change_this_secret';

// data directory (create ./data if it doesn't exist)
const CHAIN_DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'chainDB');

let __BLOCKCHAIN_SINGLETON__ = null;


class Blockchain {
    constructor() {
        if (__BLOCKCHAIN_SINGLETON__) return __BLOCKCHAIN_SINGLETON__; // ← singleton guard

      this.chain = [Block.genesis()];
      this.db = new Level(CHAIN_DB_PATH, { valueEncoding: 'json' });
  
      // OPEN FIRST, then load chain
      this.ready = (async () => {
        await this.db.open();
        await this._loadChain();
      })();

      __BLOCKCHAIN_SINGLETON__ = this; // ← remember the instance
    }
  
    async _loadChain() {
      try {
        const storedChain = await this.db.get('chain');
        if (Array.isArray(storedChain) && storedChain.length > 0) {
          this.chain = storedChain;
          console.log('Loaded chain from disk:', this.chain.length, 'blocks');
        } else {
          await this.db.put('chain', this.chain);
        }
      } catch (err) {
        if (err.notFound) {
          console.warn('No chain on disk; keeping genesis');
          await this.db.put('chain', this.chain);
        } else {
          throw err;
        }
      }
    }
  
    addBlock({ data }) {
      const newBlock = Block.minedBlock({
        lastBlock: this.chain[this.chain.length - 1],
        data
      });
      this.chain.push(newBlock);
      // safe to write: db already opened in this.ready
      this.db.put('chain', this.chain).catch(console.error);
      return newBlock;
    }

    replaceChain(chain, validateTransactions, onSuccess) {
        if(chain.length <= this.chain.length) {
            console.error('the incoming chain must be longer');
            return;
        }

        if(!Blockchain.isValidChain(chain)){
            console.error('the incoming chain must be valid');
            return;
        }

        if(validateTransactions && !this.validTransactionData({ chain })) {
            console.log('The incoming chain has invalid data');
            return;
        }

        if (onSuccess) onSuccess();
        this.chain = chain;
        this.db.put('chain', this.chain).catch(console.error);
      }

    validTransactionData({ chain}) {
        for(let i=1; i<chain.length; i++) {
            const block = chain[i];
            const transactionSet = new Set();
            let rewardTransactionCount = 0;

            for(let transaction of block.data) {
                if(transaction.input.address === REWARD_INPUT.address) {
                    rewardTransactionCount += 1;

                    if(rewardTransactionCount > 1) {
                        console.error('Miner rewards exceed limit');
                        return false;
                    }

                    if(Object.values(transaction.outputMap)[0]!== MINING_REWARD) {
                        console.error('Miner reward amount is invalid');
                        return false;
                    }
                }else {
                    if(!Transaction.validTransaction(transaction)) {
                        console.error['Invalid transaction']
                        return false;
                    }

                    const trueBalance = Wallet.calculateBalance({
                        chain: this.chain,
                        address: transaction.input.address
                    });

                    if(transaction.input.amount !==trueBalance) {
                        console.error('Invalid input amount')
                        return false;
                    }

                    if(transactionSet.has(transaction)) {
                        console.error('An identical transaction appears more than once in the block');
                        return false;
                    }else{
                        transactionSet.add(transaction);
                    }
                }
            }
        }
        return true;
    }
    

    static isValidChain(chain) {
        if(JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
            return false;
        };

        for (let i=1; i<chain.length; i++) {
            const { timestamp, lastHash, hash, nonce, difficulty, data } = chain[i];
            const actualLastHash = chain[i-1].hash;
            const lastDifficulty = chain[i-1].difficulty;

            if(lastHash !== actualLastHash) return false;

            const validatedHash = cryptoHash(timestamp, lastHash, data, nonce, difficulty);
            
            if(hash !== validatedHash) return false;

            if(Math.abs(lastDifficulty - difficulty) > 1) return false;
        }
        function auth(req, res, next) {
            const h = req.headers.authorization || '';
            const token = h.startsWith('Bearer ') ? h.slice(7) : null;
            if (!token) return res.status(401).json({ message: 'Missing token' });
            try {
              req.user = jwt.verify(token, SECRET);
              next();
            } catch (e) {
              return res.status(401).json({ message: 'Invalid token' });
            }
          }
          

        return true;
    }
}

module.exports = Blockchain