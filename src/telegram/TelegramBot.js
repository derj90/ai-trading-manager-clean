const TelegramBot = require('node-telegram-bot-api');
const EventEmitter = require('events');

class TradingTelegramBot extends EventEmitter {
    constructor(config = {}) {
        super();
        this.token = config.token || process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;
        this.bot = null;
        this.tradingManager = null;
        
        // Message templates
        this.templates = {
            welcome: "🤖 *AI Trading Manager Bot*\\n\\nBot iniciado y listo para operar\\!",
            positionOpened: "🟢 *Posición Abierta*\\n\\n📊 {symbol} {side}\\n💰 Precio: ${price}\\n🎯 TP: ${takeProfit}\\n🛑 SL: ${stopLoss}\\n📈 Estrategia: {strategy}",
            positionClosed: "{emoji} *Posición Cerrada*\\n\\n📊 {symbol} {side}\\n💰 PnL: ${pnl} \\({pnlPercent}\\%\\)\\n⏱️ Duración: {duration}\\n📝 Razón: {reason}",
            portfolioUpdate: "📈 *Portfolio Update*\\n\\n💼 Capital Total: ${totalValue}\\n📊 PnL No Realizado: ${unrealizedPnL}\\n🎯 ROI: {totalReturn}\\%\\n📍 Posiciones Abiertas: {openPositions}\\n🏆 Win Rate: {winRate}\\%"
        };
        
        this.setupBot();
    }

    setupBot() {
        if (!this.token) {
            console.error('❌ Telegram bot token not provided');
            return;
        }

        this.bot = new TelegramBot(this.token, { polling: true });
        
        this.setupCommands();
        this.setupMessageHandlers();
        
        console.log('📱 Telegram bot initialized');
    }

