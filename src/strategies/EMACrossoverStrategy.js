const BaseStrategy = require('./BaseStrategy');

class EMACrossoverStrategy extends BaseStrategy {
    constructor(config = {}) {
        super({
            name: 'EMA_CROSSOVER',
            timeframes: config.timeframes || ['4h', '1d'],
            riskLevel: 'medium',
            ...config
        });
        
        // Strategy-specific parameters
        this.parameters = {
            emaShort: config.emaShort || 20,
            emaLong: config.emaLong || 50,
            volumeThreshold: config.volumeThreshold || 1.5,
            rsiConfirmation: config.rsiConfirmation !== false,
            minRiskReward: config.minRiskReward || 2.0,
            ...config.parameters
        };
    }

    analyze(candleData, marketData = {}) {
        try {
            const { highs, lows, closes, volumes, opens } = candleData;
            
            if (closes.length < this.parameters.emaLong + 10) {
                return null; // Not enough data
            }

            // Calculate EMAs
            const emaShort = this.calculateEMA(closes, this.parameters.emaShort);
            const emaLong = this.calculateEMA(closes, this.parameters.emaLong);
            
            if (emaShort.length < 2 || emaLong.length < 2) return null;

            // Get current and previous EMA values
            const currentShort = emaShort[emaShort.length - 1];
            const previousShort = emaShort[emaShort.length - 2];
            const currentLong = emaLong[emaLong.length - 1];
            const previousLong = emaLong[emaLong.length - 2];
            
            const currentPrice = closes[closes.length - 1];

            // Detect crossover
            const bullishCrossover = previousShort <= previousLong && currentShort > currentLong;
            const bearishCrossover = previousShort >= previousLong && currentShort < currentLong;

            if (!bullishCrossover && !bearishCrossover) {
                return null; // No crossover detected
            }

            // Additional confirmations
            const confirmations = this.getConfirmations(candleData, marketData);
            
            let signal = null;

            if (bullishCrossover && confirmations.bullish >= 2) {
                signal = this.createLongSignal(currentPrice, candleData, confirmations);
            } else if (bearishCrossover && confirmations.bearish >= 2) {
                signal = this.createShortSignal(currentPrice, candleData, confirmations);
            }

            return signal;

        } catch (error) {
            console.error(`EMA Crossover analysis error:`, error);
            return null;
        }
    }

    getConfirmations(candleData, marketData) {
        const { highs, lows, closes, volumes } = candleData;
        const confirmations = { bullish: 0, bearish: 0, details: {} };

        // 1. RSI confirmation
        if (this.parameters.rsiConfirmation) {
            const rsi = this.calculateRSI(closes);
            const currentRSI = rsi[rsi.length - 1];
            
            confirmations.details.rsi = currentRSI;
            
            if (currentRSI > 30 && currentRSI < 70) {
                if (currentRSI > 50) confirmations.bullish++;
                else confirmations.bearish++;
            }
        }

        // 2. Volume confirmation
        const volumeAnalysis = this.analyzeVolume(volumes, closes);
        confirmations.details.volume = volumeAnalysis;
        
        if (volumeAnalysis.isHighVolume) {
            confirmations.bullish++;
            confirmations.bearish++;
        }

        // 3. Trend confirmation
        const trendAnalysis = this.identifyTrend(closes);
        confirmations.details.trend = trendAnalysis;
        
        if (trendAnalysis.trend === 'uptrend' && trendAnalysis.strength > 0.02) {
            confirmations.bullish++;
        } else if (trendAnalysis.trend === 'downtrend' && trendAnalysis.strength > 0.02) {
            confirmations.bearish++;
        }

        // 4. MACD confirmation
        const macd = this.calculateMACD(closes);
        if (macd.length > 0) {
            const currentMACD = macd[macd.length - 1];
            confirmations.details.macd = currentMACD;
            
            if (currentMACD.MACD > currentMACD.signal) {
                confirmations.bullish++;
            } else {
                confirmations.bearish++;
            }
        }

        // 5. Support/Resistance levels
        const levels = this.findSupportResistance(highs, lows);
        const currentPrice = closes[closes.length - 1];
        const nearSupport = levels.some(level => 
            level.type === 'support' && 
            Math.abs(currentPrice - level.price) / currentPrice < 0.02
        );
        const nearResistance = levels.some(level => 
            level.type === 'resistance' && 
            Math.abs(currentPrice - level.price) / currentPrice < 0.02
        );

        confirmations.details.levels = { nearSupport, nearResistance, levels: levels.slice(0, 3) };

        if (nearSupport) confirmations.bullish++;
        if (nearResistance) confirmations.bearish++;

        // 6. Sentiment confirmation (if available)
        if (marketData.sentiment) {
            confirmations.details.sentiment = marketData.sentiment;
            
            if (marketData.sentiment.score > 0.6) {
                confirmations.bullish++;
            } else if (marketData.sentiment.score < 0.4) {
                confirmations.bearish++;
            }
        }

        return confirmations;
    }

