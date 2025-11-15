// src/scanner.ts

import * as ccxt from 'ccxt';
import { Telegraf } from 'telegraf';

// Define the Env interface for Cloudflare Workers environment variables
// This now includes all configuration variables that will be passed from wrangler.toml
interface Env {
  BINANCE_API_KEY: string;
  BINANCE_SECRET_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EXECUTOR_WEBHOOK_TOKEN: string;
  EXECUTOR_WEBHOOK_URL: string;

  // Configuration variables
  QUOTE_CURRENCY: string;
  MIN_VOLUME_24H: string;
  TOP_N_MARKETS: string;
  CANDLE_TIMEFRAME: string;
  CANDLE_HISTORY_COUNT: string;
  VOLUME_SPIKE_FACTOR: string;
  PRICE_SPIKE_FACTOR: string;
}

async function getTopMarkets(exchange: ccxt.Exchange, env: Env): Promise<ccxt.Ticker[]> {
  let tickers: ccxt.Ticker[];
  try {
    const tickerData = await exchange.fetchTickers();
    tickers = Object.values(tickerData);
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return [];
  }

  const minVolume = parseFloat(env.MIN_VOLUME_24H);
  const topN = parseInt(env.TOP_N_MARKETS, 10);

  const marketsSelectedByQuote = tickers.filter(
    (ticker) =>
      ticker &&
      ticker.symbol.endsWith(`/${env.QUOTE_CURRENCY}`) &&
      ticker.quoteVolume &&
      ticker.quoteVolume > minVolume
  );

  marketsSelectedByQuote.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
  return marketsSelectedByQuote.slice(0, topN);
}

function checkForSignal(ohlcv: ccxt.OHLCV[], env: Env): { isSignal: boolean; volumeSpike: number; priceChange: number } {
  const lastCandle = ohlcv[ohlcv.length - 1];
  if (!lastCandle) {
    return { isSignal: false, volumeSpike: 0, priceChange: 0 };
  }
  const [, open, , , close, volume] = lastCandle;

  if (open === undefined || close === undefined || volume === undefined) {
    return { isSignal: false, volumeSpike: 0, priceChange: 0 };
  }

  const previousVolumes = ohlcv
    .slice(0, ohlcv.length - 1)
    .map(candle => candle ? candle[5] : undefined)
    .filter((v): v is number => v !== undefined);

  if (previousVolumes.length === 0) {
    return { isSignal: false, volumeSpike: 0, priceChange: 0 };
  }
  const averagePreviousVolume = previousVolumes.reduce((sum, vol) => sum + vol, 0) / previousVolumes.length;

  if (averagePreviousVolume === 0) {
    return { isSignal: false, volumeSpike: 0, priceChange: 0 };
  }

  const volumeSpikeFactor = parseFloat(env.VOLUME_SPIKE_FACTOR);
  const priceSpikeFactor = parseFloat(env.PRICE_SPIKE_FACTOR);

  const volumeSpike = volume / averagePreviousVolume;
  const isVolumeSpike = volumeSpike >= volumeSpikeFactor;

  const priceChange = (close - open) / open;
  const isPriceSpike = priceChange >= (priceSpikeFactor - 1);

  return { isSignal: isVolumeSpike && isPriceSpike, volumeSpike, priceChange };
}

async function sendTelegramNotification(bot: Telegraf, env: Env, market: ccxt.Ticker, volumeSpike: number, priceChange: number): Promise<void> {
  const [base, quote] = market.symbol.split('/');
  if (!base || !quote) {
      console.log(`Could not extract base and quote from ${market.symbol}. Skipping.`);
      return;
  }
  const deepLink = `https://www.binance.com/en/trade/${base}_${quote}`;
  const callbackData = `BUY_${market.symbol}`;

  const message = `
🚨 *SEÑAL DE COMPRA DETECTADA* 🚨

*Mercado:* ${market.symbol}
*Volumen Spike:* x${volumeSpike.toFixed(2)}
*Cambio de Precio:* ${(priceChange * 100).toFixed(2)}%

[Ver en Binance](${deepLink})
  `;

  try {
    await bot.telegram.sendMessage(env.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Comprar',
              url: `${env.EXECUTOR_WEBHOOK_URL}/${env.EXECUTOR_WEBHOOK_TOKEN}?action=${callbackData}&symbol=${market.symbol}`,
            },
          ],
        ],
      },
    });
    console.log(`Signal for ${market.symbol} sent to Telegram.`);
  } catch (telegramError) {
    console.error(`Error sending Telegram message for ${market.symbol}:`, telegramError);
  }
}

async function analyzeMarket(exchange: ccxt.Exchange, market: ccxt.Ticker, bot: Telegraf, env: Env): Promise<void> {
  if (!market) return;
  console.log(`Analyzing market: ${market.symbol}`);

  const candleHistoryCount = parseInt(env.CANDLE_HISTORY_COUNT, 10);

  let ohlcv: ccxt.OHLCV[];
  try {
    ohlcv = await exchange.fetchOHLCV(market.symbol, env.CANDLE_TIMEFRAME, undefined, candleHistoryCount);
  } catch (error) {
    console.error(`Error fetching OHLCV for ${market.symbol}:`, error);
    return;
  }

  if (ohlcv.length < candleHistoryCount) {
    console.log(`Not enough OHLCV data for ${market.symbol}. Skipping.`);
    return;
  }

  const { isSignal, volumeSpike, priceChange } = checkForSignal(ohlcv, env);

  if (isSignal) {
    console.log(`SIGNAL DETECTED for ${market.symbol}!`);
    console.log(`  Volume Spike: x${volumeSpike.toFixed(2)}`);
    console.log(`  Price Change: ${(priceChange * 100).toFixed(2)}%`);
    await sendTelegramNotification(bot, env, market, volumeSpike, priceChange);
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Scanner Worker triggered at ${event.scheduledTime}`);

    const exchange = new ccxt.binance({
      apiKey: env.BINANCE_API_KEY,
      secret: env.BINANCE_SECRET_KEY,
      options: {
        defaultType: 'spot',
      },
    });

    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    const topMarkets = await getTopMarkets(exchange, env);

    console.log(`Found ${topMarkets.length} top markets to analyze.`);
    for (const market of topMarkets) {
      await analyzeMarket(exchange, market, bot, env);
    }

    console.log('Scanner Worker finished.');
  },
};
