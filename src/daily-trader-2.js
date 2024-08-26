/*
> BTCEUR 0.1 100 9 3 9 
Strategy: 9, 9, 3 - Balance:  116.75 - 0 =>  8.38
*/

const analyzer = require("./trend-analysis.js");

// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #investingCapital;
  #pricePercentageThreshold;
  #tradingAmount;
  constructor(exProvider, pair, { capital, investment, priceChange, strategyRange }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital;
    this.#investingCapital = investment; // investing Amount in ERU that will be used every time to by crypto
    this.#pricePercentageThreshold = priceChange; // Percentage Change
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.strategyRange = Math.max(+strategyRange || 0, 0.25); // Range in days "0.25 = 6 hours"
    this.listener = null;
  }

  async start(period) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / bidPrice).toFixed(8);

      const askPrices = prices.map((p) => p.askPrice);
      const bidPrices = prices.map((p) => p.bidPrice);
      const orders = await this.ex.getOrders(this.#pair);
      const askPriceRsi = analyzer.calculateRSI(askPrices);
      const bidPriceRsi = analyzer.calculateRSI(bidPrices);
      const avgAskPrice = analyzer.calculateAveragePrice(askPrices);
      const avgBidPrice = analyzer.calculateAveragePrice(bidPrices);
      const askPercentageChange = analyzer.calculatePercentageChange(askPrice, avgAskPrice);
      const bidPercentageChange = analyzer.calculatePercentageChange(bidPrice, avgBidPrice);
      const name = this.#pair.replace("EUR", "");

      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `💰 EUR: ${balance.eur} <|> ${name}: ${balance.crypto} - Price: ${tradePrice}`);
      this.dispatch(
        "log",
        `Ask Price: => RSI: ${askPriceRsi} - Cur: ${askPrice} Avg: ${avgAskPrice}% Chg: ${askPercentageChange}%`
      );
      this.dispatch(
        "log",
        `Bid Price: => RSI: ${bidPriceRsi} - Cur: ${bidPrice} Avg: ${avgBidPrice}% Chg: ${bidPercentageChange}%`
      );
      // 💰 📊

      const lastOrder = orders[orders.length - 1];
      const sortedPries = bidPrices.toSorted();
      const highestBidPr = sortedPries[sortedPries.length - 1];

      const shouldBuy =
        !((this.strategyRange * 24 * 60) / 5 > prices.length) &&
        -(this.#pricePercentageThreshold * 1.2) > analyzer.calculatePercentageChange(askPrice, highestBidPr);
      // &&(!lastOrder ||-this.#pricePercentageThreshold > analyzer.calculatePercentageChange(askPrice, lastOrder.price));

      // const shouldBuy =
      //   !((this.strategyRange * 24 * 60) / 5 > prices.length) &&
      //   -this.#pricePercentageThreshold > analyzer.calculatePercentageChange(askPrice, highestBidPr) &&
      //   (!lastOrder ||
      //     -this.#pricePercentageThreshold > analyzer.calculatePercentageChange(askPrice, lastOrder.price));

      // || (analyzer.isOlderThen(lastOrder.createdAt, this.strategyRange / 2) &&  -(this.#pricePercentageThreshold / 2) > analyzer.calculatePercentageChange(askPrice, lastOrder.price)));

      // console.log("shouldBuy: ", shouldBuy);
      // if (lastOrder) {
      //   console.log(
      //     "Order: ",
      //     new Date(lastOrder.createdAt),
      //     -this.#pricePercentageThreshold,
      //     analyzer.calculatePercentageChange(askPrice, lastOrder.price)
      //   );
      // }
      // && -(this.#pricePercentageThreshold / 2) > askPercentageChange ;
      // && avgAskPrice - (avgAskPrice - lowestAskPr) / 1.5; >= askPrice; // 1.5 for more restriction
      // && orders.length < 3

      if (bidPriceRsi < 30 && shouldBuy) {
        this.dispatch("log", `Suggest buying: Lowest Ask Price is ${askPrices.toSorted()[0]}`);

        const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;
        const remaining = +(Math.min(this.#investingCapital, balance.eur) / askPrice).toFixed(8);

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
      } else if (70 <= bidPriceRsi && balance.crypto > 0 && orders[0]) {
        for (const { id, price, volume, cost, createdAt } of orders) {
          // Backlog: Sell accumulated orders that has been more than 5 days if the current price is higher then highest price in the lest 4 hours.
          const sell = this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(bidPrice, price);
          // Todo: add the this for live || analyzer.isOlderThen(createdAt, 20)
          if (sell) {
            // console.log(bidPrice, price);
            console.log(+(+bidPrice - +price).toFixed(2));
            const amount = Math.min(+volume, balance.crypto);
            const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
            const c = bidPrice * amount + analyzer.calculateFee(bidPrice * amount, 0.4);
            const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
            this.dispatch("sell", id);
            this.dispatch("earnings", profit);
            this.dispatch("log", `Sold crypto with profit: ${profit} - ID: "${id}"`);
          }
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      // console.log(`Error running bot: ${error}`);
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (period) {
      this.timeoutID = setTimeout(() => this.start(period), Math.round(60000 * (Math.random() * 3 + period)));
    }
  }

  stop() {
    clearTimeout(this.timeoutID);
  }
  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};
