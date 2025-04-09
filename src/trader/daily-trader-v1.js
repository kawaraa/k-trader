/*

===> How DailyTrader works <===

- DailyTrader performs trading based on the provided strategy and settings. It analyzes the prices of the last xxx days on every xxx mins interval. every strategy has its settings.

- There are a currently 5 strategies:
1. ON-DROP: It buys if the current price drops -xxx% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
3. near-low: It buys if the current price drops -xxx% and near the lowest price in the last xxx days and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
5. on-increase: It buys if the RSI is less than 30 and increasing, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.

- Settings: are used to control whether it's a long term strategy or short term trading / daily trading strategy, you can set it up using the "strategy range" field. if it's a day or less then obviously it's a short term trading strategy. 

- Note: this is how limit orders are managed:
1. Check if there are buy order ID in state that has not been fulfilled, remove it from the state,
2. If fulfilled buy orders have fulfilled sell order, calculate the profits and remove these orders from the state
3. If it's good time to buy, place buy orders with 2 mins expire and store their IDs in the state.
4. If it's a good time to sell, place sell order with 2 mins expire and store it's ID in state with its buy order ID,
*/

const {
  calcPercentageDifference,
  calculateFee,
  calcAveragePrice,
  detectPriceShape,
  getSupportedModes,
  findPriceMovement,
} = require("../trend-analysis.js");
const strategyModes = getSupportedModes();
const TestExchangeProvider = require("./test-ex-provider.js");

