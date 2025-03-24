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
} = require("./trend-analysis.js");
const strategyModes = getSupportedModes();
const TestExchangeProvider = require("./test-ex-provider.js");

// Smart trader
class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #pricePercentChangeThreshold;
  constructor(exProvider, pair, info) {
    this.ex = exProvider;
    this.#pair = pair;
    this.timeInterval = +info.timeInterval;
    const strategySettings = (info.strategy || "").split(":");
    // const [mode, range, pricePercent] = (strategy || "").split(":");
    this.#capital = info.capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    this.mode = strategySettings[0];
    this.#strategyRange = +strategySettings[1]; // Range in hours "0.5 = have an hour"
    this.#pricePercentChangeThreshold = +strategySettings[2]; // Percentage Change is the price Percentage Threshold
    this.strategyTimestamp = info.strategyTimestamp;
    this.buyOnThreshold = this.#pricePercentChangeThreshold / 4;

    this.period = +info.timeInterval; // this.period is deleted in only test trading
    this.testMode = info.testMode;
    this.listener = null;

    this.previouslyDropped = false;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.averageAskBidSpread;
    this.analysisPeriod = 3 * 24;
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

      this.strategyTimestamp = await this.ex.getState(this.#pair, "strategyTimestamp");
      const thereIsStrategy = this.#strategyRange && this.#pricePercentChangeThreshold;

      if (!this.testMode) {
        const lastProfit = ((await this.ex.getState(this.#pair, "trades")).at(-1) / this.#capital) * 100;
        const thereIsLoss =
          lastProfit < -(this.#pricePercentChangeThreshold / 2) && this.strategyTimestamp / (60 * 24) > 1;

        if (!enoughPricesData) {
          this.dispatch("strategy", { strategy: "", strategyTimestamp: 0 });
        } else if (!thereIsStrategy || thereIsLoss) {
          const strategy = await this.#findStrategy(this.#pair, prices, this.timeInterval);

          this.mode = strategy.mode;
          this.#strategyRange = strategy.strategyRange;
          this.#pricePercentChangeThreshold = strategy.pricePercentChange;
          this.buyOnThreshold = this.#pricePercentChangeThreshold / 4;
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
        const priceShape = detectPriceShape(bidPrices, this.buyOnThreshold).shape;
        const highestBidPr = bidPrices.sort().at(-1);
        const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);

        if (enoughPricesData && !this.averageAskBidSpread) {
          this.averageAskBidSpread = calcAveragePrice(
            prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
          );
        }

        const shouldTrade = enoughPricesData && askBidSpreadPercentage <= this.averageAskBidSpread * 1.1;
        const dropped = calcPercentageDifference(highestBidPr, askPrice) < -this.#pricePercentChangeThreshold;
        const offset = this.mode.includes("ON-DROP") ? 0 : prices.length / 2;
        const priceMove = this.#findPriceMovement(prices, this.buyOnThreshold, offset);
        const increasing = priceMove == "increasing";
        const orderPriceChange = calcPercentageDifference(orders[0]?.price, bidPrice);
        const loss = this.previousProfit - orderPriceChange;
        let shouldBuy = false;

        if (!this.previouslyDropped && dropped) this.previouslyDropped = true;
        if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;
        if (orderPriceChange < this.previousLoss) this.previousLoss = orderPriceChange;

        if (this.mode.includes("ON-DROP")) shouldBuy = dropped && increasing;
        else if (this.mode.includes("ON-DECREASE")) shouldBuy = this.previouslyDropped && increasing;
        else if (this.mode.includes("ON-V-SHAPE")) shouldBuy = priceShape == "V";

        const log = `EUR: ${balance.eur.toFixed(2)} - Should buy: ${shouldBuy} Should trade: ${shouldTrade}`;
        this.dispatch("log", ` - ${log} - Prices => Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`);
        if (orders[0]) {
          this.dispatch(
            "log",
            `Gain: ${this.previousProfit}% - Loss: ${this.previousLoss}% - Current: ${orderPriceChange}%`
          );
        }

        // Buy
        if (shouldTrade && shouldBuy) {
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
          let order = orders[0];

          const goingDown =
            (this.previousProfit > this.#pricePercentChangeThreshold &&
              loss > this.#pricePercentChangeThreshold / 2) ||
            (this.previousProfit > this.#pricePercentChangeThreshold / 2 &&
              loss > this.#pricePercentChangeThreshold / 3) ||
            (this.previousProfit > this.#pricePercentChangeThreshold / 3 && loss > this.buyOnThreshold);
          const stopLoss = this.previousProfit == 0 && loss >= 1;

          if (!(goingDown || stopLoss)) order = null;
          else this.dispatch("log", `${stopLoss ? "stopLoss" : "profitable"} order will be executed`);

          if (order) {
            await this.#sell(order, balance.crypto, bidPrice);
            this.previousProfit = 0;
            this.previousLoss = 0;
            if (orderPriceChange > 0) this.previouslyDropped = false;
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

  #findPriceMovement(prices, minPercent, offset = 0) {
    const length = prices.length - 2;
    let latest = prices.at(-2);
    let lowest = latest;

    for (let i = length; i > offset; i--) {
      const previous = prices[i + 1];
      const current = prices[i];
      if (current.askPrice <= previous.askPrice) lowest = current;

      if (calcPercentageDifference(lowest.askPrice, latest.askPrice) >= minPercent) return "increasing";
      else if (calcPercentageDifference(current.askPrice, latest.askPrice) <= -minPercent) return "dropping";
    }
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

    return (await Promise.all(workers)).sort((a, b) => b.profit - a.profit)[0];
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
// if (calcPercentageDifference(highestBidPr, askPrice) < -(this.#pricePercentChangeThreshold * 2)) {
//   console.log("Should Buy:", askPrice, calcPercentageDifference(highestBidPr, askPrice)); // Buy
//   this.lastPrice = askPrice;
// } else if (
//   this.lastPrice &&
//   calcPercentageDifference(this.lastPrice, bidPrice) > this.#pricePercentChangeThreshold
// ) {
//   console.log("Should Sell:", bidPrice, calcPercentageDifference(this.lastPrice, bidPrice)); // Sell
//   if (!this.profit) this.profit = 0;
//   this.profit += bidPrice - this.lastPrice;
//   this.lastPrice = bidPrice;
//   console.log("profit", this.profit);
// }

*/
