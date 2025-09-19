const BaseStrategy = require('./BaseStrategy');

class GoldScalpingStrategy extends BaseStrategy {
    constructor(config = {}) {
        super({
            name: 'GOLD_SCALPING',
            timeframes: config.timeframes || ['5m', '15m'],
            symbols: ['XAUUSD'], // Oro - muy volátil en Quantfury
            riskLevel: 'high',
            ...config
        });
        
        // Parámetros específicos para oro
        this.parameters = {
            // EMAs para tendencia
            emaFast: 8,
            emaSlow: 21,
            
            // RSI para momentum
            rsiPeriod: 14,
            rsiOverbought: 75,
            rsiOversold: 25,
            
            // Bollinger Bands para volatilidad
            bbPeriod: 20,
            bbDeviation: 2,
            
            // Volume confirmación
            volumeThreshold: 1.3,
            
            // Risk management específico para oro
            maxDailyTrades: 5,
            scalingLevels: 3,
            
            // Horarios de trading (Londres + NY)
            activeHours: {
                start: 8, // 8 AM GMT (Londres)
                end: 17   // 5 PM GMT (NY close)
            },
            
            // News filter
            avoidNewsMinutes: 30, // Evitar trades 30min antes/después de noticias
            
            ...config.parameters
        };
        
        this.dailyTrades = 0;
        this.lastTradeTime = 0;
        this.newsEvents = new Map();
    }

    analyze(candleData, marketData = {}) {
        try {
            const { highs, lows, closes, volumes, opens } = candleData;
            
            if (closes.length < Math.max(this.parameters.emaSlow, this.parameters.bbPeriod) + 5) {
                return null;
            }

            // Verificar horarios de trading
            if (!this.isActiveHour()) {
                return null;
            }

            // Verificar límite de trades diarios
            if (this.dailyTrades >= this.parameters.maxDailyTrades) {
                return null;
            }

            // Verificar filtro de noticias
            if (this.isNewsTime()) {
                return null;
            }

            // Calcular indicadores
            const indicators = this.calculateIndicators(candleData);
            
            // Detectar configuración de scalping
            const scalpingSignal = this.detectScalpingOpportunity(indicators, marketData);
            
            if (scalpingSignal) {
                return this.createScalpingSignal(scalpingSignal, indicators);
            }

            return null;

        } catch (error) {
            console.error(`Gold Scalping analysis error:`, error);
            return null;
        }
    }

    calculateIndicators(candleData) {
        const { highs, lows, closes, volumes } = candleData;
        
        // EMAs
        const emaFast = this.calculateEMA(closes, this.parameters.emaFast);
        const emaSlow = this.calculateEMA(closes, this.parameters.emaSlow);
        
        // RSI
        const rsi = this.calculateRSI(closes, this.parameters.rsiPeriod);
        
        // Bollinger Bands
        const bb = this.calculateBollingerBands(closes, this.parameters.bbPeriod, this.parameters.bbDeviation);
        
        // Volume análisis
        const volumeAnalysis = this.analyzeVolume(volumes, closes, 10);
        
        // Volatilidad (ATR)
        const atr = this.calculateATR(highs, lows, closes, 14);
        
        // Support/Resistance
        const levels = this.findSupportResistance(highs, lows, 10);
        
        return {
            emaFast: emaFast[emaFast.length - 1],
            emaFastPrev: emaFast[emaFast.length - 2],
            emaSlow: emaSlow[emaSlow.length - 1],
            emaSlowPrev: emaSlow[emaSlow.length - 2],
            rsi: rsi[rsi.length - 1],
            rsiPrev: rsi[rsi.length - 2],
            bbUpper: bb[bb.length - 1]?.upper,
            bbMiddle: bb[bb.length - 1]?.middle,
            bbLower: bb[bb.length - 1]?.lower,
            volume: volumeAnalysis,
            atr: atr,
            levels: levels,
            currentPrice: closes[closes.length - 1],
            previousPrice: closes[closes.length - 2]
        };
    }

