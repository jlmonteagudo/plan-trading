import * as ccxt from 'ccxt';
import { Telegraf } from 'telegraf';
import type { Config } from './config.js';
import type { SignalDetector, SignalResult } from './signals/SignalDetector.js';
import { SpikeVolumeAndPrice } from './signals/SpikeVolumeAndPrice.js';
import { UpsideTrend } from './signals/UpsideTrend.js';

const AVAILABLE_SIGNALS: { [key: string]: new (config: Config) => SignalDetector } = {
  'SpikeVolumeAndPrice': SpikeVolumeAndPrice,
  'UpsideTrend': UpsideTrend,
};

async function getTopMarkets(exchange: ccxt.Exchange, config: Config): Promise<ccxt.Ticker[]> {
  let tickers: ccxt.Ticker[];
  try {
    const tickerData = await exchange.fetchTickers();
    tickers = Object.values(tickerData);
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return [];
  }

  const minVolume = parseFloat(config.MIN_VOLUME_24H);
  const topN = parseInt(config.TOP_N_MARKETS, 10);

  const marketsSelectedByQuote = tickers.filter(
    (ticker) =>
      ticker &&
      ticker.symbol.endsWith(`/${config.QUOTE_CURRENCY}`) &&
      ticker.quoteVolume &&
      ticker.quoteVolume > minVolume
  );

  marketsSelectedByQuote.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
  return marketsSelectedByQuote.slice(0, topN);
}

async function sendTelegramNotification(bot: Telegraf, config: Config, market: ccxt.Ticker, result: SignalResult): Promise<void> {
  const [base, quote] = market.symbol.split('/');
  if (!base || !quote) {
      console.log(`Could not extract base and quote from ${market.symbol}. Skipping.`);
      return;
  }
  const deepLink = `https://www.binance.com/en/trade/${base}_${quote}`;
  const callbackData = `BUY_${market.symbol}`;

  let message = `
🚨 *SEÑAL DE COMPRA DETECTADA* 🚨

*Mercado:* ${market.symbol}
`;

  if (result.reason) {
    message += `*Detalles:* ${result.reason}\n`;
  }

  message += `
[Ver en Binance](${deepLink})
  `;

  try {
    const isLocalhost = config.EXECUTOR_WEBHOOK_URL.includes('localhost') || config.EXECUTOR_WEBHOOK_URL.includes('127.0.0.1');
    const extra: any = {
      parse_mode: 'Markdown',
    };

    if (!isLocalhost) {
      extra.reply_markup = {
        inline_keyboard: [
          [
            {
              text: 'Comprar',
              url: `${config.EXECUTOR_WEBHOOK_URL}/webhook/${config.EXECUTOR_WEBHOOK_TOKEN}?action=${callbackData}&symbol=${market.symbol}`,
            },
          ],
        ],
      };
    } else {
        message += '\n_(Botón de compra deshabilitado en localhost)_';
    }

    await bot.telegram.sendMessage(config.TELEGRAM_CHAT_ID, message, extra);
    console.log(`Signal for ${market.symbol} sent to Telegram.`);
  } catch (telegramError) {
    console.error(`Error sending Telegram message for ${market.symbol}:`, telegramError);
  }
}

async function analyzeMarket(exchange: ccxt.Exchange, market: ccxt.Ticker, bot: Telegraf, config: Config, detectors: SignalDetector[]): Promise<void> {
  if (!market) return;
  // console.log(`Analyzing market: ${market.symbol}`); // Verbose logging reduced

  const candleHistoryCount = parseInt(config.CANDLE_HISTORY_COUNT, 10);

  let ohlcv: ccxt.OHLCV[];
  try {
    ohlcv = await exchange.fetchOHLCV(market.symbol, config.CANDLE_TIMEFRAME, undefined, candleHistoryCount);
  } catch (error) {
    console.error(`Error fetching OHLCV for ${market.symbol}:`, error);
    return;
  }

  if (ohlcv.length < candleHistoryCount) {
    // console.log(`Not enough OHLCV data for ${market.symbol}. Skipping.`);
    return;
  }

  for (const detector of detectors) {
    const result = detector.checkForSignal(ohlcv);
    if (result.isSignal) {
      console.log(`SIGNAL DETECTED for ${market.symbol} by ${detector.name}!`);
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      await sendTelegramNotification(bot, config, market, result);
      return; // Stop after first signal
    } else if (detector.name === 'UpsideTrend' && result.metadata) {
       // Debug logging for UpsideTrend to help user tune parameters
       console.log(`[UpsideTrend] ${market.symbol}: Slope=${result.metadata.slope?.toFixed(6)}, R2=${result.metadata.r2?.toFixed(4)} (Thresholds: Slope>${result.metadata.minSlope}, R2>${result.metadata.minR2})`);
    }
  }
}

export async function runScanner(config: Config): Promise<void> {
  console.log(`Scanner triggered at ${new Date().toISOString()}`);

  const exchange = new ccxt.binance({
    apiKey: config.BINANCE_API_KEY,
    secret: config.BINANCE_SECRET_KEY,
    options: {
      defaultType: 'spot',
    },
  });

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  const detectors: SignalDetector[] = [];
  for (const signalName of config.ACTIVE_SIGNALS) {
    const DetectorClass = AVAILABLE_SIGNALS[signalName.trim()];
    if (DetectorClass) {
      detectors.push(new DetectorClass(config));
    } else {
      console.warn(`Signal detector ${signalName} not found.`);
    }
  }

  if (detectors.length === 0) {
    console.warn('No signal detectors active.');
    return;
  }

  const topMarkets = await getTopMarkets(exchange, config);

  console.log(`Found ${topMarkets.length} top markets to analyze: ${topMarkets.map(m => m.symbol).join(', ')}`);
  for (const market of topMarkets) {
    await analyzeMarket(exchange, market, bot, config, detectors);
  }

  console.log('Scanner finished.');
}
