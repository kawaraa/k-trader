import Trader from "./trader.js";

import {
  calcPercentageDifference,
  calculateFee,
  calcAveragePrice,
  normalizePrices,
  removeLowsOrHighs,
} from "../services.js";
import { findPriceMovement, linearRegression, analyzeTrend } from "../indicators.js";
const calcPercentage = calcPercentageDifference;

// Smart trader
export default class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.range = (6 * 60) / this.interval;
    this.percentThreshold = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = "0-x-x-x-x";
    this.trends = [];
    this.highestPrice = null;
    this.lowestPrice = null;
    this.lastTradeTimer = 0;
    this.lastTradePrice = 0;
    this.breakdown = false;
    this.shouldSell = false;
    this.profitTarget = null;
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range); // Change this to 12 hrs if 24 is not used
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    // const { trades } = await this.ex.state.getBot(this.pair);
    const currentPrice = prices.at(-1);

    if (prices.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const askBidPrices = normalizePrices(prices, averageAskBidSpread);

    const sortedBidPrices = askBidPrices.toSorted((a, b) => a - b);
    const priceChangePercent = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    this.percentThreshold = priceChangePercent;

    let result = removeLowsOrHighs(normalizePrices(prices), 18, -1.5, 3);
    result = removeLowsOrHighs(removeLowsOrHighs(result, 18, 1.5, 3), 18, -1.5, 3);
    this.updateTrends(linearRegression(result, true, 0.0001));

    const trendsFlow = this.trends.slice(1).join("-") || "";
    // if (this.trendsFlow != trendsFlow) {
    //   console.log(trendsFlow, this.percentThreshold);
    //   console.log(prc);
    //   this.trendsFlow = trendsFlow;
    // }

    if (trendsFlow.includes("DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND")) {
      this.breakdown = true;
    }
    if (trendsFlow.includes("UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-UPTREND")) {
      this.breakdown = false;
    }
    if (trendsFlow.includes("UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND")) {
      this.highestPrice = sortedBidPrices.at(-1);
    }
    if (trendsFlow.includes("DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND")) {
      this.lowestPrice = sortedBidPrices[0];
    }
    if (!this.highestPrice) this.highestPrice = sortedBidPrices.at(-1);
    if (!this.lowestPrice) this.lowestPrice = sortedBidPrices[0];

    if (this.lowestPrice && this.highestPrice) {
      this.profitTarget = Math.min(calcPercentage(this.lowestPrice, this.highestPrice) / 2, 10);
    }
    let [_, signal] = conditions.find((c) => trendsFlow.includes(c[0])) || ["", "NO-SIGNAL"];
    let shouldBuy = signal == "BUY";

    const priceMovement = findPriceMovement(askBidPrices, this.percentThreshold / 2);
    const trend = analyzeTrend(askBidPrices).trend;
    console.log(signal, trendsFlow, trend, priceMovement);
    console.log(this.lastTradeTimer, this.percentThreshold, this.profitTarget);

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy

      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer <= 0) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.lastTradePrice = currentPrice.askPrice;
        this.shouldSell = false;
        // this.profitTarget = Math.min(calcPercentage(currentPrice.bidPrice, this.highestPrice) / 2, 10);
        //
      }
    } else if (positions[0] && balance.crypto > 0) {
      // Sell

      const gainLossPercent = calcPercentage(positions[0].price, askBidPrices.at(-1));
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);
      // const prevDropAgain = this.losses[2];

      if (loss >= this.losses[0]) this.losses[0] = loss;
      else if (this.losses[0]) {
        const recoveredPercent = +(this.losses[0] - loss).toFixed(2);
        if (recoveredPercent > 3 && recoveredPercent > this.losses[1]) this.losses[1] = recoveredPercent;
      }

      if (this.losses[1]) {
        this.losses[2] = +(loss - (this.losses[0] - this.losses[1])).toFixed(2); // drops after it's recovered
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      if (signal == "SELL") this.shouldSell = true;
      const case1 = this.shouldSell && loss > Math.max(gainLossPercent / 5, 1);
      const case2 =
        gainLossPercent < -Math.max(this.percentThreshold, 5) || (this.prevGainPercent < 4 && loss > 4);
      // || this.prevGainPercent < this.profitTarget && loss > Math.max(this.prevGainPercent / 2, 4);
      const case3 =
        this.prevGainPercent >= Math.max(this.profitTarget, 4) && loss > Math.max(gainLossPercent / 4, 1.5);
      const case4 = signal == "DROP-SELL" && (priceMovement.includes("DROPPING") || trend == "DOWNTREND");

      console.log(case1, case2, case3, case4);
      if ((case1 || case2 || case3 || case4) && safeAskBidSpread) {
        // console.log(
        //   this.losses[2] > 1 && this.losses[2] > prevDropAgain + 0.1,
        //   gainLossPercent < -Math.max(gainLossPercent / 5, 5),
        //   gainLossPercent > 15 && loss > Math.max(gainLossPercent / 4, 2)
        // );
        this.dispatch("LOG", `Placing SELL order ${currentPrice.bidPrice}`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeTimer = (Date.now() - positions[0].createdAt) / 60000 / this.interval;
        this.lastTradePrice = currentPrice.askPrice;
        // if (gainLossPercent > Math.max(this.percentThreshold, 5)) this.highestPrice = null;
        this.profitTarget = null;
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    if (this.lastTradeTimer > 0) this.lastTradeTimer--;
    else this.lastTradeTimer = 0;
    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    // if (this.trends.at(-1) != trend) this.trends.push(trend);
    // if (this.trends.length > 4) this.trends.shift();

    if (!this.trends[0] || this.trends[0] > 60 / this.interval) {
      this.trends[0] = 0;
      this.trends.push(trend);
      if (this.trends.length > 7) {
        this.trends.shift();
        this.trends[0] = 0;
      }
    }
    this.trends[0]++;

    // let arr = this.trends.split("-");
    // let timer = +arr.at(0);
    // if (timer > this.range || this.trends == "0-x-x-x-x") {
    //   arr.push(trend);
    //   timer = 0;
    // }
    // if (arr.length > 7) arr = arr.slice(2);
    // else arr.shift();
    // this.trends = timer + 1 + ("-" + arr.join("-"));
  }
}

const conditions = [
  // ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND", "BREAKDOWN-BUY"],
  // ["DOWNTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND", "SELL"],

  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],

  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS-DOWNTREND", "SELL"],

  ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS-DOWNTREND-UPTREND", "BUY"],
  ["SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS-SIDEWAYS-UPTREND", "BUY"],

  ["SIDEWAYS-SIDEWAYS-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],

  // ["UPTREND-UPTREND-UPTREND-UPTREND-SIDEWAYS-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-UPTREND-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["UPTREND-UPTREND-SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-SIDEWAYS", "SELL"],

  // ["UPTREND-SIDEWAYS-SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["SIDEWAYS-SIDEWAYS-SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["SIDEWAYS-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],

  // ["DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS-SIDEWAYS-SIDEWAYS", "DROP-SELL"],
];

/**
+: 
-: 
+: DOWNTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: DOWNTREND-UPTREND-DOWNTREND-UPTREND-UPTREND-UPTREND
+: SIDEWAYS-UPTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND
-: UPTREND-DOWNTREND-UPTREND-UPTREND-SIDEWAYS-UPTREND || UPTREND-DOWNTREND-UPTREND-UPTREND-UPTREND-UPTREND
+: UPTREND-UPTREND-SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND
-: UPTREND-SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND-UPTREND
+: SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND
-: UPTREND-UPTREND-UPTREND-DOWNTREND-UPTREND-UPTREND
+: DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND


 */