    detectScalpingOpportunity(indicators, marketData) {
        const signals = [];
        
        // 1. EMA Bounce Strategy (LONG)
        if (indicators.currentPrice > indicators.emaFast && 
            indicators.currentPrice > indicators.emaSlow &&
            indicators.emaFast > indicators.emaSlow &&
            indicators.rsi > 30 && indicators.rsi < 70 &&
            indicators.currentPrice > indicators.bbLower &&
            indicators.volume.isHighVolume) {
            
            signals.push({
                type: 'ema_bounce_long',
                side: 'long',
                strength: this.calculateSignalStrength('ema_bounce_long', indicators),
                reasoning: 'Price bouncing from EMA support with volume confirmation'
            });
        }
        
        // 2. EMA Bounce Strategy (SHORT)
        if (indicators.currentPrice < indicators.emaFast && 
            indicators.currentPrice < indicators.emaSlow &&
            indicators.emaFast < indicators.emaSlow &&
            indicators.rsi > 30 && indicators.rsi < 70 &&
            indicators.currentPrice < indicators.bbUpper &&
            indicators.volume.isHighVolume) {
            
            signals.push({
                type: 'ema_bounce_short',
                side: 'short',
                strength: this.calculateSignalStrength('ema_bounce_short', indicators),
                reasoning: 'Price rejecting from EMA resistance with volume confirmation'
            });
        }
        
        // 3. Bollinger Band Squeeze Breakout (LONG)
        if (indicators.currentPrice > indicators.bbUpper &&
            indicators.previousPrice <= indicators.bbUpper &&
            indicators.rsi < 80 &&
            indicators.emaFast > indicators.emaSlow &&
            indicators.volume.volumeRatio > 1.5) {
            
            signals.push({
                type: 'bb_breakout_long',
                side: 'long',
                strength: this.calculateSignalStrength('bb_breakout_long', indicators),
                reasoning: 'Bollinger Band upper breakout with momentum'
            });
        }
        
        // 4. Bollinger Band Squeeze Breakout (SHORT)
        if (indicators.currentPrice < indicators.bbLower &&
            indicators.previousPrice >= indicators.bbLower &&
            indicators.rsi > 20 &&
            indicators.emaFast < indicators.emaSlow &&
            indicators.volume.volumeRatio > 1.5) {
            
            signals.push({
                type: 'bb_breakout_short',
                side: 'short',
                strength: this.calculateSignalStrength('bb_breakout_short', indicators),
                reasoning: 'Bollinger Band lower breakout with momentum'
            });
        }
        
        // 5. RSI Divergence + Support/Resistance
        const srLevel = this.findNearestSupportResistance(indicators.currentPrice, indicators.levels);
        if (srLevel) {
            // Long en soporte
            if (srLevel.type === 'support' && 
                Math.abs(indicators.currentPrice - srLevel.price) / indicators.currentPrice < 0.001 &&
                indicators.rsi < 35 && indicators.rsiPrev > indicators.rsi) {
                
                signals.push({
                    type: 'sr_rsi_long',
                    side: 'long',
                    strength: this.calculateSignalStrength('sr_rsi_long', indicators),
                    reasoning: `RSI oversold bounce from support at ${srLevel.price}`
                });
            }
            
            // Short en resistencia
            if (srLevel.type === 'resistance' && 
                Math.abs(indicators.currentPrice - srLevel.price) / indicators.currentPrice < 0.001 &&
                indicators.rsi > 65 && indicators.rsiPrev < indicators.rsi) {
                
                signals.push({
                    type: 'sr_rsi_short',
                    side: 'short',
                    strength: this.calculateSignalStrength('sr_rsi_short', indicators),
                    reasoning: `RSI overbought rejection from resistance at ${srLevel.price}`
                });
            }
        }
        
        // Seleccionar la mejor señal
        if (signals.length > 0) {
            return signals.reduce((best, current) => 
                current.strength > best.strength ? current : best
            );
        }
        
        return null;
    }

