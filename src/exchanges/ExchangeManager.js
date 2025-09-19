const ccxt = require('ccxt');
const EventEmitter = require('events');

class ExchangeManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.exchanges = new Map();
        this.config = config;
        this.activeExchange = null;
        
        // Exchange configurations
        this.exchangeConfigs = {
            binance: {
                id: 'binance',
                name: 'Binance',
                fees: { trading: { taker: 0.001, maker: 0.001 } },
                minOrderSize: { BTC: 0.00001, ETH: 0.0001, USDT: 10 }
            },
            bybit: {
                id: 'bybit',
                name: 'Bybit',
                fees: { trading: { taker: 0.0006, maker: 0.0001 } },
                minOrderSize: { BTC: 0.00001, ETH: 0.0001, USDT: 1 }
            }
        };
        
        this.orderHistory = [];
        this.balances = {};
        this.openOrders = new Map();
    }

    async initialize() {
        try {
            console.log('🔗 Initializing Exchange Manager...');
            
            // Initialize Binance
            if (this.config.binance?.apiKey && this.config.binance?.secret) {
                await this.initializeBinance();
            }
            
            // Initialize Bybit
            if (this.config.bybit?.apiKey && this.config.bybit?.secret) {
                await this.initializeBybit();
            }
            
            // Set primary exchange
            this.setPrimaryExchange();
            
            // Start balance monitoring
            this.startBalanceMonitoring();
            
            console.log(`✅ Exchange Manager initialized with ${this.exchanges.size} exchanges`);
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize Exchange Manager:', error);
            throw error;
        }
    }

    async initializeBinance() {
        try {
            const binance = new ccxt.binance({
                apiKey: this.config.binance.apiKey,
                secret: this.config.binance.secret,
                sandbox: this.config.binance.testnet || false,
                enableRateLimit: true,
                options: {
                    defaultType: 'spot', // 'spot', 'margin', 'future'
                    recvWindow: 10000,
                }
            });

            // Test connection
            await binance.loadMarkets();
            const balance = await binance.fetchBalance();
            
            this.exchanges.set('binance', binance);
            console.log('✅ Binance initialized successfully');
            
            return binance;
            
        } catch (error) {
            console.error('❌ Binance initialization failed:', error.message);
            throw error;
        }
    }

    async initializeBybit() {
        try {
            const bybit = new ccxt.bybit({
                apiKey: this.config.bybit.apiKey,
                secret: this.config.bybit.secret,
                sandbox: this.config.bybit.testnet || false,
                enableRateLimit: true,
                options: {
                    defaultType: 'spot', // 'spot', 'linear', 'inverse'
                }
            });

            // Test connection
            await bybit.loadMarkets();
            const balance = await bybit.fetchBalance();
            
            this.exchanges.set('bybit', bybit);
            console.log('✅ Bybit initialized successfully');
            
            return bybit;
            
        } catch (error) {
            console.error('❌ Bybit initialization failed:', error.message);
            throw error;
        }
    }

    setPrimaryExchange() {
        // Set primary exchange based on availability and preference
        if (this.exchanges.has('binance')) {
            this.activeExchange = this.exchanges.get('binance');
            console.log('🎯 Primary exchange: Binance');
        } else if (this.exchanges.has('bybit')) {
            this.activeExchange = this.exchanges.get('bybit');
            console.log('🎯 Primary exchange: Bybit');
        } else {
            console.warn('⚠️ No exchanges available');
        }
    }

    // Order Execution
    async createMarketOrder(symbol, side, amount, params = {}) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            console.log(`📊 Creating ${side} market order: ${amount} ${symbol}`);

            // Validate order size
            if (!this.validateOrderSize(symbol, amount)) {
                throw new Error(`Order size ${amount} below minimum for ${symbol}`);
            }

            // Execute order
            const order = await this.activeExchange.createMarketOrder(symbol, side, amount, undefined, {
                ...params,
                timestamp: Date.now()
            });

            // Store order
            this.openOrders.set(order.id, {
                ...order,
                exchange: this.activeExchange.id,
                timestamp: Date.now(),
                status: 'pending'
            });

            this.orderHistory.push(order);
            
            console.log(`✅ Order created: ${order.id}`);
            this.emit('orderCreated', order);
            
            return order;
            
        } catch (error) {
            console.error('❌ Market order failed:', error.message);
            this.emit('orderError', { error, symbol, side, amount });
            throw error;
        }
    }

    async createLimitOrder(symbol, side, amount, price, params = {}) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            console.log(`📊 Creating ${side} limit order: ${amount} ${symbol} @ ${price}`);

            // Validate order
            if (!this.validateOrderSize(symbol, amount)) {
                throw new Error(`Order size ${amount} below minimum for ${symbol}`);
            }

            // Execute order
            const order = await this.activeExchange.createLimitOrder(symbol, side, amount, price, {
                ...params,
                timestamp: Date.now()
            });

            // Store order
            this.openOrders.set(order.id, {
                ...order,
                exchange: this.activeExchange.id,
                timestamp: Date.now(),
                status: 'open'
            });

            this.orderHistory.push(order);
            
            console.log(`✅ Limit order created: ${order.id}`);
            this.emit('orderCreated', order);
            
            return order;
            
        } catch (error) {
            console.error('❌ Limit order failed:', error.message);
            this.emit('orderError', { error, symbol, side, amount, price });
            throw error;
        }
    }

    async createStopLossOrder(symbol, side, amount, stopPrice, params = {}) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            console.log(`🛑 Creating stop-loss: ${amount} ${symbol} @ ${stopPrice}`);

            const order = await this.activeExchange.createOrder(symbol, 'stop_market', side, amount, undefined, {
                stopPrice: stopPrice,
                ...params
            });

            this.openOrders.set(order.id, {
                ...order,
                exchange: this.activeExchange.id,
                timestamp: Date.now(),
                status: 'open',
                type: 'stop_loss'
            });

            console.log(`✅ Stop-loss created: ${order.id}`);
            this.emit('stopLossCreated', order);
            
            return order;
            
        } catch (error) {
            console.error('❌ Stop-loss order failed:', error.message);
            throw error;
        }
    }

    async cancelOrder(orderId, symbol) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            const order = await this.activeExchange.cancelOrder(orderId, symbol);
            this.openOrders.delete(orderId);
            
            console.log(`❌ Order cancelled: ${orderId}`);
            this.emit('orderCancelled', order);
            
            return order;
            
        } catch (error) {
            console.error('❌ Cancel order failed:', error.message);
            throw error;
        }
    }

    // Market Data
    async getCurrentPrice(symbol) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            const ticker = await this.activeExchange.fetchTicker(symbol);
            return ticker.last;
            
        } catch (error) {
            console.error(`❌ Failed to get price for ${symbol}:`, error.message);
            return null;
        }
    }

    async getOrderBook(symbol, limit = 10) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            return await this.activeExchange.fetchOrderBook(symbol, limit);
            
        } catch (error) {
            console.error(`❌ Failed to get order book for ${symbol}:`, error.message);
            return null;
        }
    }

    async getKlines(symbol, timeframe = '1h', limit = 100) {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            return await this.activeExchange.fetchOHLCV(symbol, timeframe, undefined, limit);
            
        } catch (error) {
            console.error(`❌ Failed to get klines for ${symbol}:`, error.message);
            return null;
        }
    }

    // Balance Management
    async updateBalances() {
        try {
            if (!this.activeExchange) {
                throw new Error('No active exchange configured');
            }

            const balance = await this.activeExchange.fetchBalance();
            this.balances = balance;
            
            this.emit('balanceUpdated', balance);
            return balance;
            
        } catch (error) {
            console.error('❌ Failed to update balances:', error.message);
            return null;
        }
    }

    getBalance(asset) {
        return this.balances[asset]?.free || 0;
    }

    getTotalBalance(asset) {
        return this.balances[asset]?.total || 0;
    }

    getUsedBalance(asset) {
        return this.balances[asset]?.used || 0;
    }

    // Order Monitoring
    async checkOpenOrders() {
        const updatedOrders = [];
        
        for (const [orderId, orderInfo] of this.openOrders) {
            try {
                const order = await this.activeExchange.fetchOrder(orderId, orderInfo.symbol);
                
                if (order.status === 'closed' || order.status === 'filled') {
                    this.openOrders.delete(orderId);
                    this.emit('orderFilled', order);
                    console.log(`✅ Order filled: ${orderId}`);
                } else if (order.status === 'canceled') {
                    this.openOrders.delete(orderId);
                    this.emit('orderCancelled', order);
                    console.log(`❌ Order cancelled: ${orderId}`);
                }
                
                updatedOrders.push(order);
                
            } catch (error) {
                console.error(`❌ Failed to check order ${orderId}:`, error.message);
            }
        }
        
        return updatedOrders;
    }

    startBalanceMonitoring() {
        // Update balances every 30 seconds
        setInterval(async () => {
            await this.updateBalances();
        }, 30000);

        // Check open orders every 10 seconds
        setInterval(async () => {
            await this.checkOpenOrders();
        }, 10000);
    }

    // Validation
    validateOrderSize(symbol, amount) {
        const baseAsset = symbol.split('/')[0];
        const config = this.exchangeConfigs[this.activeExchange.id];
        const minSize = config?.minOrderSize?.[baseAsset] || 0.00001;
        
        return amount >= minSize;
    }

    // Advanced Trading Functions
    async executeDCAOrder(symbol, side, totalAmount, levels = 3, priceSpread = 0.01) {
        const orders = [];
        const amountPerLevel = totalAmount / levels;
        const currentPrice = await this.getCurrentPrice(symbol);
        
        for (let i = 0; i < levels; i++) {
            const levelPrice = side === 'buy' 
                ? currentPrice * (1 - (priceSpread * i))
                : currentPrice * (1 + (priceSpread * i));
            
            try {
                const order = await this.createLimitOrder(symbol, side, amountPerLevel, levelPrice);
                orders.push(order);
                
                // Wait between orders to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ DCA order ${i + 1} failed:`, error.message);
            }
        }
        
        console.log(`📊 DCA strategy executed: ${orders.length}/${levels} orders placed`);
        return orders;
    }

    async executeScaledOrder(symbol, side, amount, levels = 5, priceRange = 0.005) {
        const orders = [];
        const currentPrice = await this.getCurrentPrice(symbol);
        const amountPerLevel = amount / levels;
        
        for (let i = 0; i < levels; i++) {
            const offset = (priceRange / levels) * i;
            const levelPrice = side === 'buy'
                ? currentPrice * (1 - offset)
                : currentPrice * (1 + offset);
            
            try {
                const order = await this.createLimitOrder(symbol, side, amountPerLevel, levelPrice);
                orders.push(order);
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Scaled order ${i + 1} failed:`, error.message);
            }
        }
        
        return orders;
    }

    // Portfolio Optimization
    async getOptimalExchange(symbol, side, amount) {
        let bestExchange = null;
        let bestPrice = side === 'buy' ? Infinity : 0;
        
        for (const [name, exchange] of this.exchanges) {
            try {
                const ticker = await exchange.fetchTicker(symbol);
                const price = side === 'buy' ? ticker.ask : ticker.bid;
                
                if ((side === 'buy' && price < bestPrice) || 
                    (side === 'sell' && price > bestPrice)) {
                    bestPrice = price;
                    bestExchange = exchange;
                }
                
            } catch (error) {
                console.warn(`⚠️ Failed to get price from ${name}:`, error.message);
            }
        }
        
        return { exchange: bestExchange, price: bestPrice };
    }

    // Statistics and Monitoring
    getOrderStats() {
        const totalOrders = this.orderHistory.length;
        const filledOrders = this.orderHistory.filter(o => o.status === 'closed').length;
        const cancelledOrders = this.orderHistory.filter(o => o.status === 'canceled').length;
        
        return {
            total: totalOrders,
            filled: filledOrders,
            cancelled: cancelledOrders,
            fillRate: totalOrders > 0 ? filledOrders / totalOrders : 0,
            openOrders: this.openOrders.size
        };
    }

    getExchangeStatus() {
        return {
            activeExchange: this.activeExchange?.id || 'none',
            connectedExchanges: Array.from(this.exchanges.keys()),
            orderStats: this.getOrderStats(),
            balances: Object.keys(this.balances).length
        };
    }

    // Cleanup
    async shutdown() {
        console.log('🛑 Shutting down Exchange Manager...');
        
        // Cancel all open orders
        for (const [orderId, orderInfo] of this.openOrders) {
            try {
                await this.cancelOrder(orderId, orderInfo.symbol);
            } catch (error) {
                console.error(`❌ Failed to cancel order ${orderId}:`, error.message);
            }
        }
        
        this.exchanges.clear();
        this.openOrders.clear();
        
        console.log('✅ Exchange Manager shutdown complete');
    }
}

module.exports = ExchangeManager;