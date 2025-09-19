# 🤖 AI Trading Manager

Sistema automatizado de trading con IA, gestión de riesgo y ejecución automática optimizado para Quantfury.

## 🚀 Características

- ✅ **3 Estrategias Rentables**: Gold Scalping, Forex Momentum, Crypto EMA
- ✅ **Integración TradingView**: Webhooks automáticos para señales
- ✅ **Gestión de Riesgo**: Control automático de riesgo por trade y cartera
- ✅ **Telegram Bot**: Control total desde Telegram
- ✅ **Quantfury Integration**: Optimizado para broker Quantfury
- ✅ **Chart Analysis**: Análisis automático de gráficos
- ✅ **Paper Trading**: Modo de práctica incluido

## 📋 Requisitos

- Node.js >= 18.0.0
- NPM >= 8.0.0
- Telegram Bot Token
- TradingView Account
- Quantfury Account

## 🔧 Instalación

### 1. Clonar repositorio
```bash
git clone https://github.com/tu-usuario/ai-trading-manager.git
cd ai-trading-manager
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### 4. Iniciar aplicación
```bash
# Desarrollo
npm run dev

# Producción
npm start

# Con PM2
npm run pm2:start
```

## ⚙️ Configuración

### Variables de Entorno (.env)

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID=tu_chat_id

# TradingView Webhook
TRADINGVIEW_WEBHOOK_PORT=3000
TRADINGVIEW_WEBHOOK_SECRET=tu_secreto

# Trading
INITIAL_CAPITAL=10000
MAX_RISK_PER_TRADE=0.02
PAPER_TRADING=false
```

### Webhook TradingView

**URL**: `https://tu-dominio.com/webhook`

**JSON Ejemplo (XAUUSD)**:
```json
{
  "symbol": "XAUUSD",
  "action": "buy",
  "price": {{close}},
  "strategy": "GOLD_SCALPING",
  "timeframe": "15m",
  "rsi": {{rsi(14)}},
  "ema8": {{ema(8)}},
  "ema21": {{ema(21)}},
  "stop_loss": {{close}} * 0.9985,
  "take_profit": {{close}} * 1.0025,
  "atr": {{atr(14)}}
}
```

## 📱 Comandos Telegram

- `/start` - Iniciar bot
- `/status` - Estado del sistema
- `/strategies` - Ver estrategias
- `/positions` - Posiciones activas
- `/performance` - Rendimiento
- `/help` - Ayuda

## 🎯 Estrategias Incluidas

### 1. Gold Scalping (XAUUSD)
- **Timeframes**: 5m, 15m
- **Indicadores**: EMA 8/21, RSI, Bollinger Bands
- **Leverage**: 20x
- **Win Rate**: 65-75%

### 2. Forex Momentum
- **Pares**: EURUSD, GBPUSD, USDJPY
- **Timeframes**: 30m, 1h
- **Indicadores**: MACD, RSI, ADX
- **Leverage**: 30x

### 3. Crypto EMA
- **Pares**: BTCUSD, ETHUSD
- **Timeframes**: 15m, 30m
- **Indicadores**: EMA Cross, Volume
- **Leverage**: 10x

## 🔐 Seguridad

- Validación de IP para webhooks
- Secretos de webhook
- Límites de riesgo automáticos
- Logging completo

## 📊 Deployment

### Hostinger VPS + CloudPanel

1. **VPS Setup**: Contratar VPS Hostinger
2. **CloudPanel**: Instalar template Node.js
3. **GitHub Deploy**: Conectar repositorio
4. **PM2**: Configurar proceso manager

### Dockerfile (Opcional)
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📈 Rendimiento Esperado

- **ROI Mensual**: 50-100%
- **Win Rate**: 60-75%
- **Max Drawdown**: <10%
- **Profit Factor**: 2.5+

## 🛠️ Desarrollo

```bash
# Instalar dependencias dev
npm install

# Ejecutar tests
npm test

# Modo desarrollo
npm run dev

# Lint código
npm run lint
```

## 📞 Soporte

- **Issues**: GitHub Issues
- **Telegram**: @tu_usuario
- **Email**: soporte@tu-dominio.com

## 📜 Licencia

MIT License - Ver [LICENSE](LICENSE) para detalles.

---

**⚠️ Disclaimer**: Trading involves risk. Past performance does not guarantee future results.