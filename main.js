import DailyTrader from "./bots/daily-trader.js";

const trader = new DailyTrader("ETH/EUR", 1.4, 0.0028 || 0.003);
trader.start();
