const EventEmitter = require('events');
const TradingViewWebhookReceiver = require('./tradingview/WebhookReceiver');
const PortfolioManager = require('./portfolio/PortfolioManager');
const QuantfuryManager = require('./quantfury/QuantfuryManager');
const EMACrossoverStrategy = require('./strategies/EMACrossoverStrategy');
const GoldScalpingStrategy = require('./strategies/GoldScalpingStrategy');
const ForexMomentumStrategy = require('./strategies/ForexMomentumStrategy');

class TradingManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Initialize components
        this.webhookReceiver = new TradingViewWebhookReceiver(config.webhook);
        this.portfolioManager = new PortfolioManager(config.portfolio);
        this.quantfuryManager = new QuantfuryManager(config.quantfury || {});
        
        // Initialize strategies
        this.strategies = new Map();
        this.loadStrategies(config.strategies);
        
        // Trading state
        this.isActive = false;
        this.paperTrading = config.paperTrading !== false; // Default to paper trading
        this.exchangeConnections = new Map();
        
        // Signal processing
        this.signalQueue = [];
        this.processing = false;
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // TradingView webhook signals
        this.webhookReceiver.on('buySignal', (signal) => {
            this.queueSignal({ ...signal, type: 'buy' });
        });

        this.webhookReceiver.on('sellSignal', (signal) => {
            this.queueSignal({ ...signal, type: 'sell' });
        });

        this.webhookReceiver.on('closeSignal', (signal) => {
            this.queueSignal({ ...signal, type: 'close' });
        });

        // Portfolio events
        this.portfolioManager.on('positionOpened', (position) => {
            this.emit('positionOpened', position);
            console.log(`✅ Position opened: ${position.symbol} ${position.side} @ ${position.entryPrice}`);
        });

        // Quantfury events
        this.quantfuryManager.on('quantfuryAlert', (alert) => {
            this.emit('quantfuryAlert', alert);
            console.log(`🎯 Quantfury alert: ${alert.instrument} ${alert.action}`);
        });

        this.quantfuryManager.on('telegramNotification', (notification) => {
            this.emit('telegramNotification', notification);
        });

        this.portfolioManager.on('positionClosed', (trade) => {
            this.emit('positionClosed', trade);
            const pnlSymbol = trade.realizedPnL > 0 ? '🟢' : '🔴';
            console.log(`${pnlSymbol} Position closed: ${trade.symbol} ${trade.side} PnL: ${trade.realizedPnL.toFixed(2)}`);
        });

        this.portfolioManager.on('positionRejected', (rejection) => {
            console.log(`❌ Position rejected for ${rejection.symbol}:`, rejection.checks);
            this.emit('positionRejected', rejection);
        });

        // Start signal processing
        this.processSignalQueue();
    }

    loadStrategies(strategiesConfig = []) {
        // Load default strategies optimized for Quantfury
        const defaultStrategies = [
            new GoldScalpingStrategy({ 
                enabled: true,
                symbols: ['XAUUSD'],
                timeframes: ['5m', '15m']
            }),
            new ForexMomentumStrategy({ 
                enabled: true,
                symbols: ['EURUSD', 'GBPUSD', 'USDJPY'],
                timeframes: ['15m', '1h']
            }),
            new EMACrossoverStrategy({ 
                enabled: true,
                symbols: ['BTCUSD', 'ETHUSD'],
                timeframes: ['1h', '4h']
            })
        ];

        for (const strategy of defaultStrategies) {
            this.strategies.set(strategy.getName(), strategy);
        }

        // Load custom strategies from config
        for (const strategyConfig of strategiesConfig) {
            this.loadStrategy(strategyConfig);
        }

        console.log(`📊 Loaded ${this.strategies.size} trading strategies`);
    }

    loadStrategy(config) {
        // Factory pattern for strategy loading
        const StrategyClass = this.getStrategyClass(config.type);
        if (StrategyClass) {
            const strategy = new StrategyClass(config);
            this.strategies.set(strategy.getName(), strategy);
        }
    }

    getStrategyClass(type) {
        const strategyMap = {
            'EMA_CROSSOVER': EMACrossoverStrategy,
            'GOLD_SCALPING': GoldScalpingStrategy,
            'FOREX_MOMENTUM': ForexMomentumStrategy
        };
        return strategyMap[type];
    }

    async start() {
        try {
            // Start webhook receiver
            await this.webhookReceiver.start();
            
            // Initialize exchange connections if not paper trading
            if (!this.paperTrading) {
                await this.initializeExchanges();
            }
            
            this.isActive = true;
            console.log(`🚀 Trading Manager started (${this.paperTrading ? 'Paper Trading' : 'Live Trading'})`);
            
            this.emit('started');
            return true;
            
        } catch (error) {
            console.error('Failed to start Trading Manager:', error);
            throw error;
        }
    }

    async stop() {
        this.isActive = false;
        
        // Stop webhook receiver
        await this.webhookReceiver.stop();
        
        // Close all positions if live trading
        if (!this.paperTrading) {
            await this.closeAllPositions('system_shutdown');
        }
        
        console.log('🛑 Trading Manager stopped');
        this.emit('stopped');
    }

    queueSignal(signal) {
        if (!this.isActive) {
            console.log('⏸️ Trading Manager inactive, signal ignored');
            return;
        }

        this.signalQueue.push({
            ...signal,
            queuedAt: Date.now()
        });

        this.emit('signalQueued', signal);
    }

    async processSignalQueue() {
        if (this.processing) return;
        
        setInterval(async () => {
            if (this.signalQueue.length === 0 || !this.isActive) return;
            
            this.processing = true;
            
            try {
                while (this.signalQueue.length > 0) {
                    const signal = this.signalQueue.shift();
                    await this.processSignal(signal);
                }
            } catch (error) {
                console.error('Signal processing error:', error);
            }
            
            this.processing = false;
        }, 1000); // Process every second
    }

    async processSignal(signal) {
        console.log(`📡 Processing ${signal.type} signal for ${signal.symbol}`);
        
        try {
            switch (signal.type) {
                case 'buy':
                case 'long':
                    await this.processBuySignal(signal);
                    break;
                case 'sell':
                case 'short':
                    await this.processSellSignal(signal);
                    break;
                case 'close':
                case 'exit':
                    await this.processCloseSignal(signal);
                    break;
                default:
                    console.warn('Unknown signal type:', signal.type);
            }
        } catch (error) {
            console.error(`Error processing ${signal.type} signal:`, error);
            this.emit('signalError', { signal, error });
        }
    }

    async processBuySignal(signal) {
        // Validate signal
        if (!this.validateSignal(signal)) {
            console.log('❌ Invalid buy signal for', signal.symbol);
            return;
        }

        // Procesar para Quantfury
        const quantfuryAlert = await this.quantfuryManager.processQuantfurySignal({
            ...signal,
            side: 'long',
            action: 'long'
        });

        if (quantfuryAlert) {
            console.log(`🎯 Quantfury buy alert generated: ${quantfuryAlert.id}`);
        }

        // También mantener el portfolio virtual
        const positionSignal = {
            symbol: signal.symbol,
            side: 'long',
            price: signal.price || await this.getCurrentPrice(signal.symbol),
            stopLoss: signal.stopLoss || this.calculateDefaultStopLoss(signal.price, 'long'),
            takeProfit: signal.takeProfit || this.calculateDefaultTakeProfit(signal.price, signal.stopLoss, 'long'),
            strategy: signal.strategy || 'TradingView',
            confidence: signal.metadata?.confidence || 0.7,
            source: 'tradingview_webhook'
        };

        // Portfolio virtual tracking
        if (this.portfolioManager.canOpenPosition(positionSignal.symbol, positionSignal.strategy, positionSignal.price)) {
            const position = this.portfolioManager.openPosition(positionSignal);
            console.log(`📊 Virtual position opened: ${position.symbol} ${position.side}`);
        }
    }

    async processSellSignal(signal) {
        // Validate signal
        if (!this.validateSignal(signal)) {
            console.log('❌ Invalid sell signal for', signal.symbol);
            return;
        }

        // Procesar para Quantfury
        const quantfuryAlert = await this.quantfuryManager.processQuantfurySignal({
            ...signal,
            side: 'short',
            action: 'short'
        });

        if (quantfuryAlert) {
            console.log(`🎯 Quantfury sell alert generated: ${quantfuryAlert.id}`);
        }

        // Portfolio virtual tracking
        const positionSignal = {
            symbol: signal.symbol,
            side: 'short',
            price: signal.price || await this.getCurrentPrice(signal.symbol),
            stopLoss: signal.stopLoss || this.calculateDefaultStopLoss(signal.price, 'short'),
            takeProfit: signal.takeProfit || this.calculateDefaultTakeProfit(signal.price, signal.stopLoss, 'short'),
            strategy: signal.strategy || 'TradingView',
            confidence: signal.metadata?.confidence || 0.7,
            source: 'tradingview_webhook'
        };

        if (this.portfolioManager.canOpenPosition(positionSignal.symbol, positionSignal.strategy, positionSignal.price)) {
            const position = this.portfolioManager.openPosition(positionSignal);
            console.log(`📊 Virtual position opened: ${position.symbol} ${position.side}`);
        }
    }

    async processCloseSignal(signal) {
        // Close specific position or all positions for symbol
        const positions = Array.from(this.portfolioManager.positions.values())
            .filter(pos => pos.symbol === signal.symbol);

        for (const position of positions) {
            const closePrice = signal.price || await this.getCurrentPrice(signal.symbol);
            this.portfolioManager.closePosition(position.id, closePrice, 'manual_close');
            
            if (!this.paperTrading) {
                await this.executeRealClose(position, closePrice);
            }
        }
    }

    validateSignal(signal) {
        // Basic signal validation
        if (!signal.symbol || !signal.action) return false;
        
        // Check if symbol is supported
        const supportedSymbols = this.getSupportedSymbols();
        if (!supportedSymbols.includes(signal.symbol)) {
            console.warn(`Unsupported symbol: ${signal.symbol}`);
            return false;
        }

        return true;
    }

    getSupportedSymbols() {
        // Get all symbols from enabled strategies
        const symbols = new Set();
        for (const strategy of this.strategies.values()) {
            if (strategy.isEnabled()) {
                strategy.getSymbols().forEach(symbol => symbols.add(symbol));
            }
        }
        return Array.from(symbols);
    }

    async getCurrentPrice(symbol) {
        // In paper trading, simulate price
        if (this.paperTrading) {
            return this.simulateCurrentPrice(symbol);
        }
        
        // Get real price from exchange
        return await this.getRealCurrentPrice(symbol);
    }

    simulateCurrentPrice(symbol) {
        // Simple price simulation for demo
        const basePrices = {
            'BTC/USDT': 45000,
            'ETH/USDT': 3000,
            'ADA/USDT': 0.5,
            'DOT/USDT': 8.0
        };
        
        const basePrice = basePrices[symbol] || 100;
        const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
        return basePrice * (1 + variation);
    }

    async getRealCurrentPrice(symbol) {
        // Implementation for real exchange price fetching
        // This would use your exchange API
        throw new Error('Real price fetching not implemented yet');
    }

    calculateDefaultStopLoss(price, side, riskPercent = 0.02) {
        return side === 'long' 
            ? price * (1 - riskPercent)
            : price * (1 + riskPercent);
    }

    calculateDefaultTakeProfit(price, stopLoss, side, riskRewardRatio = 2.5) {
        const risk = Math.abs(price - stopLoss);
        const reward = risk * riskRewardRatio;
        
        return side === 'long'
            ? price + reward
            : price - reward;
    }

    async executeRealTrade(position) {
        // Implementation for real trade execution
        console.log('🔄 Executing real trade:', position);
        // This would connect to your exchange API
        throw new Error('Real trade execution not implemented yet');
    }

    async executeRealClose(position, closePrice) {
        // Implementation for real position closing
        console.log('🔄 Closing real position:', position);
        // This would connect to your exchange API
        throw new Error('Real position closing not implemented yet');
    }

    async initializeExchanges() {
        // Initialize exchange connections for live trading
        console.log('🔗 Initializing exchange connections...');
        // Implementation for exchange initialization
    }

    async closeAllPositions(reason = 'manual') {
        const positions = Array.from(this.portfolioManager.positions.values());
        
        for (const position of positions) {
            const closePrice = await this.getCurrentPrice(position.symbol);
            this.portfolioManager.closePosition(position.id, closePrice, reason);
        }
        
        console.log(`🔄 Closed ${positions.length} positions (${reason})`);
    }

    // Status and control methods
    getStatus() {
        return {
            isActive: this.isActive,
            paperTrading: this.paperTrading,
            queuedSignals: this.signalQueue.length,
            activeStrategies: Array.from(this.strategies.values()).filter(s => s.isEnabled()).length,
            portfolio: this.portfolioManager.getPortfolioSummary(),
            webhook: this.webhookReceiver.getStats()
        };
    }

    togglePaperTrading() {
        this.paperTrading = !this.paperTrading;
        console.log(`💱 Trading mode: ${this.paperTrading ? 'Paper' : 'Live'}`);
        this.emit('tradingModeChanged', this.paperTrading);
    }

    enableStrategy(strategyName) {
        const strategy = this.strategies.get(strategyName);
        if (strategy) {
            strategy.setEnabled(true);
            console.log(`✅ Strategy enabled: ${strategyName}`);
        }
    }

    disableStrategy(strategyName) {
        const strategy = this.strategies.get(strategyName);
        if (strategy) {
            strategy.setEnabled(false);
            console.log(`⏸️ Strategy disabled: ${strategyName}`);
        }
    }
}

module.exports = TradingManager;