// Smart trader
class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #pricePercentChange;
  constructor(exProvider, pair, info) {
    this.ex = exProvider;
    this.#pair = pair;
    this.timeInterval = +info.timeInterval;
    const strategySettings = (info.strategy || "").split(":");
    this.#capital = info.capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    this.mode = strategySettings[0];
    this.#strategyRange = +strategySettings[1]; // Range in hours "0.5 = have an hour"
    this.#pricePercentChange = +strategySettings[2]; // Percentage Change is the price Percentage Threshold
    this.strategyTimestamp = info.strategyTimestamp;
    this.halfPercent = this.#pricePercentChange / 2;
    this.thirdPercent = this.#pricePercentChange / 3;
    this.quarterPercent = this.#pricePercentChange / 4;

    this.period = +info.timeInterval; // this.period is deleted in only test trading
    this.testMode = info.testMode;
    this.listener = null;

    this.previouslyDropped = false;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.averageAskBidSpread;
    this.analysisPeriod = 2 * 24;
    this.lastTrade = 0;
  }

  async start() {
    try {
      const period = this.testMode ? this.#strategyRange : this.analysisPeriod;

      // Get data from Kraken
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      let prices = await this.ex.prices(this.#pair, period); // For the last xxx days
      const orders = await this.ex.getOrders(this.#pair);
      const enoughPricesData = prices.length >= (period * 60) / this.timeInterval; // 3 days
      // const lastProfit = (trades.slice(-2).reduce((acc, n) => acc + n, 0) / this.#capital) * 100;
      // const thereIsLoss = lastProfit < -this.halfPercent && this.strategyTimestamp / (60 * 24) > 1;
      const trades = await this.ex.getState(this.#pair, "trades");
      const trade1 = (trades.slice(-1) / this.#capital) * 100;
      const noSpike =
        trade1 - this.#pricePercentChange < this.halfPercent || !this.lastTrade || this.lastTrade > 60; // 1 hrs
      // const lowestBidPrice = prices.slice(-parseInt(prices.length / 3)).sort().at(0)?.bidPrice;

      this.strategyTimestamp = await this.ex.getState(this.#pair, "strategyTimestamp");
      const thereIsStrategy = this.#strategyRange && this.#pricePercentChange;

      if (!this.testMode) {
        const thereIsLoss = trade1 < -this.halfPercent && this.strategyTimestamp / (60 * 24) > 1;
        // const thereIsLoss = trade1 <= -1 && trade2 <= -1 && this.strategyTimestamp / (60 * 24) > 1;

        if (!enoughPricesData) {
          this.dispatch("strategy", { strategy: "", strategyTimestamp: 0 });
        } else if (!thereIsStrategy || thereIsLoss) {
          const strategy = await this.#findStrategy(this.#pair, prices, this.timeInterval);

          this.mode = strategy.mode;
          this.#strategyRange = strategy.strategyRange;
          this.#pricePercentChange = strategy.pricePercentChange;
          this.halfPercent = this.#pricePercentChange / 2;
          this.thirdPercent = this.#pricePercentChange / 3;
          this.quarterPercent = this.#pricePercentChange / 4;

          const strategyString = `${strategy.mode}:${strategy.strategyRange}:${strategy.pricePercentChange}`;
          this.dispatch("log", `Strategy change: ${strategyString}%`);

          if (strategy.profit < 0) return "Stop trading";
          this.dispatch("strategy", { strategy: `${strategyString}` });
        }

        prices = prices.slice(-((period * 60) / this.timeInterval));
      }

      if (thereIsStrategy) {
        if (!strategyModes.includes(this.mode)) throw new Error(`"${this.mode}" is Invalid mode!`);

        const bidPrices = prices.map((p) => p.bidPrice);
        const priceShape = detectPriceShape(bidPrices, this.quarterPercent).shape;
        const sortedBidPrices = bidPrices.sort();
        const highestBidPr = sortedBidPrices.at(-1);
        const lowestBidPrice = sortedBidPrices.at(0);
        const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);

        if (enoughPricesData && !this.averageAskBidSpread) {
          this.averageAskBidSpread = calcAveragePrice(
            prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
          );
        }

        const shouldTrade = enoughPricesData && askBidSpreadPercentage <= this.averageAskBidSpread * 1.3;
        const dropped = calcPercentageDifference(highestBidPr, askPrice) < -this.#pricePercentChange;
        const tooHigh = calcPercentageDifference(lowestBidPrice, bidPrice) > this.#pricePercentChange;
        const offset = this.mode.includes("ON-DROP") ? 0 : prices.length / 2;
        const priceMove = findPriceMovement(prices, this.quarterPercent, offset);
        const increasing = priceMove == "INCREASING";
        const orderPriceChange = calcPercentageDifference(orders[0]?.price, bidPrice);
        const loss = this.previousProfit - orderPriceChange;
        let shouldBuy = false;

        if (!this.previouslyDropped && dropped) this.previouslyDropped = true;
        if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;
        if (orderPriceChange < this.previousLoss) this.previousLoss = orderPriceChange;

        if (this.mode.includes("ON-DROP")) shouldBuy = dropped && increasing;
        else if (this.mode.includes("ON-DECREASE")) shouldBuy = this.previouslyDropped && increasing;
        else if (this.mode.includes("ON-V-SHAPE")) shouldBuy = !tooHigh && priceShape == "V";

        const log = `€${balance.eur.toFixed(2)} - Should buy: ${shouldBuy} Should trade: ${shouldTrade}`;
        this.dispatch("log", `${log} - Prices => Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`);

        this.lastTrade += 5;
        if (orders[0]) {
          this.lastTrade = 0;
          this.dispatch(
            "log",
            `Gain: ${this.previousProfit}% - Loss: ${this.previousLoss}% - Current: ${orderPriceChange}%`
          );
        }

        // Buy
        if (shouldTrade && !orders[0] && noSpike && shouldBuy) {
          if (!orders[0] && this.#capital > 0 && balance.eur >= this.#capital / 2) {
            const capital = balance.eur < this.#capital ? balance.eur : this.#capital;
            const cost = capital - calculateFee(capital, 0.4);
            const investingVolume = +(cost / askPrice).toFixed(8);
            const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
            this.dispatch("buy", orderId);
            this.dispatch("log", `Bought crypto with order ID "${orderId}" at ask Price above 👆`);
          }

          // Sell
        } else if (shouldTrade && balance.crypto > 0 && orders[0]) {
          let orderType = "profitable";
          let order = orders[0];
          // const dropSpeed = calcPercentageDifference(prices.at(-2).askPrice, prices.at(-1).askPrice);

          const goingDown =
            (this.previousProfit > this.#pricePercentChange && loss >= this.quarterPercent) ||
            (this.previousProfit > this.halfPercent && loss >= this.thirdPercent / 2) ||
            (this.previousProfit >= this.thirdPercent && loss >= this.previousProfit / 2);
          // this.quarterPercent

          const recoverLoss =
            this.previousLoss < -this.halfPercent &&
            orderPriceChange > this.previousLoss / 3 &&
            priceMove == "dropping";

          const stopLoss = loss >= Math.max(3, this.#pricePercentChange * 1.3);
          // const stopLoss = loss >= Math.max(3, this.halfPercent);
          // const stopLoss = loss >= Math.max(2, this.quarterPercent);

          if (!(goingDown || recoverLoss || stopLoss)) order = null;
          else {
            if (stopLoss) orderType = "stopLoss";
            if (recoverLoss) orderType = "recoverLoss";
            this.dispatch("log", `${orderType} order will be executed`);
          }

          if (order) {
            await this.#sell(order, balance.crypto, bidPrice);
            this.previousProfit = 0;
            this.previousLoss = 0;
            if (orderPriceChange > this.#pricePercentChange) this.previouslyDropped = false;
          }
        }
      }
      this.dispatch("log", "");
    } catch (error) {
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
  }

  async #sell({ id, volume, cost, price, createdAt }, cryptoBalance, bidPrice) {
    const amount = bidPrice * (cryptoBalance - volume) < 5 ? cryptoBalance : volume;
    const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
    const c = bidPrice * amount - calculateFee(bidPrice * amount, 0.4);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    const orderAge = ((Date.now() - createdAt) / 60000 / 60).toFixed(1);
    this.dispatch("sell", { id, profit });
    this.dispatch("log", `Sold crypto with profit: ${profit} - Age: ${orderAge}hrs - ID: "${id}"`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.#pair)).crypto;
    let profit = 0;
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.#pair);
      const bidPrice = (await this.ex.currentPrices(this.#pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.#pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);
    }
    this.dispatch("sell", { profit });
    this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }

  async #findStrategy(pair, prices, interval) {
    let workers = [];
    for (const mode of strategyModes) {
      for (let range = 0.5; range <= 12; range += range >= 1 ? 1 : 0.5) {
        for (let pricePercent = 1.5; pricePercent <= 10; pricePercent += 0.5) {
          workers.push(testStrategy(pair, prices, interval, mode, range, pricePercent));
        }
      }
    }

    const strategies = (await Promise.all(workers)).sort((a, b) => b.profit - a.profit);
    console.log(strategies.slice(0, 5));
    return strategies[0];
  }
}

async function testStrategy(pair, prices, interval, mode, strategyRange, pricePercentChange) {
  let transactions = 0;
  const ex = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, interval);
  const trader = new DailyTrader(ex, pair, {
    timeInterval: interval,
    capital: 100,
    strategy: `${mode}:${strategyRange}:${pricePercentChange}`,
    testMode: true,
  });

  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    }
  };

  for (const i in prices) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const profit = +(await ex.balance()).eur.toFixed(2) - 100;

  return { profit, crypto, transactions, mode, strategyRange, pricePercentChange };
}

module.exports = DailyTrader;

/*

// // ========== Prices Changes Tests ==========
// if (calcPercentageDifference(highestBidPr, askPrice) < -(this.#pricePercentChange * 2)) {
//   console.log("Should Buy:", askPrice, calcPercentageDifference(highestBidPr, askPrice)); // Buy
//   this.lastPrice = askPrice;
// } else if (
//   this.lastPrice &&
//   calcPercentageDifference(this.lastPrice, bidPrice) > this.#pricePercentChange
// ) {
//   console.log("Should Sell:", bidPrice, calcPercentageDifference(this.lastPrice, bidPrice)); // Sell
//   if (!this.profit) this.profit = 0;
//   this.profit += bidPrice - this.lastPrice;
//   this.lastPrice = bidPrice;
//   console.log("profit", this.profit);
// }

*/
