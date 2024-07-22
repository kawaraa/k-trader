# Cryptocurrency

## Trading fees calculation

Kraken says the fees is up to `0.25%` but they are charging around `0.40%`. this happens on every transaction E.g. buy, sell or convert. To avoid loss we need to consider `0.40%` fee on guy pluse `0.40%` on sell which is in total `0.80%` fee on two ways transactions, meaning the trading threshold of the price percentage change has to be height then `0.80%`. Here is how it works, assuming the the unite of crypto worth 3500 when buying and 3530 when selling which is `0.85%` price change:

**Buying:** `3500 / 100 * 0.40 = (fee 14) + 3500 = (To pay 3514)`

**Selling:** `3530 / 100 * 0.40 = (fee 14.12) - 3530 = (To get 3515.88)`

**Earnings:** `(Got 3515.88) - (Paid 3514) = (1.88)`
