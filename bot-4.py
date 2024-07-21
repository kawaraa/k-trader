
# Check the price and Buy ETH/USDT using 100% of starting capital if at 1% drop in price. Sell at 2% profit or 10% loss.

def initialize(self, state, context, args):
  state['initial_price'] = None
  state['position'] = None
  state['capital'] = float(args.params['capitalBase'])
  state['pair'] = args.params['pair']

def run_iteration(self, state, context, args):
  try:
    # Fetch the current price
    time.sleep(0.33)
    ticker = self.exchange.fetch_ticker(state['pair'])
    current_price = ticker['last']

    # If we don't have an initial price, set it
    if state['initial_price'] is None:
      state['initial_price'] = current_price

    # Check if we have an open position
    if state['position'] is None:
      # Check if the price has dropped by 1% from the initial price
      if current_price <= state['initial_price'] * 0.99:
        time.sleep(0.33)
        # Calculate the amount of ETH to buy with the available capital
        amount_to_buy = state['capital'] / current_price
        order = self.exchange.create_order(type='market', side='buy', symbol=state['pair'], amount=amount_to_buy)
        state['position'] = {
          'order_id': order['id'],
          'buy_price': current_price,
          'amount': amount_to_buy
        }
        log.info(f"Bought {amount_to_buy} ETH at {current_price} USDT")
    else:
      # Fetch the order to get the exact buy price
      time.sleep(0.33)
      order = self.exchange.fetch_order(state['position']['order_id'], state['pair'])
      buy_price = order['price']
      amount = state['position']['amount']

      # Check for take profit or stop loss conditions
      if current_price >= buy_price * 1.02:
        # Sell at 2% profit
        time.sleep(0.33)
        self.exchange.create_order(type='market', side='sell', symbol=state['pair'], amount=amount)
        log.info(f"Sold {amount} ETH at {current_price} USDT for a profit")
        state['position'] = None
        state['initial_price'] = current_price
      elif current_price <= buy_price * 0.90:
        # Sell at 10% loss
        time.sleep(0.33)
        self.exchange.create_order(type='market', side='sell', symbol=state['pair'], amount=amount)
        log.info(f"Sold {amount} ETH at {current_price} USDT for a loss")
        state['position'] = None
        state['initial_price'] = current_price

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")