    calculateSignalStrength(signalType, indicators) {
        let strength = 5; // Base strength
        
        // Volume confirmation
        if (indicators.volume.isHighVolume) strength += 1;
        if (indicators.volume.volumeRatio > 2) strength += 1;
        
        // Momentum confirmation
        if (signalType.includes('long')) {
            if (indicators.emaFast > indicators.emaFastPrev) strength += 1;
            if (indicators.rsi > indicators.rsiPrev && indicators.rsi > 50) strength += 1;
        } else if (signalType.includes('short')) {
            if (indicators.emaFast < indicators.emaFastPrev) strength += 1;
            if (indicators.rsi < indicators.rsiPrev && indicators.rsi < 50) strength += 1;
        }
        
        // Volatilidad optimal para scalping (ATR entre 0.5 y 2.0 para oro)
        if (indicators.atr >= 0.5 && indicators.atr <= 2.0) strength += 1;
        
        // Penalizar si está muy cerca de niveles peligrosos
        if (indicators.rsi > 80 || indicators.rsi < 20) strength -= 2;
        
        return Math.max(1, Math.min(10, strength));
    }

    createScalpingSignal(scalpingSignal, indicators) {
        const currentPrice = indicators.currentPrice;
        const atr = indicators.atr;
        
        // Scalping targets más agresivos
        let stopLossDistance, takeProfitDistance;
        
        if (scalpingSignal.type.includes('bb_breakout')) {
            // Breakouts: targets más amplios
            stopLossDistance = atr * 1.5;
            takeProfitDistance = atr * 3.0;
        } else if (scalpingSignal.type.includes('sr_rsi')) {
            // Support/Resistance: targets más conservadores
            stopLossDistance = atr * 1.0;
            takeProfitDistance = atr * 2.0;
        } else {
            // EMA bounces: targets medios
            stopLossDistance = atr * 1.2;
            takeProfitDistance = atr * 2.5;
        }
        
        const stopLoss = scalpingSignal.side === 'long'
            ? currentPrice - stopLossDistance
            : currentPrice + stopLossDistance;
            
        const takeProfit = scalpingSignal.side === 'long'
            ? currentPrice + takeProfitDistance
            : currentPrice - takeProfitDistance;
        
        // Risk/Reward check
        const risk = Math.abs(currentPrice - stopLoss) / currentPrice;
        const reward = Math.abs(takeProfit - currentPrice) / currentPrice;
        const riskRewardRatio = reward / risk;
        
        if (riskRewardRatio < 1.5) {
            return null; // Scalping necesita mínimo 1.5:1
        }
        
        // Incrementar contador de trades diarios
        this.dailyTrades++;
        this.lastTradeTime = Date.now();
        
        return {
            side: scalpingSignal.side,
            price: currentPrice,
            stopLoss,
            takeProfit,
            confidence: scalpingSignal.strength / 10,
            risk: risk,
            reward: reward,
            riskRewardRatio,
            reasoning: scalpingSignal.reasoning,
            strategy: scalpingSignal.type,
            timeframe: this.timeframes[0],
            metadata: {
                atr: atr,
                rsi: indicators.rsi,
                emaStatus: indicators.emaFast > indicators.emaSlow ? 'bullish' : 'bearish',
                volumeRatio: indicators.volume.volumeRatio,
                tradingSession: this.getCurrentSession(),
                dailyTradeCount: this.dailyTrades,
                
                // Específico para Quantfury
                leverage: 20, // Oro permite 20x en Quantfury
                instrument: 'XAUUSD',
                spread: 0.5,
                
                // Gestión avanzada
                scalingLevels: this.generateScalingLevels(currentPrice, scalpingSignal.side, atr),
                partialExitLevels: this.generatePartialExits(currentPrice, takeProfit, scalpingSignal.side)
            }
        };
    }

