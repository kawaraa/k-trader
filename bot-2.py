# Buy ETH/USDT using 50% of starting capital. Add an additional 50% of available cash to the position at every 1% drop in price. Sell at 2% profit or 10% loss.

def initialize(self, state, context, args):
  state['initial_capital'] = float(args.params['capitalBase'])
  state['total_spent'] = 0
  state['total_bought'] = 0
  state['entry_price'] = None
  state['last_buy_price'] = None
  state['target_price'] = None
  state['stop_loss_price'] = None

def run_iteration(self, state, context, args):
  try:
    symbol = args.params['pair']
    initial_capital = state['initial_capital']
    balances = self.exchange.fetch_balance()
    usdt_balance = balances['USDT']['free']
    ticker = self.exchange.fetch_ticker(symbol)
    current_price = ticker['last']

    # If no position has been taken yet, buy with 50% of initial capital
    if state['total_spent'] == 0:
      amount_to_spend = initial_capital * 0.5
      eth_amount = amount_to_spend / current_price
      order = self.exchange.create_order(type='market', side='buy', symbol=symbol, amount=eth_amount)
      state['total_spent'] += amount_to_spend
      state['total_bought'] += eth_amount
      state['entry_price'] = current_price
      state['last_buy_price'] = current_price
      state['target_price'] = state['entry_price'] * 1.02
      state['stop_loss_price'] = state['entry_price'] * 0.90
      log.info(f"Initial buy: {eth_amount} ETH at {current_price} USDT")

    # Check for additional buy condition (1% drop from last buy price)
    elif current_price <= state['last_buy_price'] * 0.99:
      amount_to_spend = usdt_balance * 0.5
      eth_amount = amount_to_spend / current_price
      order = self.exchange.create_order(type='market', side='buy', symbol=symbol, amount=eth_amount)
      state['total_spent'] += amount_to_spend
      state['total_bought'] += eth_amount
      state['last_buy_price'] = current_price
      log.info(f"Additional buy: {eth_amount} ETH at {current_price} USDT")

    # Check for sell condition (2% profit or 10% loss)
    if current_price >= state['target_price'] or current_price <= state['stop_loss_price']:
      order = self.exchange.create_order(type='market', side='sell', symbol=symbol, amount=state['total_bought'])
      log.info(f"Sell: {state['total_bought']} ETH at {current_price} USDT")
      self.context.stop('Target or stop loss reached. Stopping bot.')

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")