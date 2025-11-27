import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  BINANCE_API_KEY: string;
  BINANCE_SECRET_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EXECUTOR_WEBHOOK_TOKEN: string;
  EXECUTOR_WEBHOOK_URL: string; // Public URL of the droplet

  // Configuration variables
  CRON_SCHEDULE: string;
  QUOTE_CURRENCY: string;
  MIN_VOLUME_24H: string;
  TOP_N_MARKETS: string;
  CANDLE_TIMEFRAME: string;
  CANDLE_HISTORY_COUNT: string;
  VOLUME_SPIKE_FACTOR: string;
  PRICE_SPIKE_FACTOR: string;
  ORDER_AMOUNT_USDC: string;
  TAKE_PROFIT_FACTOR: string;
  STOP_LOSS_FACTOR: string;
  PORT: number;
  ACTIVE_SIGNALS: string[];

  // UpsideTrend Signal Config
  UPSIDE_TREND_MIN_SLOPE: string;
  UPSIDE_TREND_MIN_R2: string;
}

export const config: Config = {
  BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
  BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY || '',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  EXECUTOR_WEBHOOK_TOKEN: process.env.EXECUTOR_WEBHOOK_TOKEN || '',
  EXECUTOR_WEBHOOK_URL: process.env.EXECUTOR_WEBHOOK_URL || 'http://localhost:3000',

  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '*/1 * * * *',
  QUOTE_CURRENCY: process.env.QUOTE_CURRENCY || 'USDC',
  MIN_VOLUME_24H: process.env.MIN_VOLUME_24H || '10000000',
  TOP_N_MARKETS: process.env.TOP_N_MARKETS || '20',
  CANDLE_TIMEFRAME: process.env.CANDLE_TIMEFRAME || '5m',
  CANDLE_HISTORY_COUNT: process.env.CANDLE_HISTORY_COUNT || '100',
  VOLUME_SPIKE_FACTOR: process.env.VOLUME_SPIKE_FACTOR || '2.0',
  PRICE_SPIKE_FACTOR: process.env.PRICE_SPIKE_FACTOR || '1.01',
  ORDER_AMOUNT_USDC: process.env.ORDER_AMOUNT_USDC || '50',
  TAKE_PROFIT_FACTOR: process.env.TAKE_PROFIT_FACTOR || '1.025',
  STOP_LOSS_FACTOR: process.env.STOP_LOSS_FACTOR || '0.9875',
  PORT: parseInt(process.env.PORT || '3000', 10),
  ACTIVE_SIGNALS: (process.env.ACTIVE_SIGNALS || 'SpikeVolumeAndPrice').split(','),

  UPSIDE_TREND_MIN_SLOPE: process.env.UPSIDE_TREND_MIN_SLOPE || '0.0005',
  UPSIDE_TREND_MIN_R2: process.env.UPSIDE_TREND_MIN_R2 || '0.5',
};