    generateScalingLevels(entryPrice, side, atr) {
        const levels = [];
        const direction = side === 'long' ? -1 : 1;
        
        for (let i = 1; i <= this.parameters.scalingLevels; i++) {
            const distance = (atr * 0.5 * i) * direction;
            levels.push({
                level: i,
                price: entryPrice + distance,
                size: 1 / this.parameters.scalingLevels // Dividir tamaño inicial
            });
        }
        
        return levels;
    }

    generatePartialExits(entryPrice, finalTarget, side) {
        const exits = [];
        const totalDistance = Math.abs(finalTarget - entryPrice);
        
        // 33% a 1/3 del camino
        const exit1 = side === 'long' 
            ? entryPrice + (totalDistance * 0.33)
            : entryPrice - (totalDistance * 0.33);
        exits.push({ percentage: 33, price: exit1 });
        
        // 50% a 2/3 del camino
        const exit2 = side === 'long' 
            ? entryPrice + (totalDistance * 0.66)
            : entryPrice - (totalDistance * 0.66);
        exits.push({ percentage: 50, price: exit2 });
        
        // 17% restante al target final
        exits.push({ percentage: 17, price: finalTarget });
        
        return exits;
    }

    findNearestSupportResistance(price, levels) {
        let nearest = null;
        let minDistance = Infinity;
        
        for (const level of levels) {
            const distance = Math.abs(price - level.price);
            const percentDistance = distance / price;
            
            // Solo considerar niveles muy cercanos (dentro del 0.1%)
            if (percentDistance < 0.001 && distance < minDistance) {
                minDistance = distance;
                nearest = level;
            }
        }
        
        return nearest;
    }

    calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period + 1) return 0.5; // Default para oro
        
        const trueRanges = [];
        for (let i = 1; i < highs.length; i++) {
            const tr1 = highs[i] - lows[i];
            const tr2 = Math.abs(highs[i] - closes[i - 1]);
            const tr3 = Math.abs(lows[i] - closes[i - 1]);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }
        
        const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
        return atr;
    }

    isActiveHour() {
        const now = new Date();
        const hour = now.getUTCHours();
        return hour >= this.parameters.activeHours.start && hour <= this.parameters.activeHours.end;
    }

    getCurrentSession() {
        const hour = new Date().getUTCHours();
        if (hour >= 8 && hour < 12) return 'london_morning';
        if (hour >= 12 && hour < 16) return 'london_afternoon';
        if (hour >= 16 && hour < 20) return 'ny_session';
        return 'asian_session';
    }

    isNewsTime() {
        // Implementar filtro de noticias básico
        const now = Date.now();
        
        // Evitar trades si hay noticias recientes conocidas
        for (const [eventTime, importance] of this.newsEvents) {
            const timeDiff = Math.abs(now - eventTime);
            const avoidWindow = this.parameters.avoidNewsMinutes * 60 * 1000;
            
            if (timeDiff < avoidWindow && importance >= 8) {
                return true;
            }
        }
        
        return false;
    }

    addNewsEvent(timestamp, importance, description) {
        this.newsEvents.set(timestamp, importance);
        
        // Limpiar eventos antiguos (más de 24 horas)
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        for (const [eventTime] of this.newsEvents) {
            if (eventTime < dayAgo) {
                this.newsEvents.delete(eventTime);
            }
        }
    }

    resetDailyCounters() {
        this.dailyTrades = 0;
        console.log('🔄 Daily trade counters reset');
    }

    getStrategyStats() {
        return {
            dailyTrades: this.dailyTrades,
            maxDailyTrades: this.parameters.maxDailyTrades,
            lastTradeTime: this.lastTradeTime,
            activeSession: this.getCurrentSession(),
            newsEvents: this.newsEvents.size,
            ...this.getPerformance()
        };
    }

    getStrategyDescription() {
        return `Gold Scalping strategy optimized for Quantfury. Trades XAUUSD during London/NY sessions using EMA bounces, Bollinger Band breakouts, and RSI divergence. Max ${this.parameters.maxDailyTrades} trades/day with 20x leverage.`;
    }
}

module.exports = GoldScalpingStrategy;