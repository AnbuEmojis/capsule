// Updated server/index.js with liquidity API and swap simulation
const express = require('express');
const request = require('request');
const path = require('path');
const Blockchain = require('./blockchain');
const Wallet = require('./wallet');

function getWalletByAddress(address) {
    const wallet = new Wallet(); 
    wallet.publicKey = address;
    return wallet;
  }

const TransactionPool = require('./wallet/transaction-pool');
const PubSub = require('./app/pubsub');
const TransactionMiner = require('./app/transaction-miner');
const CapsuleCoin = require('./cpsule-coin');
const LiquidityPool = require('./liquidity-pool');


const isDevelopment = process.env.ENV === 'development';
const app = express();
const blockchain = new Blockchain();
const transactionPool = new TransactionPool();
const wallet = new Wallet();
const pubsub = new PubSub({ blockchain, transactionPool });
const transactionMiner = new TransactionMiner({ blockchain, transactionPool, wallet, pubsub });
const liquidityPool = new LiquidityPool();
const isValidAddress = (address) => /^[a-f0-9]{130}$/.test(address); // adjust regex as needed for your keys

const AutomationManager = require('./automation/automation');
const automation = new AutomationManager();

// Example use cases:
automation.setAutoSwapThreshold(1.2, 'above');
automation.monitorWalletBalance(wallet.publicKey, 50);
automation.scheduleLiquidityRebalancing();

// Example governance vote (run only once per proposal)
automation.governanceVote({
  id: 'proposal-1',
  title: 'Adjust CAP Supply',
  details: 'Reduce max CAP supply by 10%',
});


if (process.env.GENERATE_PEER_PORT !== 'true') {
    const tokenDistribution = CapsuleCoin.createGenesisDistribution({
        founderAddress: wallet.publicKey
    });

    blockchain.addBlock({ data: [tokenDistribution] });
}

const DEFAULT_PORT = 3000;
const ROOT_NODE_ADDRESS = `http://localhost:${DEFAULT_PORT}`;

const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/cryptochain', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

const connectDB = require('./db/connection');
connectDB();

app.use('/api/db', require('./routes/dbRoutes'));

// MongoDB Models
const NFT = require('./models/NFT');
const Stake = require('./models/Stake');
const Proposal = require('./models/Proposal');
const StoreItem = require('./models/StoreItem');

// serve governance page
app.get('/governance', (req, res) =>
    res.sendFile(path.join(__dirname, '../public/governance.html'))
  );
  
  // serve NFT gallery
  app.get('/nfts', (req, res) =>
    res.sendFile(path.join(__dirname, '../public/nfts.html'))
  );
  
  // serve staking portal
  app.get('/staking', (req, res) =>
    res.sendFile(path.join(__dirname, '../public/staking.html'))
  );
  
  // serve CAP storefront
  app.get('/store', (req, res) =>
    res.sendFile(path.join(__dirname, '../public/store.html'))
  );
  
  // then your existing fallback:
  app.get('*', (req, res) =>
    res.sendFile(path.join(__dirname, './public/capsule.html'))
  );
  