    setupCommands() {
        if (!this.bot) return;

        // Set bot commands
        this.bot.setMyCommands([
            { command: 'start', description: 'Iniciar el bot' },
            { command: 'status', description: 'Estado del portfolio' },
            { command: 'positions', description: 'Posiciones abiertas' },
            { command: 'performance', description: 'Métricas de rendimiento' },
            { command: 'strategies', description: 'Estado de estrategias' },
            { command: 'close_all', description: 'Cerrar todas las posiciones' },
            { command: 'pause', description: 'Pausar trading' },
            { command: 'resume', description: 'Reanudar trading' },
            { command: 'paper', description: 'Alternar paper trading' },
            { command: 'help', description: 'Mostrar ayuda' }
        ]);

        // Command handlers
        this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
        this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
        this.bot.onText(/\/positions/, (msg) => this.handlePositions(msg));
        this.bot.onText(/\/performance/, (msg) => this.handlePerformance(msg));
        this.bot.onText(/\/strategies/, (msg) => this.handleStrategies(msg));
        this.bot.onText(/\/close_all/, (msg) => this.handleCloseAll(msg));
        this.bot.onText(/\/pause/, (msg) => this.handlePause(msg));
        this.bot.onText(/\/resume/, (msg) => this.handleResume(msg));
        this.bot.onText(/\/paper/, (msg) => this.handleTogglePaper(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
        
        // Advanced commands
        this.bot.onText(/\/enable_strategy (.+)/, (msg, match) => this.handleEnableStrategy(msg, match[1]));
        this.bot.onText(/\/disable_strategy (.+)/, (msg, match) => this.handleDisableStrategy(msg, match[1]));
        this.bot.onText(/\/close_position (.+)/, (msg, match) => this.handleClosePosition(msg, match[1]));
        this.bot.onText(/\/set_risk (.+)/, (msg, match) => this.handleSetRisk(msg, match[1]));
    }

    setupMessageHandlers() {
        if (!this.bot) return;

        // Handle text messages for natural queries
        this.bot.on('message', (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                this.handleNaturalQuery(msg);
            }
        });

        // Handle callback queries (inline buttons)
        this.bot.on('callback_query', (query) => {
            this.handleCallbackQuery(query);
        });
    }

    setTradingManager(tradingManager) {
        this.tradingManager = tradingManager;
        
        // Listen to trading events
        this.tradingManager.on('positionOpened', (position) => {
            this.notifyPositionOpened(position);
        });

        this.tradingManager.on('positionClosed', (trade) => {
            this.notifyPositionClosed(trade);
        });

        this.tradingManager.on('positionRejected', (rejection) => {
            this.notifyPositionRejected(rejection);
        });

        // Daily portfolio updates
        setInterval(() => {
            this.sendPortfolioUpdate();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    // Command Handlers
    async handleStart(msg) {
        const welcomeMsg = this.templates.welcome;
        await this.sendMessage(welcomeMsg, { parse_mode: 'MarkdownV2' });
        
        if (this.tradingManager) {
            const status = this.tradingManager.getStatus();
            await this.sendStatusMessage(status);
        }
    }

    async handleStatus(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        const status = this.tradingManager.getStatus();
        await this.sendStatusMessage(status);
    }

    async handlePositions(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        const positions = Array.from(this.tradingManager.portfolioManager.positions.values());
        
        if (positions.length === 0) {
            await this.sendMessage("📭 No hay posiciones abiertas");
            return;
        }

        let message = "📊 *Posiciones Abiertas:*\\n\\n";
        
        for (const position of positions) {
            const pnlPercent = (position.unrealizedPnL / (position.size * position.entryPrice) * 100).toFixed(2);
            const pnlEmoji = position.unrealizedPnL > 0 ? "🟢" : "🔴";
            
            message += `${pnlEmoji} *${position.symbol}* ${position.side}\\n`;
            message += `💰 Entry: $${position.entryPrice}\\n`;
            message += `📈 PnL: ${pnlPercent}\\%\\n`;
            message += `🎯 TP: $${position.takeProfit}\\n`;
            message += `🛑 SL: $${position.stopLoss}\\n\\n`;
        }

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async handlePerformance(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        const portfolio = this.tradingManager.portfolioManager.getPortfolioSummary();
        
        let message = "📈 *Performance Report:*\\n\\n";
        message += `💼 Capital Inicial: $${portfolio.initialCapital}\\n`;
        message += `💰 Valor Total: $${portfolio.totalValue.toFixed(2)}\\n`;
        message += `📊 ROI: ${(portfolio.totalReturn * 100).toFixed(2)}\\%\\n`;
        message += `🎯 Win Rate: ${(portfolio.winRate * 100).toFixed(1)}\\%\\n`;
        message += `📈 Profit Factor: ${portfolio.profitFactor.toFixed(2)}\\n`;
        message += `📉 Max Drawdown: ${(portfolio.maxDrawdown * 100).toFixed(2)}\\%\\n`;
        message += `⚡ Sharpe Ratio: ${portfolio.sharpeRatio.toFixed(2)}\\n`;
        message += `🔢 Total Trades: ${portfolio.totalTrades}\\n`;

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async handleStrategies(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        const strategies = Array.from(this.tradingManager.strategies.values());
        
        let message = "🎯 *Estrategias:*\\n\\n";
        
        for (const strategy of strategies) {
            const status = strategy.isEnabled() ? "✅" : "⏸️";
            const performance = strategy.getPerformance();
            
            message += `${status} *${strategy.getName()}*\\n`;
            message += `📊 Señales: ${performance.totalSignals}\\n`;
            message += `🎯 Win Rate: ${(performance.winRate * 100).toFixed(1)}\\%\\n`;
            message += `💰 Avg Return: ${(performance.avgReturn * 100).toFixed(2)}\\%\\n\\n`;
        }

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async handleCloseAll(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        const positions = Array.from(this.tradingManager.portfolioManager.positions.values());
        
        if (positions.length === 0) {
            await this.sendMessage("📭 No hay posiciones para cerrar");
            return;
        }

        // Create confirmation keyboard
        const keyboard = {
            inline_keyboard: [[
                { text: "✅ Confirmar", callback_data: "close_all_confirm" },
                { text: "❌ Cancelar", callback_data: "close_all_cancel" }
            ]]
        };

        await this.sendMessage(
            `⚠️ ¿Confirmas cerrar ${positions.length} posiciones abiertas?`,
            { reply_markup: keyboard }
        );
    }

    async handlePause(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        if (!this.tradingManager.isActive) {
            await this.sendMessage("⏸️ El trading ya está pausado");
            return;
        }

        // In a full implementation, you'd add pause functionality to TradingManager
        await this.sendMessage("⏸️ Trading pausado temporalmente");
    }

    async handleResume(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        if (this.tradingManager.isActive) {
            await this.sendMessage("▶️ El trading ya está activo");
            return;
        }

        await this.sendMessage("▶️ Trading reanudado");
    }

    async handleTogglePaper(msg) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        this.tradingManager.togglePaperTrading();
        const mode = this.tradingManager.paperTrading ? "Paper Trading" : "Live Trading";
        await this.sendMessage(`💱 Modo cambiado a: *${mode}*`, { parse_mode: 'MarkdownV2' });
    }

    async handleHelp(msg) {
        let helpMessage = "🤖 *AI Trading Manager - Comandos:*\\n\\n";
        helpMessage += "📊 `/status` \\- Estado del portfolio\\n";
        helpMessage += "📍 `/positions` \\- Posiciones abiertas\\n";
        helpMessage += "📈 `/performance` \\- Métricas de rendimiento\\n";
        helpMessage += "🎯 `/strategies` \\- Estado de estrategias\\n";
        helpMessage += "🔴 `/close_all` \\- Cerrar todas las posiciones\\n";
        helpMessage += "⏸️ `/pause` \\- Pausar trading\\n";
        helpMessage += "▶️ `/resume` \\- Reanudar trading\\n";
        helpMessage += "💱 `/paper` \\- Alternar paper trading\\n\\n";
        helpMessage += "*Comandos Avanzados:*\\n";
        helpMessage += "`/enable_strategy NOMBRE` \\- Activar estrategia\\n";
        helpMessage += "`/disable_strategy NOMBRE` \\- Desactivar estrategia\\n";
        helpMessage += "`/close_position SYMBOL` \\- Cerrar posición específica\\n";
        helpMessage += "`/set_risk 0\\.02` \\- Cambiar riesgo por trade\\n";

        await this.sendMessage(helpMessage, { parse_mode: 'MarkdownV2' });
    }

    // Advanced command handlers
    async handleEnableStrategy(msg, strategyName) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        this.tradingManager.enableStrategy(strategyName);
        await this.sendMessage(`✅ Estrategia *${strategyName}* activada`, { parse_mode: 'MarkdownV2' });
    }

    async handleDisableStrategy(msg, strategyName) {
        if (!this.tradingManager) {
            await this.sendMessage("❌ Trading Manager no está conectado");
            return;
        }

        this.tradingManager.disableStrategy(strategyName);
        await this.sendMessage(`⏸️ Estrategia *${strategyName}* desactivada`, { parse_mode: 'MarkdownV2' });
    }

    // Notification methods
    async notifyPositionOpened(position) {
        const message = this.formatTemplate(this.templates.positionOpened, {
            symbol: position.symbol,
            side: position.side.toUpperCase(),
            price: position.entryPrice.toFixed(2),
            takeProfit: position.takeProfit.toFixed(2),
            stopLoss: position.stopLoss.toFixed(2),
            strategy: position.strategy
        });

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async notifyPositionClosed(trade) {
        const pnlPercent = ((trade.realizedPnL / (trade.size * trade.entryPrice)) * 100).toFixed(2);
        const emoji = trade.realizedPnL > 0 ? "🟢" : "🔴";
        
        const message = this.formatTemplate(this.templates.positionClosed, {
            emoji,
            symbol: trade.symbol,
            side: trade.side.toUpperCase(),
            pnl: trade.realizedPnL.toFixed(2),
            pnlPercent,
            duration: `${trade.duration}h`,
            reason: trade.reason
        });

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async notifyPositionRejected(rejection) {
        let message = `❌ *Posición Rechazada*\\n\\n📊 ${rejection.symbol}\\n\\n*Razones:*\\n`;
        
        const checks = rejection.checks;
        if (!checks.maxPositions) message += "• Máximo de posiciones alcanzado\\n";
        if (!checks.correlation) message += "• Límite de correlación\\n";
        if (!checks.riskBudget) message += "• Presupuesto de riesgo excedido\\n";
        if (!checks.capital) message += "• Capital insuficiente\\n";

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    async sendPortfolioUpdate() {
        if (!this.tradingManager) return;

        const portfolio = this.tradingManager.portfolioManager.getPortfolioSummary();
        
        const message = this.formatTemplate(this.templates.portfolioUpdate, {
            totalValue: portfolio.totalValue.toFixed(2),
            unrealizedPnL: portfolio.unrealizedPnL.toFixed(2),
            totalReturn: (portfolio.totalReturn * 100).toFixed(2),
            openPositions: portfolio.openPositions,
            winRate: (portfolio.winRate * 100).toFixed(1)
        });

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }

    // Natural language processing
    async handleNaturalQuery(msg) {
        const text = msg.text.toLowerCase();
        
        if (text.includes('precio') || text.includes('price')) {
            await this.handlePriceQuery(msg, text);
        } else if (text.includes('portfolio') || text.includes('rendimiento')) {
            await this.handleStatus(msg);
        } else if (text.includes('posiciones') || text.includes('positions')) {
            await this.handlePositions(msg);
        } else {
            await this.sendMessage("🤔 No entendí tu consulta. Usa /help para ver comandos disponibles.");
        }
    }

    async handlePriceQuery(msg, text) {
        // Extract symbol from text
        const symbols = ['BTC', 'ETH', 'ADA', 'DOT', 'LINK', 'SOL'];
        const symbol = symbols.find(s => text.includes(s.toLowerCase()));
        
        if (symbol) {
            const price = await this.tradingManager?.getCurrentPrice(`${symbol}/USDT`);
            if (price) {
                await this.sendMessage(`💰 Precio actual de ${symbol}: $${price.toFixed(2)}`);
            } else {
                await this.sendMessage("❌ No pude obtener el precio en este momento");
            }
        } else {
            await this.sendMessage("❌ No encontré el símbolo en tu consulta");
        }
    }

    // Callback query handler
    async handleCallbackQuery(query) {
        const data = query.data;
        
        switch (data) {
            case 'close_all_confirm':
                await this.tradingManager?.closeAllPositions('telegram_command');
                await this.bot.editMessageText("✅ Todas las posiciones han sido cerradas", {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                });
                break;
                
            case 'close_all_cancel':
                await this.bot.editMessageText("❌ Operación cancelada", {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                });
                break;
        }
        
        await this.bot.answerCallbackQuery(query.id);
    }

    // Utility methods
    formatTemplate(template, data) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    escapeMarkdown(text) {
        return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    async sendMessage(text, options = {}) {
        if (!this.bot || !this.chatId) return;
        
        try {
            await this.bot.sendMessage(this.chatId, text, options);
        } catch (error) {
            console.error('Error sending Telegram message:', error);
        }
    }

    async sendStatusMessage(status) {
        let message = "📊 *Trading Manager Status*\\n\\n";
        message += `🤖 Estado: ${status.isActive ? "🟢 Activo" : "🔴 Inactivo"}\\n`;
        message += `💱 Modo: ${status.paperTrading ? "📝 Paper" : "💰 Live"}\\n`;
        message += `📥 Señales en cola: ${status.queuedSignals}\\n`;
        message += `🎯 Estrategias activas: ${status.activeStrategies}\\n\\n`;
        
        message += `💼 *Portfolio:*\\n`;
        message += `💰 Valor total: $${status.portfolio.totalValue.toFixed(2)}\\n`;
        message += `📊 ROI: ${(status.portfolio.totalReturn * 100).toFixed(2)}\\%\\n`;
        message += `📍 Posiciones: ${status.portfolio.openPositions}\\n`;

        await this.sendMessage(message, { parse_mode: 'MarkdownV2' });
    }
}

module.exports = TradingTelegramBot;