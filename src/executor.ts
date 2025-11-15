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
    const order = await exchange.createMarketBuyOrderWithCost(symbol, orderAmount);

    console.log('Successfully placed market buy order:', order);

    // Here we will later implement RF-08: Place OCO order

    return new Response(JSON.stringify({
      message: `Successfully placed market buy order for ${symbol}.`,
      order,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`Error placing market buy order for ${symbol}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({
      message: `Failed to place market buy order for ${symbol}.`,
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