// --- NFT Routes ---
app.post('/api/mint-nft', async (req, res) => {
  const { owner, name, image, metadata } = req.body;
  try {
    const newNFT = await NFT.create({ owner, name, image, metadata, mintedAt: new Date() });
    res.json({ success: true, nft: newNFT });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/nfts/:owner', async (req, res) => {
  const { owner } = req.params;
  const nfts = await NFT.find({ owner });
  res.json(nfts);
});

// --- Staking Routes ---
app.post('/api/stake', async (req, res) => {
  const { address, amount } = req.body;
  try {
    const stake = await Stake.create({ address, amount, startTime: new Date() });
    res.json({ success: true, stake });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stakes/:address', async (req, res) => {
  const stakes = await Stake.find({ address: req.params.address });
  res.json(stakes);
});

// --- Governance Routes ---
app.post('/api/proposals', async (req, res) => {
  const { title, description } = req.body;
  try {
    const proposal = await Proposal.create({ title, description, votes: { yes: 0, no: 0, abstain: 0 }, createdAt: new Date() });
    res.json({ success: true, proposal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/proposals/:id/vote', async (req, res) => {
  const { vote } = req.body; // yes, no, abstain
  const proposal = await Proposal.findById(req.params.id);
  if (proposal && proposal.votes[vote] !== undefined) {
    proposal.votes[vote]++;
    await proposal.save();
    res.json({ success: true, proposal });
  } else {
    res.status(400).json({ success: false, message: "Invalid vote or proposal." });
  }
});

app.get('/api/proposals', async (req, res) => {
  const proposals = await Proposal.find({});
  res.json(proposals);
});

// --- CAP Store Routes ---
app.get('/api/store-items', async (req, res) => {
  const items = await StoreItem.find({});
  res.json(items);
});

app.post('/api/store-purchase', async (req, res) => {
  const { itemId, buyerAddress } = req.body;
  const item = await StoreItem.findById(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  // ⚠️ Here you'd also handle CAP deduction and blockchain recording
  res.json({ success: true, message: `Purchased ${item.name}`, item });
});




const users = []; // basic in-memory store, replace with database for production

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;

  // Basic checks (can expand with password hashing, etc.)
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Missing email or password' });
  }

  const existing = users.find(u => u.email === email);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }

  const wallet = new Wallet();
  users.push({ email, password, wallet });

  res.json({ success: true, wallet: { address: wallet.publicKey } });
});


// Phase 8 Additions to your index.js
const schedule = require('node-schedule');

// Memory store for automation rules
const automationRules = [];

// Auto-swap scheduler
schedule.scheduleJob('*/1 * * * *', () => {
    automationRules.forEach(rule => {
        if (rule.type === 'auto-swap') {
            const { inputSymbol, threshold, address } = rule;

            const { reserveCAP, reserveNATIVE } = liquidityPool.getReserves();
            const price = reserveNATIVE / reserveCAP;

            const shouldSwap =
                (inputSymbol === 'CAP' && price >= threshold) ||
                (inputSymbol === 'NATIVE' && 1 / price >= threshold);

            if (shouldSwap) {
                const wallet = getWalletByAddress(address);
                const balance = inputSymbol === 'CAP' ?
                    CapsuleCoin.balanceOf({ chain: blockchain.chain, address }) :
                    Wallet.calculateBalance({ chain: blockchain.chain, address });

                const inputAmount = Math.min(balance, rule.amount);

                if (inputAmount > 0) {
                    const result = liquidityPool.swap({ inputSymbol, inputAmount });

                    const swapTx = {
                        type: 'AUTO_SWAP',
                        inputSymbol,
                        inputAmount,
                        outputSymbol: result.outputSymbol,
                        outputAmount: result.outputAmount,
                        address,
                        timestamp: Date.now()
                    };

                    blockchain.addBlock({ data: [swapTx] });
                    pubsub.broadcastChain();
                    console.log(`[AUTO-SWAP] Executed swap for ${address} | ${inputAmount} ${inputSymbol} → ${result.outputAmount} ${result.outputSymbol}`);
                }
            }
        }
    });
});

// API to register automation rules
app.post('/api/automation', (req, res) => {
    const { address, type, inputSymbol, amount, threshold } = req.body;

    const rule = {
        address,
        type,
        inputSymbol,
        amount: parseFloat(amount),
        threshold: parseFloat(threshold),
        createdAt: Date.now()
    };

    automationRules.push(rule);
    res.json({ type: 'success', message: 'Rule added.', rule });
});


app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/blocks', (req, res) => {
    res.json(blockchain.chain);
});

app.post('/api/mine', (req, res) => {
    const { data } = req.body;
    blockchain.addBlock({ data });
    pubsub.broadcastChain();
    res.redirect('/api/blocks');
});

