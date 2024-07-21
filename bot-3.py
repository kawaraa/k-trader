# Buy ETH/USDT using 100% of starting capital if at 1% drop in price. Sell at 2% profit or 10% loss.

def initialize(self, state, context, args):
  state['position'] = None
  state['entry_price'] = None
  state['capital_base'] = float(args.params['capitalBase'])
  state['pair'] = args.params['pair']
  state['drop_threshold'] = 0.01  # 1% drop
  state['profit_threshold'] = 0.02  # 2% profit
  state['loss_threshold'] = 0.10  # 10% loss
  state['initial_price'] = None

def run_iteration(self, state, context, args):
  try:
      ticker = self.exchange.fetch_ticker(state['pair'])
      current_price = ticker['last']

      if state['initial_price'] is None:
          state['initial_price'] = current_price

      # Check if we need to buy
      if state['position'] is None:
          price_drop = (state['initial_price'] - current_price) / state['initial_price']
          if price_drop >= state['drop_threshold']:
              # Calculate the amount of ETH to buy with the available capital
              amount_to_buy = state['capital_base'] / current_price
              order = self.exchange.create_order(type='market', side='buy', symbol=state['pair'], amount=amount_to_buy)
              state['position'] = order['id']
              state['entry_price'] = current_price
              log.info(f"Bought {amount_to_buy} ETH at {current_price} USDT")

      # Check if we need to sell
      if state['position'] is not None:
          profit = (current_price - state['entry_price']) / state['entry_price']
          if profit >= state['profit_threshold'] or profit <= -state['loss_threshold']:
              # Fetch the amount of ETH we have
              balances = self.exchange.fetch_balance()
              eth_balance = balances[state['pair'].split('/')[0]]['free']
              order = self.exchange.create_order(type='market', side='sell', symbol=state['pair'], amount=eth_balance)
              log.info(f"Sold {eth_balance} ETH at {current_price} USDT")
              state['position'] = None
              state['entry_price'] = None
              state['initial_price'] = current_price  # Reset initial price after selling

  except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")