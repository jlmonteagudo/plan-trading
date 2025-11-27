import * as ccxt from 'ccxt';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';

/**
 * Places a One-Cancels-the-Other (OCO) order on Binance.
 * This creates a pair of orders: a take-profit limit order and a stop-loss limit order.
 * If one order is executed, the other is automatically canceled.
 * @param exchange - The ccxt exchange instance.
 * @param buyOrder - The successfully executed market buy order.
 * @param config - The configuration object.
 * @returns The result of the OCO order placement.
 */
async function placeOcoOrder(exchange: ccxt.Exchange, buyOrder: ccxt.Order, config: Config) {
  const { symbol, average, filled } = buyOrder;
  if (!average || !filled) {
    throw new Error('The buy order must have an average price and a filled amount to place an OCO order.');
  }

  // Load markets to get precision details
  await exchange.loadMarkets();

  const takeProfitFactor = parseFloat(config.TAKE_PROFIT_FACTOR);
  const stopLossFactor = parseFloat(config.STOP_LOSS_FACTOR);

  // 1. Calculate Take Profit price
  const takeProfitPrice = average * takeProfitFactor;

  // 2. Calculate Stop Loss prices
  const stopPrice = average * stopLossFactor; // The price at which the stop-loss order is triggered
  const stopLimitPrice = stopPrice * 0.995; // The price at which the stop-loss limit order will be placed (slightly lower to ensure it fills)

  // 3. Format all values to the precision required by the exchange
  const amountPrecision = exchange.market(symbol).precision.amount;
  const pricePrecision = exchange.market(symbol).precision.price;

  const quantity = exchange.amountToPrecision(symbol, filled);
  const formattedTakeProfitPrice = exchange.priceToPrecision(symbol, takeProfitPrice);
  const formattedStopPrice = exchange.priceToPrecision(symbol, stopPrice);
  const formattedStopLimitPrice = exchange.priceToPrecision(symbol, stopLimitPrice);

  console.log(`Placing OCO order for ${symbol}:`);
  console.log(`  Quantity: ${quantity}`);
  console.log(`  Take Profit Price: ${formattedTakeProfitPrice}`);
  console.log(`  Stop Price: ${formattedStopPrice}`);
  console.log(`  Stop Limit Price: ${formattedStopLimitPrice}`);

  // 4. Use the exchange-specific method for placing OCO orders on Binance
  const params = {
    'symbol': exchange.marketId(symbol),
    'side': 'SELL',
    'quantity': quantity,
    'price': formattedTakeProfitPrice,
    'stopPrice': formattedStopPrice,
    'stopLimitPrice': formattedStopLimitPrice,
    'stopLimitTimeInForce': 'GTC', // Good-Til-Canceled
  };

  // The 'privatePostOrderOco' is a non-unified method in ccxt to access Binance's specific OCO endpoint.
  const ocoOrder = await (exchange as any).privatePostOrderOco(params);
  return ocoOrder;
}

interface WebhookQuery {
  action?: string;
  symbol?: string;
}

interface WebhookParams {
  token: string;
}

export function registerExecutorRoutes(server: FastifyInstance, config: Config) {
  server.get<{ Params: WebhookParams, Querystring: WebhookQuery }>('/webhook/:token', async (request, reply) => {
    const { token } = request.params;
    const { action, symbol } = request.query;

    // RF-10: Secure endpoint with a token
    if (token !== config.EXECUTOR_WEBHOOK_TOKEN) {
      return reply.status(401).send('Unauthorized');
    }

    if (!action || !symbol || !action.startsWith('BUY_')) {
      return reply.status(400).send('Missing or invalid action/symbol');
    }

    console.log(`Executor received valid request for symbol ${symbol}`);

    const exchange = new ccxt.binance({
      apiKey: config.BINANCE_API_KEY,
      secret: config.BINANCE_SECRET_KEY,
    });

    try {
      const orderAmount = parseFloat(config.ORDER_AMOUNT_USDC);
      // RF-07: Execute a market buy order
      console.log(`Executing market buy order for ${symbol} with amount ${orderAmount} USDC`);
      const buyOrder = await exchange.createMarketBuyOrderWithCost(symbol, orderAmount);
      console.log('Successfully placed market buy order:', buyOrder);

      // RF-08: Place OCO order immediately after
      const ocoOrder = await placeOcoOrder(exchange, buyOrder, config);
      console.log('Successfully placed OCO order:', ocoOrder);

      return reply.status(200).send({
        message: `Successfully placed market buy and OCO orders for ${symbol}.`,
        buyOrder,
        ocoOrder,
      });

    } catch (error) {
      console.error(`Error during execution for ${symbol}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return reply.status(500).send({
        message: `Failed to execute trade for ${symbol}.`,
        error: errorMessage,
      });
    }
  });
}
