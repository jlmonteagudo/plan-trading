import * as ccxt from 'ccxt';

export interface SignalResult {
  isSignal: boolean;
  reason?: string;
  metadata?: any;
}

export interface SignalDetector {
  name: string;
  checkForSignal(ohlcv: ccxt.OHLCV[]): SignalResult;
}
