/**
 * Order Execution Detector Service
 * Detects and analyzes order execution types from Bybit WebSocket
 *
 * Responsibilities:
 * - Identify TP/SL/Trailing Stop/Entry execution types
 * - Track TP counter for multiple TP hits
 * - Track last close reason for journal
 * - Return structured execution result for downstream processing
 */

import { LoggerService, OrderExecutionData } from '../types';

export interface OrderExecutionResult {
  type: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'ENTRY' | 'UNKNOWN';
  tpLevel?: number; // For TP: 1, 2, 3, etc.
  orderId?: string;
  symbol: string;
  closedSize: number;
  execPrice: number;
  execQty: string;
  side: string;
  closedSizeStr?: string;
}

export class OrderExecutionDetectorService {
  private tpCounter: number = 0;
  private lastCloseReason: 'SL' | 'TP' | 'TRAILING' | null = null;

  constructor(private readonly logger: LoggerService) {}

  /**
   * Detect order execution type from Bybit execution data
   * Returns structured execution result with type and counter information
   *
   * @param execData - Order execution data from Bybit WebSocket
   * @returns OrderExecutionResult with detected type and metadata
   */
  public detectExecution(execData: OrderExecutionData): OrderExecutionResult {
    const closedSize = parseFloat(execData.closedSize ?? '0');

    // Log all executions for debugging
    this.logger.debug('Processing execution event', {
      orderId: execData.orderId,
      symbol: execData.symbol,
      execType: execData.execType,
      stopOrderType: execData.stopOrderType,
      orderType: execData.orderType,
      createType: execData.createType,
      execPrice: execData.execPrice,
      execQty: execData.execQty,
      closedSize: execData.closedSize,
    });

    // Detect Take Profit:
    // - stopOrderType="PartialTakeProfit" (Bybit sends this for TP fills), OR
    // - stopOrderType="UNKNOWN" + createType="CreateByUser" (legacy/fallback detection)
    const isTakeProfit =
      execData.stopOrderType === 'PartialTakeProfit' ||
      (execData.stopOrderType === 'UNKNOWN' &&
        execData.createType === 'CreateByUser' &&
        closedSize > 0);

    // Detect Stop Loss: stopOrderType="StopLoss", "Stop", or "PartialStopLoss" (Bybit uses multiple formats)
    const isStopLoss =
      execData.stopOrderType === 'StopLoss' ||
      execData.stopOrderType === 'Stop' ||
      execData.stopOrderType === 'PartialStopLoss';

    // Detect Trailing Stop: stopOrderType="TrailingStop"
    const isTrailingStop = execData.stopOrderType === 'TrailingStop';

    // Determine execution type and update state
    let executionType: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'ENTRY' | 'UNKNOWN';
    let tpLevel: number | undefined;

    if (isTakeProfit) {
      executionType = 'TAKE_PROFIT';
      this.tpCounter++;
      tpLevel = this.tpCounter;
      this.lastCloseReason = 'TP';

      this.logger.info(`🎯 TP${this.tpCounter} execution detected from WebSocket`, {
        tpLevel: this.tpCounter,
        orderId: execData.orderId,
        execPrice: execData.execPrice,
        execQty: execData.execQty,
        closedSize: execData.closedSize,
      });
    } else if (isStopLoss) {
      executionType = 'STOP_LOSS';
      this.logger.info('🛑 Stop Loss execution detected from WebSocket', {
        orderId: execData.orderId,
        execPrice: execData.execPrice,
        execQty: execData.execQty,
      });

      // Reset TP counter on SL hit
      this.logger.debug('Stop Loss hit - resetting TP counter', { previousCounter: this.tpCounter });
      this.tpCounter = 0;
      this.lastCloseReason = 'SL';
    } else if (isTrailingStop) {
      executionType = 'TRAILING_STOP';
      this.logger.info('📉 Trailing Stop execution detected from WebSocket', {
        orderId: execData.orderId,
        execPrice: execData.execPrice,
        execQty: execData.execQty,
      });

      // Reset TP counter on Trailing Stop hit
      this.logger.debug('Trailing Stop hit - resetting TP counter', { previousCounter: this.tpCounter });
      this.tpCounter = 0;
      this.lastCloseReason = 'TRAILING';
    } else {
      // Regular order fill (market/limit entry)
      executionType = 'ENTRY';
      this.logger.debug('Position entry execution - resetting TP counter', { previousCounter: this.tpCounter });
      this.tpCounter = 0;
    }

    return {
      type: executionType,
      tpLevel,
      orderId: execData.orderId,
      symbol: execData.symbol ?? '',
      closedSize,
      execPrice: parseFloat(execData.execPrice ?? '0'),
      execQty: execData.execQty ?? '0',
      side: execData.side ?? '',
      closedSizeStr: execData.closedSize ?? '',
    };
  }

  /**
   * Get current TP counter (for TP1, TP2, TP3 tracking)
   * @returns Current TP level
   */
  public getTpCounter(): number {
    return this.tpCounter;
  }

  /**
   * Reset TP counter (call on position close or new entry)
   */
  public resetTpCounter(): void {
    this.tpCounter = 0;
    this.logger.debug('TP counter reset');
  }

  /**
   * Get last close reason for journal
   * @returns Close reason or null if no recent close
   */
  public getLastCloseReason(): 'SL' | 'TP' | 'TRAILING' | null {
    return this.lastCloseReason;
  }

  /**
   * Reset last close reason (call after journal entry)
   */
  public resetLastCloseReason(): void {
    this.lastCloseReason = null;
  }
}
