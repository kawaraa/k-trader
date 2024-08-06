# K Trader

K Trader is a Cryptocurrency Trading Bots and Bots Manager

## Trading fees calculation

Kraken says the fees is up to `0.25%` but they are charging around `0.40%`. this happens on every transaction E.g. buy, sell or convert. To avoid loss we need to consider `0.40%` fee on guy pluse `0.40%` on sell which is in total `0.80%` fee on two ways transactions, meaning the trading threshold of the price percentage change has to be height then `0.80%`. Here is how it works, assuming the the unite of crypto worth 3500 when buying and 3530 when selling which is `0.85%` price change:

**Buying:** `3500 * 0.40 / 100 = (fee 14) + 3500 = (To pay 3514)`

**Selling:** `3530 * 0.40 / 100 = (fee 14.12) - 3530 = (To get 3515.88)`

**Earnings:** `(Revenue 3515.88) - (Cost 3514) = (Profit 1.88)`

## Strategies

### Description

1. (current) Buy when the average price drops 1.5% and sell the bought order only when the current price is 1.5% higher then the order price
1. Buy ETH/USDT using 10% of starting capital. Add an additional 10% of available cash to the position at every 1% drop in price. Sell at 1.5% profit or 10% loss.

### Strategy Test Settings

1. `BTCEUR €100 10 7% 2 24 30` => €133
1. `ETHEUR €100 10 15% 2 24 30` => €250
1. `ETHEUR €2500 490 15% 2 24 30` => €7113 / 25
1. `ALPHAEUR €100 10 10% 2 24 30` => €210
1. `BRICKEUR €100 10 10% 2 24 30` => €157
1. `SOLEUR €100 10 1.3% 0.5 8 30` => €108
1. `BTTEUR €100 10 5% 2 24 30` => €105
1. `QNTEUR €100 10 10% 2 24 30` => €88
1. `ADXEUR €100 10 10% 2 24 30` => €87
1. `` => €
1. `` => €

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
