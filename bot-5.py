
# Check the price and Buy ETH/USDT using 100% of starting capital if at 1% raise in price. Sell at 2% profit.

def initialize(self, state, context, args):
  state['initial_price'] = None
  state['position'] = None
  state['capital_base'] = float(args.params['capitalBase'])
  state['pair'] = args.params['pair']

def run_iteration(self, state, context, args):
  try:
    # Fetch the current price of the pair
    ticker = self.exchange.fetch_ticker(state['pair'])
    current_price = ticker['last']

    # If initial price is not set, set it to the current price
    if state['initial_price'] is None:
      state['initial_price'] = current_price

    # Check if we have an open position
    if state['position'] is None:
      # Calculate the price increase percentage
      price_increase = (current_price - state['initial_price']) / state['initial_price'] * 100

      # If the price has increased by 1% or more, buy ETH/USDT with 100% of the starting capital
      if price_increase >= 1:
        balances = self.exchange.fetch_balance()
        usdt_balance = balances['USDT']['free']
        amount_to_buy = usdt_balance / current_price
        order = self.exchange.create_order(type='market', side='buy', symbol=state['pair'], amount=amount_to_buy)
        state['position'] = {
          'order_id': order['id'],
          'buy_price': current_price,
          'amount': amount_to_buy
        }
        log.info(f"Bought {amount_to_buy} ETH at {current_price} USDT")
    else:
      # Calculate the target sell price for 2% profit
      target_sell_price = state['position']['buy_price'] * 1.02

      # If the current price is at or above the target sell price, sell the position
      if current_price >= target_sell_price:
        order = self.exchange.create_order(type='market', side='sell', symbol=state['pair'], amount=state['position']['amount'])
        log.info(f"Sold {state['position']['amount']} ETH at {current_price} USDT")
        state['position'] = None
        state['initial_price'] = None

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")