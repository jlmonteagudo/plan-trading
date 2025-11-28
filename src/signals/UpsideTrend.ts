import * as ccxt from 'ccxt';
import type { Config } from '../config.js';
import type { SignalDetector, SignalResult } from './SignalDetector.js';

export class UpsideTrend implements SignalDetector {
  name = 'UpsideTrend';
  private minSlope: number;
  private minR2: number;

  constructor(config: Config) {
    this.minSlope = parseFloat(config.UPSIDE_TREND_MIN_SLOPE);
    this.minR2 = parseFloat(config.UPSIDE_TREND_MIN_R2);
  }

  checkForSignal(ohlcv: ccxt.OHLCV[]): SignalResult {
    if (ohlcv.length < 2) {
      return { isSignal: false };
    }

    // Extract close prices (y) and create time indices (x)
    const validCloses = ohlcv
      .map(candle => candle[4])
      .filter((p): p is number => p !== undefined && p !== null);

    if (validCloses.length < 2) {
      return { isSignal: false };
    }

    const n = validCloses.length;
    
    // Normalize prices to percentage change from the first candle to make slope comparable across different price ranges
    // Or simply use raw prices? The user prompt mentioned "sustained growing movement".
    // If we use raw prices, slope depends on the asset price (BTC vs ADA). 
    // Better to normalize: y = (price / first_price) - 1
    // This way slope represents "percentage growth per candle".
    
    const firstPrice = validCloses[0];
    if (!firstPrice) return { isSignal: false };

    const y = validCloses.map(p => (p / firstPrice) - 1);
    const x = Array.from({ length: n }, (_, i) => i);

    // Linear Regression Calculation
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared Calculation
    const yMean = sumY / n;
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const yPred = slope * x[i] + intercept;
      ssRes += Math.pow(y[i] - yPred, 2);
      ssTot += Math.pow(y[i] - yMean, 2);
    }

    const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

    // Check conditions
    const isSlopePositive = slope > this.minSlope;
    const isR2Valid = r2 > this.minR2;

    const isSignal = isSlopePositive && isR2Valid;

    return {
      isSignal,
      reason: isSignal 
        ? `Upside Trend Detected: Slope=${slope.toFixed(6)}, R2=${r2.toFixed(4)}` 
        : undefined,
      metadata: {
        slope,
        r2,
        minSlope: this.minSlope,
        minR2: this.minR2
      }
    };
  }
}