    createLongSignal(currentPrice, candleData, confirmations) {
        const { highs, lows, closes } = candleData;
        
        // Calculate ATR for stop loss
        const atr = this.calculateATR(highs, lows, closes);
        const stopLoss = this.calculateStopLoss(currentPrice, 'long', atr);
        const takeProfit = this.calculateTakeProfit(currentPrice, stopLoss, 'long', this.parameters.minRiskReward);

        // Risk/Reward check
        const risk = Math.abs(currentPrice - stopLoss) / currentPrice;
        const reward = Math.abs(takeProfit - currentPrice) / currentPrice;
        const riskRewardRatio = reward / risk;

        if (riskRewardRatio < this.parameters.minRiskReward) {
            return null; // Risk/reward not favorable
        }

        return {
            side: 'long',
            price: currentPrice,
            stopLoss,
            takeProfit,
            confidence: this.calculateConfidence(confirmations),
            risk: risk,
            reward: reward,
            riskRewardRatio,
            confirmations: confirmations.details,
            metadata: {
                emaShort: this.parameters.emaShort,
                emaLong: this.parameters.emaLong,
                signalType: 'bullish_crossover'
            }
        };
    }

    createShortSignal(currentPrice, candleData, confirmations) {
        const { highs, lows, closes } = candleData;
        
        // Calculate ATR for stop loss
        const atr = this.calculateATR(highs, lows, closes);
        const stopLoss = this.calculateStopLoss(currentPrice, 'short', atr);
        const takeProfit = this.calculateTakeProfit(currentPrice, stopLoss, 'short', this.parameters.minRiskReward);

        // Risk/Reward check
        const risk = Math.abs(stopLoss - currentPrice) / currentPrice;
        const reward = Math.abs(currentPrice - takeProfit) / currentPrice;
        const riskRewardRatio = reward / risk;

        if (riskRewardRatio < this.parameters.minRiskReward) {
            return null; // Risk/reward not favorable
        }

        return {
            side: 'short',
            price: currentPrice,
            stopLoss,
            takeProfit,
            confidence: this.calculateConfidence(confirmations),
            risk: risk,
            reward: reward,
            riskRewardRatio,
            confirmations: confirmations.details,
            metadata: {
                emaShort: this.parameters.emaShort,
                emaLong: this.parameters.emaLong,
                signalType: 'bearish_crossover'
            }
        };
    }

    calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period + 1) return null;
        
        const trueRanges = [];
        for (let i = 1; i < highs.length; i++) {
            const tr1 = highs[i] - lows[i];
            const tr2 = Math.abs(highs[i] - closes[i - 1]);
            const tr3 = Math.abs(lows[i] - closes[i - 1]);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }
        
        // Simple average of true ranges (simplified ATR)
        const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
        return atr;
    }

    calculateConfidence(confirmations) {
        const maxConfirmations = 6; // Total possible confirmations
        const totalConfirmations = Math.max(confirmations.bullish, confirmations.bearish);
        const confidence = Math.min(totalConfirmations / maxConfirmations, 1.0);
        
        // Adjust confidence based on confirmation strength
        let adjustedConfidence = confidence;
        
        if (confirmations.details.volume?.isHighVolume) {
            adjustedConfidence += 0.1;
        }
        
        if (confirmations.details.trend?.strength > 0.05) {
            adjustedConfidence += 0.15;
        }
        
        if (confirmations.details.sentiment?.score > 0.7 || confirmations.details.sentiment?.score < 0.3) {
            adjustedConfidence += 0.1;
        }
        
        return Math.min(adjustedConfidence, 1.0);
    }

    // Strategy-specific optimization
    optimizeParameters(backtestResults) {
        // Simple parameter optimization based on backtest results
        const bestParams = { ...this.parameters };
        let bestReturn = backtestResults.totalReturn || 0;
        
        // Test different EMA periods
        const emaShortRange = [10, 15, 20, 25];
        const emaLongRange = [40, 50, 60, 70];
        
        for (const emaShort of emaShortRange) {
            for (const emaLong of emaLongRange) {
                if (emaShort >= emaLong) continue;
                
                const testParams = { ...this.parameters, emaShort, emaLong };
                // In a real implementation, you would run a backtest here
                const simulatedReturn = this.simulateParameterPerformance(testParams);
                
                if (simulatedReturn > bestReturn) {
                    bestReturn = simulatedReturn;
                    bestParams.emaShort = emaShort;
                    bestParams.emaLong = emaLong;
                }
            }
        }
        
        return bestParams;
    }

    simulateParameterPerformance(params) {
        // Simplified simulation - in reality, run full backtest
        const baseline = 0.05; // 5% baseline return
        const emaSpreadFactor = (params.emaLong - params.emaShort) / params.emaLong;
        const optimizedReturn = baseline + (emaSpreadFactor * 0.1);
        
        return optimizedReturn + (Math.random() - 0.5) * 0.02; // Add some randomness
    }

    getStrategyDescription() {
        return `EMA Crossover strategy using ${this.parameters.emaShort}/${this.parameters.emaLong} periods with multiple confirmations including RSI, volume, trend, and MACD analysis.`;
    }
}

module.exports = EMACrossoverStrategy;