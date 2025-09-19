const EventEmitter = require('events');
const { EMA, RSI, MACD, BollingerBands } = require('technicalindicators');

class BaseStrategy extends EventEmitter {
    constructor(config = {}) {
        super();
        this.name = config.name || 'BaseStrategy';
        this.timeframes = config.timeframes || ['1h', '4h'];
        this.symbols = config.symbols || ['BTC/USDT'];
        this.riskLevel = config.riskLevel || 'medium'; // low, medium, high
        this.enabled = config.enabled !== false;
        
        // Performance tracking
        this.signals = [];
        this.performance = {
            totalSignals: 0,
            successfulSignals: 0,
            winRate: 0,
            avgReturn: 0,
            maxDrawdown: 0
        };
        
        // Strategy parameters (override in child classes)
        this.parameters = config.parameters || {};
    }

    // Abstract methods - must be implemented by child classes
    analyze(candleData, marketData = {}) {
        throw new Error('analyze method must be implemented by child class');
    }

    getName() {
        return this.name;
    }

    getTimeframes() {
        return this.timeframes;
    }

    getSymbols() {
        return this.symbols;
    }

    // Signal generation
    generateSignal(symbol, timeframe, analysis) {
        if (!this.enabled) return null;

        const signal = {
            id: this.generateSignalId(),
            strategy: this.name,
            symbol,
            timeframe,
            timestamp: new Date(),
            ...analysis
        };

        this.signals.push(signal);
        this.performance.totalSignals++;

        this.emit('signal', signal);
        return signal;
    }

    // Technical indicators helpers
    calculateEMA(prices, period) {
        return EMA.calculate({ period, values: prices });
    }

    calculateRSI(prices, period = 14) {
        return RSI.calculate({ period, values: prices });
    }

    calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
        return MACD.calculate({
            values: prices,
            fastPeriod: fast,
            slowPeriod: slow,
            signalPeriod: signal
        });
    }

    calculateBollingerBands(prices, period = 20, stdDev = 2) {
        return BollingerBands.calculate({
            period,
            values: prices,
            stdDev
        });
    }

    // Support/Resistance levels
    findSupportResistance(highs, lows, period = 20) {
        const levels = [];
        
        for (let i = period; i < highs.length - period; i++) {
            // Resistance level
            if (highs[i] === Math.max(...highs.slice(i - period, i + period))) {
                levels.push({ type: 'resistance', price: highs[i], strength: this.calculateLevelStrength(highs, highs[i]) });
            }
            
            // Support level
            if (lows[i] === Math.min(...lows.slice(i - period, i + period))) {
                levels.push({ type: 'support', price: lows[i], strength: this.calculateLevelStrength(lows, lows[i]) });
            }
        }
        
        return levels.sort((a, b) => b.strength - a.strength).slice(0, 5);
    }

    calculateLevelStrength(prices, level, tolerance = 0.01) {
        return prices.filter(price => 
            Math.abs(price - level) / level <= tolerance
        ).length;
    }

    // Risk management
    calculateStopLoss(entryPrice, side, atrValue = null, riskPercent = 0.02) {
        if (atrValue) {
            // ATR-based stop loss
            const atrMultiplier = 2.0;
            return side === 'long' 
                ? entryPrice - (atrValue * atrMultiplier)
                : entryPrice + (atrValue * atrMultiplier);
        } else {
            // Percentage-based stop loss
            return side === 'long'
                ? entryPrice * (1 - riskPercent)
                : entryPrice * (1 + riskPercent);
        }
    }

    calculateTakeProfit(entryPrice, stopLoss, side, riskRewardRatio = 2.5) {
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = risk * riskRewardRatio;
        
        return side === 'long'
            ? entryPrice + reward
            : entryPrice - reward;
    }

    // Volume analysis
    analyzeVolume(volumes, prices, period = 20) {
        const avgVolume = volumes.slice(-period).reduce((sum, vol) => sum + vol, 0) / period;
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;
        
        const priceChange = (prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2];
        
        return {
            volumeRatio,
            isHighVolume: volumeRatio > 1.5,
            isVolumeConfirming: (priceChange > 0 && volumeRatio > 1.2) || (priceChange < 0 && volumeRatio > 1.2),
            avgVolume,
            currentVolume
        };
    }

    // Trend analysis
    identifyTrend(prices, period = 20) {
        const sma = prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
        const currentPrice = prices[prices.length - 1];
        const previousSMA = prices.slice(-period - 1, -1).reduce((sum, price) => sum + price, 0) / period;
        
        let trend = 'sideways';
        let strength = 0;
        
        if (currentPrice > sma && sma > previousSMA) {
            trend = 'uptrend';
            strength = (currentPrice - sma) / sma;
        } else if (currentPrice < sma && sma < previousSMA) {
            trend = 'downtrend';
            strength = (sma - currentPrice) / sma;
        }
        
        return { trend, strength: Math.abs(strength) };
    }

    // Pattern recognition (simplified)
    detectPatterns(highs, lows, closes) {
        const patterns = [];
        
        // Hammer/Doji detection
        const lastCandle = {
            high: highs[highs.length - 1],
            low: lows[lows.length - 1],
            close: closes[closes.length - 1],
            open: closes[closes.length - 2] || closes[closes.length - 1]
        };
        
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const upperShadow = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
        const lowerShadow = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        const totalRange = lastCandle.high - lastCandle.low;
        
        if (body / totalRange < 0.1) {
            patterns.push('doji');
        }
        
        if (lowerShadow > body * 2 && upperShadow < body) {
            patterns.push('hammer');
        }
        
        return patterns;
    }

    // Performance tracking
    updatePerformance(signalId, outcome, pnl) {
        const signal = this.signals.find(s => s.id === signalId);
        if (!signal) return;
        
        signal.outcome = outcome;
        signal.pnl = pnl;
        
        if (outcome === 'win') {
            this.performance.successfulSignals++;
        }
        
        this.performance.winRate = this.performance.successfulSignals / this.performance.totalSignals;
        
        // Update average return
        const completedSignals = this.signals.filter(s => s.outcome);
        if (completedSignals.length > 0) {
            this.performance.avgReturn = completedSignals.reduce((sum, s) => sum + (s.pnl || 0), 0) / completedSignals.length;
        }
    }

    getPerformance() {
        return { ...this.performance };
    }

    // Utilities
    generateSignalId() {
        return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.emit('strategyToggled', { name: this.name, enabled });
    }

    getParameters() {
        return { ...this.parameters };
    }

    updateParameters(newParams) {
        this.parameters = { ...this.parameters, ...newParams };
        this.emit('parametersUpdated', { name: this.name, parameters: this.parameters });
    }
}

module.exports = BaseStrategy;