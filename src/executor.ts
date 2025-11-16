// src/executor.ts

import * as ccxt from 'ccxt';
import { Router } from 'itty-router';
import type { IRequest } from 'itty-router';

// Define the Env interface for Cloudflare Workers environment variables
interface Env {
  BINANCE_API_KEY: string;
  BINANCE_SECRET_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EXECUTOR_WEBHOOK_TOKEN: string;

  // Configuration variables
  ORDER_AMOUNT_USDC: string;
  TAKE_PROFIT_FACTOR: string;
  STOP_LOSS_FACTOR: string;
}

/**
 * Places a One-Cancels-the-Other (OCO) order on Binance.
 * This creates a pair of orders: a take-profit limit order and a stop-loss limit order.
 * If one order is executed, the other is automatically canceled.
 * @param exchange - The ccxt exchange instance.
 * @param buyOrder - The successfully executed market buy order.
 * @param env - The environment variables containing configuration.
 * @returns The result of the OCO order placement.
 */
async function placeOcoOrder(exchange: ccxt.Exchange, buyOrder: ccxt.Order, env: Env) {
  const { symbol, average, filled } = buyOrder;
  if (!average || !filled) {
    throw new Error('The buy order must have an average price and a filled amount to place an OCO order.');
  }

  // Load markets to get precision details
  await exchange.loadMarkets();

  const takeProfitFactor = parseFloat(env.TAKE_PROFIT_FACTOR);
  const stopLossFactor = parseFloat(env.STOP_LOSS_FACTOR);

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


const router = Router();

router.get('/:token', async (request: IRequest, env: Env) => {
  const { params, query } = request;

  // RF-10: Secure endpoint with a token
  if (params.token !== env.EXECUTOR_WEBHOOK_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  const action = query.action as string;
  const symbol = query.symbol as string;

  if (!action || !symbol || !action.startsWith('BUY_')) {
    return new Response('Missing or invalid action/symbol', { status: 400 });
  }

  console.log(`Executor received valid request for symbol ${symbol}`);

  const exchange = new ccxt.binance({
    apiKey: env.BINANCE_API_KEY,
    secret: env.BINANCE_SECRET_KEY,
  });

  try {
    const orderAmount = parseFloat(env.ORDER_AMOUNT_USDC);
    // RF-07: Execute a market buy order
    console.log(`Executing market buy order for ${symbol} with amount ${orderAmount} USDC`);
    const buyOrder = await exchange.createMarketBuyOrderWithCost(symbol, orderAmount);
    console.log('Successfully placed market buy order:', buyOrder);

    // RF-08: Place OCO order immediately after
    const ocoOrder = await placeOcoOrder(exchange, buyOrder, env);
    console.log('Successfully placed OCO order:', ocoOrder);

    return new Response(JSON.stringify({
      message: `Successfully placed market buy and OCO orders for ${symbol}.`,
      buyOrder,
      ocoOrder,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`Error during execution for ${symbol}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({
      message: `Failed to execute trade for ${symbol}.`,
      error: errorMessage,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Catch-all for other routes
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  },
};
