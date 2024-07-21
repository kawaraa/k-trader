
# Buy ETH/USDT using 10% of starting capital. Add an additional 10% of available cash to the position at every 1% drop in price. Sell at 2% profit.

def initialize(self, state, context, args):
  state['initial_capital'] = float(args.params['capitalBase'])
  state['total_spent'] = 0
  state['total_bought'] = 0
  state['initial_price'] = None
  state['last_buy_price'] = None
  state['target_price'] = None

def run_iteration(self, state, context, args):
  try:
    symbol = args.params['pair']
    initial_capital = state['initial_capital']
    balances = self.exchange.fetch_balance()
    usdt_balance = balances['USDT']['free']
    ticker = self.exchange.fetch_ticker(symbol)
    current_price = ticker['last']

    # Initialize initial price and target price
    if state['initial_price'] is None:
      state['initial_price'] = current_price
      state['target_price'] = current_price * 1.02

    # Calculate the amount to spend
    if state['total_spent'] == 0:
      amount_to_spend = initial_capital * 0.1
    else:
      amount_to_spend = usdt_balance * 0.1

    # Buy condition: Initial buy or price drop by 1% from last buy price
    if state['total_spent'] == 0 or current_price <= state['last_buy_price'] * 0.99:
      if amount_to_spend <= usdt_balance:
        time.sleep(0.33)
        eth_amount = amount_to_spend / current_price
        order = self.exchange.create_order(type='market', side='buy', symbol=symbol, amount=eth_amount)
        state['total_spent'] += amount_to_spend
        state['total_bought'] += eth_amount
        state['last_buy_price'] = current_price
        log.info(f"Bought {eth_amount} ETH at {current_price} USDT")

    # Sell condition: Current price reaches target price
    if current_price >= state['target_price'] and state['total_bought'] > 0:
      time.sleep(0.33)
      order = self.exchange.create_order(type='market', side='sell', symbol=symbol, amount=state['total_bought'])
      state['total_spent'] = 0
      state['total_bought'] = 0
      state['initial_price'] = None
      state['last_buy_price'] = None
      state['target_price'] = None
      log.info(f"Sold all ETH at {current_price} USDT")

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")