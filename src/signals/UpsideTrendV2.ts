import * as ccxt from 'ccxt';
import type { Config } from '../config.js';
import type { SignalDetector, SignalResult } from './SignalDetector.js';

export class UpsideTrendV2 implements SignalDetector {
  name = 'UpsideTrendV2';
  private minSlope: number;
  private minR2: number;

  constructor(config: Config) {
    this.minSlope = parseFloat(config.UPSIDE_TREND_MIN_SLOPE);
    this.minR2 = parseFloat(config.UPSIDE_TREND_MIN_R2);
  }

  checkForSignal(ohlcv: ccxt.OHLCV[]): SignalResult {
    const WINDOW = Math.max(3, Math.min(ohlcv.length, 20)); // configurable, here 3..20
    const data = ohlcv.slice(-WINDOW);
    if (data.length < 3) return { isSignal: false };

    const closes = data.map(c => c[4]).filter((p): p is number => p !== undefined && p !== null);
    const n = closes.length;
    if (n < 3) return { isSignal: false };

    const firstPrice = closes[0];
    if (!isFinite(firstPrice) || firstPrice <= 0) return { isSignal: false };

    // Normalizar a retornos relativos (por vela)
    const y = closes.map(p => (p / firstPrice) - 1); // unit: fraction since firstPrice
    const x = Array.from({ length: n }, (_, i) => i);

    // Exponential weights: recent points matter more
    const alpha = 0.6; // configurable: 0..1 (1 -> last point only)
    const weights = x.map(i => Math.pow(alpha, n - 1 - i));
    const wSum = weights.reduce((s, w) => s + w, 0);

    // Weighted linear regression (slope in fraction per index)
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      const xi = x[i];
      const yi = y[i];
      sumW += w;
      sumWX += w * xi;
      sumWY += w * yi;
      sumWXX += w * xi * xi;
      sumWXY += w * xi * yi;
    }
    const denom = (sumW * sumWXX - sumWX * sumWX);
    if (denom === 0) return { isSignal: false };
    const slope = (sumW * sumWXY - sumWX * sumWY) / denom; // fraction per candle
    const intercept = (sumWY - slope * sumWX) / sumW;

    // Weighted R2
    const yMean = sumWY / sumW;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      const yPred = slope * x[i] + intercept;
      ssRes += w * Math.pow(y[i] - yPred, 2);
      ssTot += w * Math.pow(y[i] - yMean, 2);
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    // Convert slope to percent per vela for human thresholds
    const slopePctPerCandle = slope * 100;

    // Additional confirmations
    const lastClose = closes[n - 1];
    const prevClose = closes[n - 2];
    // Simple SMA of window
    const sma = closes.reduce((s, v) => s + v, 0) / n;

    const unitMinSlope = this.minSlope; // document: minSlope = fraction per candle (e.g. 0.002 = 0.2%)
    const isSlopePositive = slope > unitMinSlope;
    const isR2Valid = r2 > this.minR2;
    const lastAbovePred = ( (lastClose / firstPrice) - 1 ) >= (slope * (n - 1) + intercept );
    const lastAboveSMA = lastClose > sma;
    const momentumUp = lastClose > prevClose;

    const isSignal = isSlopePositive && isR2Valid && lastAbovePred && lastAboveSMA && momentumUp;

    return {
      isSignal,
      reason: isSignal ? 
        `UpsideTrend: slope=${(slopePctPerCandle).toFixed(3)}%/candle r2=${r2.toFixed(3)} lastAbovePred=${lastAbovePred}` :
        undefined,
      metadata: { slope, slopePctPerCandle, r2, n, sma, lastClose, prevClose, minSlope: this.minSlope, minR2: this.minR2 }
    };
  }
}
