import * as ccxt from 'ccxt';
import type { Config } from '../config.js';
import type { SignalDetector, SignalResult } from './SignalDetector.js';

export class SpikeVolumeAndPrice implements SignalDetector {
  name = 'SpikeVolumeAndPrice';
  private volumeSpikeFactor: number;
  private priceSpikeFactor: number;

  constructor(config: Config) {
    this.volumeSpikeFactor = parseFloat(config.VOLUME_SPIKE_FACTOR);
    this.priceSpikeFactor = parseFloat(config.PRICE_SPIKE_FACTOR);
  }

  checkForSignal(ohlcv: ccxt.OHLCV[]): SignalResult {
    const lastCandle = ohlcv[ohlcv.length - 1];
    if (!lastCandle) {
      return { isSignal: false };
    }
    const [, open, , , close, volume] = lastCandle;

    if (open === undefined || close === undefined || volume === undefined) {
      return { isSignal: false };
    }

    const previousVolumes = ohlcv
      .slice(0, ohlcv.length - 1)
      .map(candle => candle ? candle[5] : undefined)
      .filter((v): v is number => v !== undefined);

    if (previousVolumes.length === 0) {
      return { isSignal: false };
    }
    const averagePreviousVolume = previousVolumes.reduce((sum, vol) => sum + vol, 0) / previousVolumes.length;

    if (averagePreviousVolume === 0) {
      return { isSignal: false };
    }

    const volumeSpike = volume / averagePreviousVolume;
    const isVolumeSpike = volumeSpike >= this.volumeSpikeFactor;

    const priceChange = (close - open) / open;
    const isPriceSpike = priceChange >= (this.priceSpikeFactor - 1);

    const isSignal = isVolumeSpike && isPriceSpike;

    return {
      isSignal,
      reason: isSignal ? `Volume Spike: x${volumeSpike.toFixed(2)}, Price Change: ${(priceChange * 100).toFixed(2)}%` : undefined,
      metadata: {
        volumeSpike,
        priceChange
      }
    };
  }
}
