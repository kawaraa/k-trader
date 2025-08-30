# K Trader

K Trader is a Cryptocurrency Trading Bots Manager that manage hundreds of bots.

## Trading fees calculation

Kraken says the fees is up to `0.25%` but they are charging around `0.40%`. this happens on every transaction E.g. buy, sell or convert. To avoid loss we need to consider `0.40%` fee on guy pluse `0.40%` on sell which is in total `0.80%` fee on two ways transactions, meaning the trading threshold of the price percentage change has to be height then `0.80%`. Here is how it works, assuming the the unite of crypto worth 3500 when buying and 3530 when selling which is `0.85%` price change:

**Buying:** `3500 * 0.40 / 100 = (fee 14) + 3500 = (To pay 3514)`

**Selling:** `3530 * 0.40 / 100 = (fee 14.12) - 3530 = (To get 3515.88)`

**Earnings:** `(Revenue 3515.88) - (Cost 3514) = (Profit 1.88)`

## Strategies

1. **xxx:**
1. **xxx:**

## RSI Description

- **RSI: 22 > 48** When the price goes Up fast or the currency is over bought, the RSI may go from **22** to **48**
- **RSI: 80 > 53** When the price goes Down fast or the currency is over sold, the RSI may go from **80** to **53**

### Testing cryptocurrency steps

These steps help finding the right Strategy Settings for a specific currency.

### Analyzing & Running analysis Commands

1. Get the prices: `node src/prices-data-script.js XXX`
1. Run test trading of specific currency: `node src/test-trading-script.js BTCEUR 100 0.25 1.5 all 5`
1. Run test trading for all currencies: `node src/test-currencies-script.js BTCEUR 100 0.25 1.5 all 5`
1. Test trading strategies: `node src/test-trading-script.js BTCEUR 100 0.25 1.5 all 5`

#### Parameters description:

- _BTCEUR_ is the pair of the currency
- _100_ is the investment capital or investing amount that will be used to buy cryptocurrency
- _0.25_ is the strategy range, min _0.25_ and max _1_
- _1.5_ is the the price percentage change which will be used to decide whether to buy if the price drops _X%_ and sell if the price increase _X%_, min 1.5 and max 10
- _all_ is the [strategy](#strategies),

## Getting Started / Running the App

First, run the development server:

```bash
npm run dev
# or
bun dev
# or
pm2 start npm --name "nextjs-app" -- start
```

#### Styles

##### Colors

- #5b5b6d
- #aea1ea
- cornflowerblue
- #9bface Or #7dffe6

# The following is no updated:

1. _NOT VALID_ (current) Buy when the average price drops 1.5% and sell the bought order only when the current price is 1.5% higher then the order price
1. Buy ETH/USDT using 10% of starting capital. Add an additional 10% of available cash to the position at every 1% drop in price. Sell at 1.5% profit or 10% loss.

===> How DailyTrader works <===

- DailyTrader performs trading based on the provided strategy and settings. It analyzes the prices of the last xxx days on every xxx mins interval. every strategy has its settings.
- There are a currently 5 strategies:

1. high-drop-partly-trade: It buys if the current price drops -xxx% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
2. high-drop-slowly-trade: the same except it does not use all the capital to buy, it buys on specific amount provide in the settings called "investment" and when the prices drops again, it buys again til it spend the whole amount of "capital"
3. near-low-partly-trade: It buys if the current price drops -xxx% and near the lowest price in the last xxx days and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
4. near-low-slowly-trade:
5. on-increase: It buys if the RSI is less than 30 and increasing, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.

- Settings: are used to control whether it's a long term strategy or short term trading / daily trading strategy, you can set it up using the "strategy range" field. if it's a day or less then obviously it's a short term trading strategy.

- Note: this is how limit orders are managed:

1. Check if there are buy order ID in state that has not been fulfilled, remove it from the state,
2. If fulfilled buy orders have fulfilled sell order, calculate the profits and remove these orders from the state
3. If it's good time to buy, place buy orders with 2 mins expire and store their IDs in the state.
4. If it's a good time to sell, place sell order with 2 mins expire and store it's ID in state with its buy order ID,

### Eth followers

-

### Opposite Eth followers

- MEUR

### Disabled but but can not be automated

- PERP
- DENT
- ZK
- JITOSOL
- JTO
- POWR
- BIGTIME
- PHA

### To look into

it's removed but still available on Kraken:
https://crypto.kawaraa.com/trader/?pair=PERPEUR&since=3
