class TradingBot {
  initialize(state, context, args) {
    state.position = null;
    state.entryPrice = null;
    state.apiCounter = 15; // Initialize with maximum allowed API counter
    state.lastApiCall = Date.now(); // Track the last API call time
  }

  async runIteration(state, context, args) {
    const waitForApiLimit = async () => {
      let elapsedTime = (Date.now() - state.lastApiCall) / 1000;
      state.apiCounter += elapsedTime * 0.33; // Increment counter based on elapsed time
      state.apiCounter = Math.min(state.apiCounter, 15); // Cap the counter at 15
      while (state.apiCounter < 1) {
        // Ensure at least one API call is available
        await new Promise((resolve) => setTimeout(resolve, 1000));
        elapsedTime = (Date.now() - state.lastApiCall) / 1000;
        state.apiCounter += elapsedTime * 0.33;
        state.apiCounter = Math.min(state.apiCounter, 15);
      }
      state.apiCounter -= 1; // Decrement the counter for the current API call
      state.lastApiCall = Date.now();
    };

    try {
      const symbol = args.params.pair;
      const capitalBase = parseFloat(args.params.capitalBase);
      await waitForApiLimit();
      const balances = await this.exchange.fetchBalance();
      const usdtBalance = balances.USDT.free;

      if (state.position === null && usdtBalance >= capitalBase) {
        // Buy ETH/USDT using 100% of starting capital
        await waitForApiLimit();
        const ticker = await this.exchange.fetchTicker(symbol);
        const ethAmount = capitalBase / ticker.last;
        await waitForApiLimit();
        const order = await this.exchange.createOrder(symbol, "market", "buy", ethAmount);
        state.position = order.id;
        state.entryPrice = ticker.last;
        console.log(`Bought ${ethAmount} ETH at ${state.entryPrice} USDT`);
      } else if (state.position !== null) {
        // Check if we can sell at 2% profit
        await waitForApiLimit();
        const ticker = await this.exchange.fetchTicker(symbol);
        const targetPrice = state.entryPrice * 1.02;

        if (ticker.last >= targetPrice) {
          await waitForApiLimit();
          const order = await this.exchange.fetchOrder(state.position, symbol);
          const ethAmount = order.amount;
          await waitForApiLimit();
          const sellOrder = await this.exchange.createOrder(symbol, "market", "sell", ethAmount);
          console.log(`Sold ${ethAmount} ETH at ${ticker.last} USDT for a profit`);
          state.position = null;
          state.entryPrice = null;
        }
      }
    } catch (e) {
      console.error(`Error in runIteration: ${e.message}`);
      if (e.message.includes("Temporary lockout")) {
        console.error("Temporary lockout detected. Retrying in 60 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait for 60 seconds before retrying
        this.runIteration(state, context, args); // Retry the function
      } else {
        console.error(`Unhandled exception: ${e.message}`);
      }
    }
  }
}
