# K Trader

K Trader is a Cryptocurrency Trading Bots and Bots Manager

## Trading fees calculation

Kraken says the fees is up to `0.25%` but they are charging around `0.40%`. this happens on every transaction E.g. buy, sell or convert. To avoid loss we need to consider `0.40%` fee on guy pluse `0.40%` on sell which is in total `0.80%` fee on two ways transactions, meaning the trading threshold of the price percentage change has to be height then `0.80%`. Here is how it works, assuming the the unite of crypto worth 3500 when buying and 3530 when selling which is `0.85%` price change:

**Buying:** `3500 * 0.40 / 100 = (fee 14) + 3500 = (To pay 3514)`

**Selling:** `3530 * 0.40 / 100 = (fee 14.12) - 3530 = (To get 3515.88)`

**Earnings:** `(Revenue 3515.88) - (Cost 3514) = (Profit 1.88)`

## Strategies

### Description

1. _NOT VALID_ (current) Buy when the average price drops 1.5% and sell the bought order only when the current price is 1.5% higher then the order price
1. Buy ETH/USDT using 10% of starting capital. Add an additional 10% of available cash to the position at every 1% drop in price. Sell at 1.5% profit or 10% loss.

### Strategy Test Settings

#### - BTCEUR

1. `€100 - €9 | >3< | 9% => €8.26`
1. `€100 - €9 | >5< | 11% => €10.2`
1. `€100 - €9 | >7< | 12% => €11.36`
1. `€500 - €49 | >7< | 12% => €56.15`

#### - ETHEUR

1. `€100 - €9 | >1< | 3% => €9.62`
1. `€100 - €9 | >2< | 4% => €9.8`
1. `€100 - €4.9 | >2< | 4% => €10.19`
1. `€100 - €9 | >2< | 5% => €10.12`
1. `€100 - €9 | >3< | 6% => €10.15`
1. `€100 - €49 | >3< | 6% => €10.83`
1. `€100 - €49 | >3< | 5% => €11.52`
1. `€500 - €99 | >3< | 5% => €57.94`

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
