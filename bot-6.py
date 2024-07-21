
# Buy ETH/USDT using 100% of starting capital. Sell at 2% profit

def initialize(self, state, context, args):
  state['position'] = None
  state['entry_price'] = None
  state['api_counter'] = 15  # Initialize with maximum allowed API counter
  state['last_api_call'] = time.time()  # Track the last API call time

def run_iteration(self, state, context, args):
  def wait_for_api_limit():
    elapsed_time = time.time() - state['last_api_call']
    state['api_counter'] += elapsed_time * 0.33  # Increment counter based on elapsed time
    state['api_counter'] = min(state['api_counter'], 15)  # Cap the counter at 15
    while state['api_counter'] < 1:  # Ensure at least one API call is available
        time.sleep(1)
        elapsed_time = time.time() - state['last_api_call']
        state['api_counter'] += elapsed_time * 0.33
        state['api_counter'] = min(state['api_counter'], 15)
    state['api_counter'] -= 1  # Decrement the counter for the current API call
    state['last_api_call'] = time.time()

  try:
      symbol = args.params['pair']
      capital_base = float(args.params['capitalBase'])
      wait_for_api_limit()
      balances = self.exchange.fetch_balance()
      usdt_balance = balances['USDT']['free']

      if state['position'] is None and usdt_balance >= capital_base:
          # Buy ETH/USDT using 100% of starting capital
          wait_for_api_limit()
          ticker = self.exchange.fetch_ticker(symbol)
          eth_amount = capital_base / ticker['last']
          wait_for_api_limit()
          order = self.exchange.create_order(symbol, 'market', 'buy', eth_amount)
          state['position'] = order['id']
          state['entry_price'] = ticker['last']
          log.info(f"Bought {eth_amount} ETH at {state['entry_price']} USDT")

      elif state['position'] is not None:
          # Check if we can sell at 2% profit
          wait_for_api_limit()
          ticker = self.exchange.fetch_ticker(symbol)
          target_price = state['entry_price'] * 1.02

          if ticker['last'] >= target_price:
              wait_for_api_limit()
              order = self.exchange.fetch_order(state['position'], symbol)
              eth_amount = order['amount']
              wait_for_api_limit()
              sell_order = self.exchange.create_order(symbol, 'market', 'sell', eth_amount)
              log.info(f"Sold {eth_amount} ETH at {ticker['last']} USDT for a profit")
              state['position'] = None
              state['entry_price'] = None

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")