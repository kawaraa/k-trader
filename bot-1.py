# Buy ETH/USDT using 10% of starting capital. Add an additional 10% of available cash to the position at every 1% drop in price. Sell at 2% profit or 10% loss.

def initialize(self, state, context, args):
    state['initial_capital'] = float(args.params['capitalBase'])
    state['capital_to_spend'] = state['initial_capital'] * 0.1
    state['total_spent'] = 0
    state['position'] = 0
    state['entry_price'] = None
    state['target_price'] = None
    state['stop_loss_price'] = None

def run_iteration(self, state, context, args):
    try:
        symbol = args.params['pair']
        capital_base = float(args.params['capitalBase'])
        balances = self.exchange.fetch_balance()
        usdt_balance = balances['USDT']['free']
        ticker = self.exchange.fetch_ticker(symbol)
        current_price = ticker['last']

        # If no position, buy initial 10% of capital
        if state['position'] == 0:
            if usdt_balance >= state['capital_to_spend']:
                amount_to_buy = state['capital_to_spend'] / current_price
                order = self.exchange.create_order(type='market', side='buy', symbol=symbol, amount=amount_to_buy)
                state['entry_price'] = current_price
                state['target_price'] = state['entry_price'] * 1.02
                state['stop_loss_price'] = state['entry_price'] * 0.90
                state['position'] += amount_to_buy
                state['total_spent'] += state['capital_to_spend']
                log.info(f"Bought {amount_to_buy} ETH at {current_price} USDT")
            else:
                log.info("Insufficient balance to buy initial position.")
        else:
            # Check for 1% drop to add 10% more of available cash
            if current_price <= state['entry_price'] * 0.99:
                additional_capital_to_spend = usdt_balance * 0.1
                if additional_capital_to_spend > 0:
                    amount_to_buy = additional_capital_to_spend / current_price
                    order = self.exchange.create_order(type='market', side='buy', symbol=symbol, amount=amount_to_buy)
                    state['entry_price'] = (state['entry_price'] * state['position'] + current_price * amount_to_buy) / (state['position'] + amount_to_buy)
                    state['target_price'] = state['entry_price'] * 1.02
                    state['stop_loss_price'] = state['entry_price'] * 0.90
                    state['position'] += amount_to_buy
                    state['total_spent'] += additional_capital_to_spend
                    log.info(f"Added {amount_to_buy} ETH at {current_price} USDT")
                else:
                    log.info("Insufficient balance to add to position.")

            # Check for 2% profit to sell
            if current_price >= state['target_price']:
                order = self.exchange.create_order(type='market', side='sell', symbol=symbol, amount=state['position'])
                log.info(f"Sold {state['position']} ETH at {current_price} USDT for profit")
                state['position'] = 0
                state['entry_price'] = None
                state['target_price'] = None
                state['stop_loss_price'] = None

            # Check for 10% loss to sell
            elif current_price <= state['stop_loss_price']:
                order = self.exchange.create_order(type='market', side='sell', symbol=symbol, amount=state['position'])
                log.info(f"Sold {state['position']} ETH at {current_price} USDT for loss")
                state['position'] = 0
                state['entry_price'] = None
                state['target_price'] = None
                state['stop_loss_price'] = None

    except Exception as e:
        log.error(f"Error in run_iteration: {str(e)}")
        if "Temporary lockout" in str(e):
            log.error("Temporary lockout detected. Retrying in 60 seconds...")
            time.sleep(60)  # Wait for 60 seconds before retrying
            self.run_iteration(state, context, args)  # Retry the function
        else:
            log.error(f"Unhandled exception: {str(e)}")