// automation/automation.js
const schedule = require('node-schedule');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const EventEmitter = require('events');

class AutomationManager extends EventEmitter {
  constructor() {
    super();
    this.priceThreshold = null;
    this.walletAlertThreshold = null;
    this.intervalJob = null;
  }

  async fetchLiquidityStats() {
    const res = await fetch('http://localhost:3000/api/liquidity-stats');
    return res.json();
  }

  async fetchWalletInfo(address) {
    const res = await fetch(`http://localhost:3000/api/wallet-info?address=${address}`);
    return res.json();
  }

  setAutoSwapThreshold(threshold, direction = 'above') {
    this.priceThreshold = { value: threshold, direction };
    this.monitorAutoSwap();
  }

  monitorAutoSwap() {
    if (this.intervalJob) clearInterval(this.intervalJob);
    this.intervalJob = setInterval(async () => {
      const stats = await this.fetchLiquidityStats();
      const price = stats.reserveNATIVE / stats.reserveCAP;

      if (
        (this.priceThreshold.direction === 'above' && price > this.priceThreshold.value) ||
        (this.priceThreshold.direction === 'below' && price < this.priceThreshold.value)
      ) {
        console.log(`🔥 AutoSwap Triggered @ price ${price}`);
        await fetch('http://localhost:3000/api/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputSymbol: 'CAP', inputAmount: 10 })
        });
        this.emit('autoswap', { triggeredAt: price });
      }
    }, 10000);
  }

  async monitorWalletBalance(address, threshold) {
    this.walletAlertThreshold = { address, threshold };

    schedule.scheduleJob('*/30 * * * * *', async () => {
      const info = await this.fetchWalletInfo(address);
      if (info.capTokenBalance < threshold) {
        console.log(`🚨 Wallet ${address} CAP balance below threshold: ${info.capTokenBalance}`);
        this.emit('walletAlert', { address, capBalance: info.capTokenBalance });
      }
    });
  }

  scheduleLiquidityRebalancing(intervalMinutes = 10) {
    schedule.scheduleJob(`*/${intervalMinutes} * * * *`, async () => {
      const stats = await this.fetchLiquidityStats();

      const imbalance = Math.abs(stats.reserveCAP - stats.reserveNATIVE);
      if (imbalance > 50) {
        const direction = stats.reserveCAP > stats.reserveNATIVE ? 'CAP' : 'NATIVE';
        console.log(`♻️ Rebalancing: Swapping excess ${direction}`);
        await fetch('http://localhost:3000/api/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputSymbol: direction,
            inputAmount: Math.floor(imbalance / 2)
          })
        });
      }
    });
  }

  async governanceVote(proposal) {
    const tx = {
      type: 'GOVERNANCE',
      proposal,
      timestamp: Date.now()
    };

    await fetch('http://localhost:3000/api/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [tx] })
    });
    console.log(`📩 Governance vote added to chain:`, proposal);
  }
}

module.exports = AutomationManager;