app.post('/api/transact', (req, res) => {
    try {
        const { amount, recipient, fee } = req.body;
        const wallet = getWalletByAddress(senderAddress); // Use address from request
        const transaction = wallet.createTransaction({
            recipient,
            amount,
            fee,
            chain: blockchain.chain
        });

        transactionPool.setTransaction(transaction);
        pubsub.broadcastTransaction(transaction);

        res.json({ type: 'success', transaction });
    } catch (error) {
        res.status(400).json({ type: 'error', message: error.message });
    }
});

app.post('/api/token-transfer', (req, res) => {
    try {
        const { recipient, amount } = req.body;
        const tokenTransfer = CapsuleCoin.createTransfer({
            senderWallet: wallet,
            recipient,
            amount
        });

        blockchain.addBlock({ data: [tokenTransfer] });
        pubsub.broadcastChain();

        res.json({ type: 'success', tokenTransfer });
    } catch (error) {
        res.status(400).json({ type: 'error', message: error.message });
    }
});

app.post('/api/liquidity', (req, res) => {
    try {
        const { amountToken, amountBase } = req.body;
        const result = liquidityPool.addLiquidity({
            providerAddress: wallet.publicKey,
            amountToken,
            amountBase
        });

        const liquidityTx = {
            type: 'LIQUIDITY_EVENT',
            event: 'add',
            provider: wallet.publicKey,
            share: result.shareMinted,
            reserves: liquidityPool.getReserves(),
            timestamp: Date.now()
        };

        blockchain.addBlock({ data: [liquidityTx] });
        pubsub.broadcastChain();

        res.json({ type: 'success', liquidityTx });
    } catch (error) {
        res.status(400).json({ type: 'error', message: error.message });
    }
});

app.post('/api/swap', (req, res) => {
    try {
        const { inputSymbol, inputAmount, senderAddress } = req.body;
        const result = liquidityPool.swap({ inputSymbol, inputAmount });

        const swapTx = {
            type: 'LIQUIDITY_EVENT',
            event: 'swap',
            inputSymbol,
            inputAmount,
            outputSymbol: result.outputSymbol,
            outputAmount: result.outputAmount,
            reserves: liquidityPool.getReserves(),
            timestamp: Date.now()
        };

        blockchain.addBlock({ data: [swapTx] });
        pubsub.broadcastChain();

        res.json({ type: 'success', swapTx });
    } catch (error) {
        res.status(400).json({ type: 'error', message: error.message });
    }
});

app.get('/api/transaction-pool-map', (req, res) => {
    res.json(transactionPool.transactionMap);
});

app.get('/api/mine-transactions', (req, res) => {
    transactionMiner.mineTransactions();
    res.redirect('/api/blocks');
});

app.get('/api/wallet-info', (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ type: 'error', message: 'Address is required' });
    }

    if (!isValidAddress(address)) {
      return res.status(400).json({ type: 'error', message: 'Invalid address format' });
    }

    const wallet = getWalletByAddress(address);
    const info = wallet.getInfo(blockchain.chain);

    res.json(info);
  } catch (error) {
    console.error(error);
    res.status(500).json({ type: 'error', message: error.message });
  }
});
    
  
  


// Fallback to index.html for any unknown routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './public/capsule.html'));
});

const syncWithRootState = () => {
    request({ url: `${ROOT_NODE_ADDRESS}/api/blocks` }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const rootChain = JSON.parse(body);
            blockchain.replaceChain(rootChain);
        }
    });

    request({ url: `${ROOT_NODE_ADDRESS}/api/transaction-pool-map` }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const rootTransactionPoolMap = JSON.parse(body);
            transactionPool.setMap(rootTransactionPoolMap);
        }
    });
};

let PEER_PORT;

if (process.env.GENERATE_PEER_PORT === 'true') {
    PEER_PORT = DEFAULT_PORT + Math.ceil(Math.random() * 1000);
}

const PORT = PEER_PORT || DEFAULT_PORT;

app.listen(PORT, () => {
    console.log(`Listening on localhost:${PORT}`);

    if (PORT !== DEFAULT_PORT) {
        syncWithRootState();
    }
});
