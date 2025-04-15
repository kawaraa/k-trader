const Trader = require("./trader.js");
const { getMaxMin, isNumberInRangeOf, isOlderThan } = require("../utilities.js");
const { calcPercentageDifference, calculateFee, calcAveragePrice, smoothPrices } = require("../services.js");
const { findPriceMovement, linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;
const maxPercentThreshold = 25;

function detectTrendBasedCloses(prices) {
  const slope = linearRegression(prices);
  if (slope > 0) return "uptrend";
  if (slope < 0) return "downtrend";
  return "sideways";
}

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.longRange = (24 * 60) / this.interval;
    // this.shortRange = (6 * 60) / this.interval;
    this.analysisPeriod = 1 * 24 * 60 + this.longRange * 5;
    this.lossLimit = 8;
    // this.minPeriodBetweenOrders = this.shortRange; // Or (12 * 60) / 5;
    this.priceChangePercent = 3;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.prevShortTrend = null;
    this.prevLongTrend = null;
    this.lastTradeAge = 0;
  }

  async run() {
    // const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, this.longRange);
    const last12HrsPrices = allPrices.slice(-parseInt(this.longRange / 2));
    const last6HrsPrices = allPrices.slice(-parseInt(this.longRange / 4));
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = allPrices.at(-1);

    if (allPrices.length < this.longRange) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    // const strategyExpired =
    //   !this.strategyTest.timestamp ||
    //   this.strategyTest.timestamp / 60 > 12 ||
    //   (trades.at(-1) < 0 && this.strategyTest.timestamp / 60 > 3);
    // if (!(trades.at(-1) > 0)) test.percentThreshold = test.percentThreshold * 1.2;
    // test.loss == 0 &&

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(
      last6HrsPrices.map((p) => calcPercentage(p.bidPrice, p.askPrice))
    );

    const last6HrsPricesBidPrices = last6HrsPrices.map((p) => p.bidPrice);
    const sortedBidPrices = last6HrsPricesBidPrices.toSorted((a, b) => a - b);
    const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    if (!positions[0] && pricePercentThreshold > 3) this.priceChangePercent = pricePercentThreshold;

    // const thereAreLosses = (trades.at(-1) < 0 && trades.at(-2) < 0) || trades.at(-1) > 3;
    // const pause = thereAreLosses && this.lastTradeAge < this.longRange / 2;

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy
      let shouldBuy = false;
      // if (askBidSpreadPercentage >= averageAskBidSpread) return result; // safeAskBidSpread
      const longPeriodTrend = detectTrendBasedCloses(allPrices.map((p) => p.bidPrice));
      const shortPeriodTrend = detectTrendBasedCloses(last12HrsPrices.map((p) => p.bidPrice));
      if (!this.prevShortTrend && shortPeriodTrend != "downtrend") this.prevShortTrend = shortPeriodTrend;
      if (!this.prevLongTrend && longPeriodTrend != "downtrend") this.prevLongTrend = longPeriodTrend;

      if (this.prevShortTrend == "uptrend" && shortPeriodTrend == "downtrend") {
        const movement = findPriceMovement(last6HrsPricesBidPrices, 0.5, 1);
        // console.log("BUY - shortPeriodTrend", movement);
        shouldBuy = true;
        this.prevShortTrend = null;

        if (movement.includes("INCREASING")) {
          // console.log("BUY - shortPeriodTrend", currentPrice, "\n");
          // shouldBuy = true;
          // this.prevShortTrend = null;
        }
      } else if (this.prevLongTrend == "uptrend" && longPeriodTrend == "downtrend") {
        const movement = findPriceMovement(last6HrsPricesBidPrices, 0.5, 2);
        // shouldBuy = true;
        // this.prevShortTrend = null;

        if (movement.includes("INCREASING")) {
          // console.log("BUY - longPeriodTrend", currentPrice, "\n");
          // shouldBuy = true;
          // this.prevLongTrend = null;
        }
      }

      // const buyOnPercent = getMaxMin(priceChangePercent / 5, 0.5, 2);
      // const movement = findPriceMovement(last6HrsPricesBidPrices, buyOnPercent, priceChangePercent / 1.2);
      // shouldBuy = movement.includes("INCREASING");

      if (shouldBuy) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        //
      }
    } else if (positions[0] && balance.crypto > 0) {
      // Sell

      // const stopLossLimit = Math.max(this.priceChangePercent / 2, 3);
      const gainLossPercent = calcPercentage(positions[0].price, currentPrice.bidPrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = this.prevGainPercent - gainLossPercent;

      if (this.prevGainPercent < 3) {
        if (loss >= this.losses[0] && !this.losses[1]) this.losses[0] = loss;
        else if (this.losses[0]) {
          const recoveredPercent = this.losses[0] - loss;
          if (recoveredPercent > 0.5 && recoveredPercent > this.losses[1]) this.losses[1] = recoveredPercent;
        }
      }

      if (this.losses[1]) {
        this.losses[2] = loss - (this.losses[0] - this.losses[1]); // drops after it's recovered
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      if (askBidSpreadPercentage >= averageAskBidSpread * 2.5) return; // safeAskBidSpread

      const olderThan3Hrs = isOlderThan(positions[0].createdAt, ((this.longRange / 8) * 5) / 60);
      const profitable = gainLossPercent >= 3 && loss >= this.prevGainPercent / 4;
      const stopLoss = loss > 1 && this.losses[1] > 1 && this.losses[2] > 0.5;

      if (profitable || stopLoss) {
        this.dispatch("LOG", `Placing ${profitable ? "PROFITABLE" : "STOPLOSS"} order`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeAge = 0;
        //
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    this.lastTradeAge++;
    this.dispatch("LOG", "");
  }

  decide(position, prices, priceChangePercent, profitPercent = 0, lossPercent = 0, l) {
    const { askPrice, bidPrice } = prices.at(-1);

    const result = { signal: "HOLD", gainLossPercent: 0, profitPercent, lossPercent };

    const askBidSpreadPercentage = calcPercentage(bidPrice, askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));

    prices = smoothPrices(prices, 5);
    const bidPrices = prices.map((p) => p.bidPrice);

    const buyOnPercent = getMaxMin(priceChangePercent / 5, 0.5, 4);
    if (l) {
      console.log(findPriceMovement(bidPrices, buyOnPercent, priceChangePercent / 1.1), priceChangePercent);
    }

    if (position) {
      // Sell
      if (askBidSpreadPercentage >= averageAskBidSpread * 2.5) return result; // safeAskBidSpread
      result.gainLossPercent = calcPercentage(position.price, bidPrice);
      // if (l) console.log("gainLossPercent", result.gainLossPercent, position.price, bidPrice);
      const loss = result.profitPercent - result.gainLossPercent;

      const case1 =
        isNumberInRangeOf(result.gainLossPercent, 2, Math.max(priceChangePercent / 2, 4)) && loss > 0.5;
      const case2 = result.gainLossPercent > priceChangePercent && loss >= result.profitPercent / 4;

      if (case1 || case2) result.signal = "SELL-PROFITABLE";
      else {
        const stopLossLimit = Math.max(buyOnPercent + averageAskBidSpread, 2);
        // const stopLossLimit = Math.max(priceChangePercent / 2, 2);
        const case1 = loss > stopLossLimit;
        const case2 =
          result.lossPercent <= -(stopLossLimit / 1.2) &&
          result.gainLossPercent > result.lossPercent / 2 &&
          findPriceMovement(bidPrices.slice(-18), Math.abs(result.lossPercent / 4)).includes("DROPPING");
        const case3 = result.gainLossPercent < -stopLossLimit;

        if (case1 || case2 || case3) result.signal = "SELL-STOP-LOSS";
      }

      //
    } else {
      // Buy
      // if (askBidSpreadPercentage >= averageAskBidSpread) return result; // safeAskBidSpread

      // const buyOnPercent = getMaxMin(priceChangePercent / 5, 0.5, 2);
      // const shouldBuy = linearRegression(bidPrices) < 0;
      const movement = findPriceMovement(bidPrices, buyOnPercent, priceChangePercent / 1.2);

      // console.log(linearRegression(shortRangePrices) < 0); // means it's dropping

      // console.log(JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", "));

      // const averagePrice = calcAveragePrice(bidPrices);
      // const tooHigh = calcPercentage(averagePrice, currentPrice.bidPrice) > 0;
      // const percentFroLowest = calcPercentageDifference(sortedBidPrices[0], currentPrice.bidPrice);
      // const tooLow = percentFroLowest < -buyOnPercent;
      if (movement.includes("INCREASING")) {
        result.signal = "BUY";
      }
    }

    return result;
  }

  runeTradingTest(prices) {
    let percentage = 3;
    const result = { percentThreshold: maxPercentThreshold, netProfit: 0, trades: [] };

    while (percentage <= maxPercentThreshold) {
      const trades = [];
      let price = null; // pricePointer
      let profitPercent = 0;
      let lossPercent = 0;
      let lastTradeAge = 0;

      for (let i = this.shortRange; i < prices.length; i++) {
        const newPrices = prices.slice(i - this.shortRange, i);
        const currentPrice = prices[i];
        const position = !price ? null : { price };
        // const lastTowTradesAreLoss = trades.at(-1) < 0 && trades.at(-2) < 0;
        // const tooMuchLosses =
        //   -trades.reduce((t, it) => t + it + (it < 0 ? it : 0), 0) >
        //   trades.reduce((t, it) => t + it + (it > 0 ? it : 0), 0) / 3;
        // const lastTowTradesAreLoss = lastTradeIsLoss && trades.at(-2) < 0;
        // const lastTowTradesAreGain = lastTradeIsLoss && trades.at(-1) > 0 && trades.at(-2) > 0;

        const decision = this.decide(position, newPrices, percentage, profitPercent, lossPercent);
        profitPercent = decision.profitPercent;
        lossPercent = decision.lossPercent;
        lastTradeAge++;

        // const pause = trades.at(-1) < 0 && lastTradeAge <= this.minPeriodBetweenOrders;
        // const pause = (lastTowTradesAreLoss || tooMuchLosses) && lastTradeAge < this.minPeriodBetweenOrders;
        // const pause = trades.at(-1) >= percentage && lastTradeAge <= this.minPeriodBetweenOrders;

        if (decision.signal.includes("BUY")) {
          price = currentPrice.askPrice;
        } else if (decision.signal.includes("SELL-PROFITABLE")) {
          trades.push(decision.gainLossPercent - 0.06);
          price = null;
          lastTradeAge = 0;
        } else if (decision.signal.includes("SELL")) {
          trades.push(decision.gainLossPercent - 0.06);
          price = null;
          lastTradeAge = 0;
        }
      }

      const netProfit = trades.reduce((t, it) => t + it, 0);
      const gain = trades.reduce((t, it) => t + (it > 0 ? it : 0), 0);
      const loss = trades.reduce((t, it) => t + (it < 0 ? it : 0), 0);
      // (loss == 0 && gain > 0) ||
      // console.log("NetProfit:", netProfit, "Trades:", trades.length);
      if (netProfit > result.trades.reduce((t, it) => t + it, 0)) {
        result.percentThreshold = percentage;
        result.netProfit = netProfit;
        result.gain = gain;
        result.loss = loss;
        result.transitions = trades.length;
        result.trades = trades;
      }

      percentage++;
    }
    return result;
  }
}

module.exports = MyTrader;
