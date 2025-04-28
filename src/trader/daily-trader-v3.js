const { calculateFee, calcAveragePrice, isOlderThen } = require("./trend-analysis.js");
const TestExchangeProvider = require("./test-ex-provider.js");
const { calcPercentageDifference } = require("../services.js");

// Smart trader
class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #pricePercentChange;
  constructor(exProvider, pair, info) {
    this.ex = exProvider;
    this.#pair = pair;
    this.interval = +info.interval;
    this.#capital = info.capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    this.#setStrategySettings(info.strategy);
    this.strategyTimestamp = info.strategyTimestamp;

    this.period = +info.interval; // this.period is deleted in only test trading
    this.testMode = info.testMode;
    this.listener = null;

    this.previouslyDropped = false;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.recoveredLoss = 0;
    this.averageAskBidSpread;
    this.analysisPeriod = 4 * 24;
  }

  async start() {
    try {
      const { trades, strategyTimestamp } = await this.ex.state.getBot(this.#pair);
      const totalProfit = (trades.filter((t) => t > 0).reduce((acc, n) => acc + n, 0) / this.#capital) * 100;
      const totalLoss = -((trades.filter((t) => t < 0).reduce((acc, n) => acc + n, 0) / this.#capital) * 100);
      const trade1 = (trades.at(-1) / this.#capital) * 100;
      const period = this.testMode ? 24 : this.analysisPeriod;

      // Get data from Kraken
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const allPrices = await this.ex.prices(this.#pair, period); // For the last xxx days
      const orders = await this.ex.getOrders(this.#pair);
      const prices = allPrices.slice(-((this.#strategyRange * 60) / this.interval));
      const enoughPricesData = allPrices.length >= (period * 60) / this.interval; // 3 days

      this.strategyTimestamp = strategyTimestamp;
      const thereIsStrategy = this.#strategyRange && this.#pricePercentChange;

      if (!this.testMode) {
        // const thereIsLoss = !orders[0] && trade1 < 1 && this.strategyTimestamp / 60 > 6;
        const thereIsLoss =
          this.strategyTimestamp / (60 * 24) > 3 ||
          (!orders[0] && totalLoss > totalProfit / 3 && this.strategyTimestamp / 60 > 1);

        if (!enoughPricesData) {
          this.dispatch("STRATEGY", { strategy: "", strategyTimestamp: 0 });
          //
        } else if (!thereIsStrategy || thereIsLoss) {
          const strategy = await this.#findStrategy(this.#pair, allPrices, this.interval);

          // Todo: Try this if (strategy.profit < 0) strategy.pricePercentChange = 12;
          this.#setStrategySettings(strategy.settings);
          this.previouslyDropped = false;

          this.dispatch("LOG", `Strategy changed: ${strategy.settings}%`);

          this.dispatch("STRATEGY", { strategy: `${strategy.settings}` });
        }
      }

      if (thereIsStrategy) {
        const bidPrices = prices.map((p) => p.bidPrice);
        const highestBidPr = bidPrices.toSorted((a, b) => a - b).at(-1);
        const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);

        if (enoughPricesData && !this.averageAskBidSpread) {
          this.averageAskBidSpread = calcAveragePrice(
            prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
          );
        }

        const shouldTrade = enoughPricesData && askBidSpreadPercentage <= this.averageAskBidSpread * 1.5;
        const dropped = calcPercentageDifference(highestBidPr, askPrice) < -this.#pricePercentChange;
        const priceMovement = this.#findPriceMovement(prices, this.buySellOnPercent, prices.length / 2);
        const increasing = priceMovement == "increasing";
        const orderPriceChange = !orders[0] ? 0 : calcPercentageDifference(orders[0]?.price, bidPrice);
        const loss = this.previousProfit - orderPriceChange;

        if (!this.previouslyDropped && dropped) this.previouslyDropped = true;
        if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;
        else if (loss >= this.previousLoss) this.previousLoss = loss;
        else {
          const recoveredPercent = this.previousLoss - loss;
          if (recoveredPercent > this.recoveredLoss) this.recoveredLoss = recoveredPercent;
        }

        const log = `€${balance.eur.toFixed(2)} - Should trade: ${shouldTrade}`;
        this.dispatch("LOG", `${log} - Prices => Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`);

        if (orders[0]) {
          this.dispatch(
            "log",
            `Gain: ${this.previousProfit}% - Loss: ${this.previousLoss}% - Current: ${orderPriceChange}%`
          );
        }

        // Safety check: Make sure there is no spike higher then 10% and the current price is not lower then -10% then the highest price including "x% increase"
        const sortedPrices = (allPrices.slice(-144).map((p) => p.askPrice) || []).toSorted((a, b) => a - b); //last 12 hrs
        const safeArea =
          calcPercentageDifference(sortedPrices.at(0), bidPrice) <=
          Math.max(8, this.#pricePercentChange * 1.5);
        // Todo: Try trade1 < 0 ? highDrop: this.previouslyDropped && increasing
        // const highDrop =
        //   dropped && this.#findPriceMovement(prices, this.thirdPercent, prices.length / 2) == "increasing";

        const shouldBuy = this.previouslyDropped && increasing;
        this.dispatch("LOG", `shouldBuy: ${safeArea} - ${this.previouslyDropped} - ${increasing}`);

        // Buy
        if (shouldTrade && !orders[0] && safeArea && shouldBuy) {
          if (!orders[0] && this.#capital > 0 && balance.eur >= this.#capital / 2) {
            const capital = balance.eur < this.#capital ? balance.eur : this.#capital;
            const cost = capital - calculateFee(capital, 0.4);
            const investingVolume = +(cost / askPrice).toFixed(8);
            const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
            this.dispatch("BUY", orderId);
            this.dispatch("LOG", `Bought crypto with order ID "${orderId}" at ask Price above 👆`);
          }

          // Sell
        } else if (shouldTrade && balance.crypto > 0 && orders[0]) {
          const recovering = this.recoveredLoss >= Math.max(this.buySellOnPercent, this.previousLoss / 5);
          const droppedAfterLoss = loss - (this.previousLoss - this.recoveredLoss);

          const takeProfit = orderPriceChange > this.halfPercent && loss >= this.buySellOnPercent;
          const stopLoss = this.previousLoss >= Math.max(10, this.#pricePercentChange);
          const recoverLoss =
            this.previousLoss >= Math.max(3, this.thirdPercent) &&
            recovering &&
            droppedAfterLoss >= Math.min(1, this.buySellOnPercent);

          if (takeProfit || stopLoss || recoverLoss) {
            const orderType = stopLoss ? "stopLoss" : recoverLoss ? "recoverLoss" : "profitable";
            this.dispatch("LOG", `${orderType} order will be executed`);

            if (orders[0]) {
              await this.#sell(orders[0], balance.crypto, bidPrice);
              this.previousProfit = 0;
              this.previousLoss = 0;
              this.recoveredLoss = 0;
              if (orderPriceChange >= this.halfPercent) this.previouslyDropped = false;
            }
          }
        }
      }

      if (enoughPricesData) this.dispatch("LOG", "");
    } catch (error) {
      this.dispatch("LOG", `Error running bot: ${error}`);
    }

    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
  }

  async #sell({ id, volume, cost, price, createdAt }, cryptoBalance, bidPrice) {
    const amount = bidPrice * (cryptoBalance - volume) < 5 ? cryptoBalance : volume;
    const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
    const c = bidPrice * amount - calculateFee(bidPrice * amount, 0.4);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    const orderAge = ((Date.now() - createdAt) / 60000 / 60).toFixed(1);
    this.dispatch("SELL", { id, profit });
    this.dispatch("LOG", `Sold crypto with profit: ${profit} - Age: ${orderAge}hrs - ID: "${id}"`);
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
    this.dispatch("SELL", { profit });
    this.dispatch("LOG", `Sold all crypto asset with profit: ${profit}`);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }

  #setStrategySettings(strategy) {
    const [range, pricePercent] = (strategy || "").split(":");
    this.#strategyRange = +range; // Range in hours "0.5 = have an hour"
    this.#pricePercentChange = +pricePercent; // Percentage Change is the price Percentage Threshold
    this.halfPercent = this.#pricePercentChange / 2;
    this.thirdPercent = this.#pricePercentChange / 3;
    this.buySellOnPercent = this.#pricePercentChange / 5;
  }
  #findPriceMovement(prices, minPercent, offset = 1) {
    const length = prices.length - 1;
    const price = prices.at(-1);

    for (let i = length; i > offset; i--) {
      const current = prices[i];
      if (calcPercentageDifference(current.askPrice, price.askPrice) >= minPercent) return "increasing";
      else if (calcPercentageDifference(current.askPrice, price.askPrice) <= -minPercent) return "dropping";
    }
  }

  async #findStrategy(pair, prices, interval) {
    let workers = [];
    for (let range = 0.5; range <= 12; range += range >= 1 ? 1 : 0.5) {
      for (let pricePercent = 2; pricePercent <= 10; pricePercent += 0.5) {
        workers.push(testStrategy(pair, prices, interval, range, pricePercent));
      }
    }

    return (await Promise.all(workers)).sort((a, b) => b.profit - a.profit)[0];
  }
}

async function testStrategy(pair, prices, interval, strategyRange, pricePercentChange) {
  let transactions = 0;
  const strategy = `${strategyRange}:${pricePercentChange}`;
  const ex = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, interval);
  const trader = new DailyTrader(ex, pair, {
    interval: interval,
    capital: 100,
    strategy,
    testMode: true,
  });

  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "SELL") transactions++;
  };

  for (const i in prices) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const profit = +(await ex.balance()).eur.toFixed(2) - 100;

  return { profit, crypto, transactions, settings: strategy };
}

module.exports = DailyTrader;
