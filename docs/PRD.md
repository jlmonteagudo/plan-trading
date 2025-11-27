# PRD (Project Requirements Document) - Bot de Señales de Trading v1.0

## 1. Resumen del Proyecto

El proyecto consiste en el desarrollo de un bot de trading para criptomonedas que opera en el mercado Spot de Binance. El bot escaneará periódicamente los mercados en busca de oportunidades de compra basadas en un aumento significativo y repentino del volumen y el precio.

Al detectar una señal, el bot enviará una notificación a un canal privado de Telegram. Esta notificación incluirá información clave de la señal, un enlace para analizar el mercado en la aplicación de Binance y un botón para ejecutar la compra de forma automática. La estrategia de salida se basa en órdenes OCO (One-Cancels-the-Other) para asegurar un ratio riesgo/beneficio predefinido.

## 2. Objetivos de Negocio

- **Generación de Señales:** Proveer entre 2 y 3 señales de trading de alta probabilidad por día.
- **Gestión de Riesgo:** Implementar una estrategia de salida automática que asegure un ratio riesgo/beneficio de 2:1.
- **Eficiencia Operativa:** Permitir al usuario analizar la señal manualmente o ejecutar la operación con un solo clic desde Telegram, reduciendo el tiempo de reacción.
- **Rentabilidad (Target):** Buscar un beneficio aproximado del 2% por operación exitosa.

## 3. Requisitos Funcionales (RF)

- **RF-01: Escaneo de Mercados:** El sistema debe escanear mercados en Binance periódicamente.
- **RF-02: Filtrado de Mercados:** El sistema debe filtrar los mercados para analizar solo aquellos que cumplan con los criterios de liquidez (moneda de cotización USDC, volumen mínimo en 24h).
- **RF-03: Análisis de Velas:** Para cada mercado elegible, el sistema debe obtener y analizar los datos de velas (OHLCV) en la temporalidad definida.
- **RF-04: Detección de Señales:** El sistema debe identificar una señal de compra si se cumplen simultáneamente los criterios de aumento de volumen y precio.
- **RF-05: Notificación en Telegram:** Al encontrar una señal, el sistema debe enviar un mensaje formateado a un canal de Telegram específico.
- **RF-06: Contenido de la Notificación:** El mensaje debe contener:
    - Par de trading (ej: `BTC/USDC`).
    - Criterios que dispararon la señal (ej: "Volumen +150%, Precio +1.2%").
    - Un "deep link" para abrir el par en la app móvil de Binance.
    - Un botón de "Comprar".
- **RF-07: Ejecución de Orden Manual:** Al pulsar el botón "Comprar", el sistema debe ejecutar una orden de compra a mercado en Binance.
- **RF-08: Colocación de Orden OCO:** Inmediatamente después de que la orden de compra se complete, el sistema debe colocar una orden OCO con los parámetros de Take Profit y Stop Loss definidos.
- **RF-09: Configuración Centralizada:** Todos los parámetros de la estrategia (umbrales, porcentajes, etc.) deben ser fácilmente configurables sin modificar el código fuente.
- **RF-10: Endpoint de Ejecución Seguro:** El endpoint HTTP del "Executor" debe estar protegido para aceptar únicamente peticiones autorizadas provenientes de Telegram.

## 4. Requisitos Técnicos (RT)

- **RT-01: Lenguaje de Programación:** TypeScript.
- **RT-02: Plataforma de Despliegue:** Digital Ocean Droplet (Node.js).
- **RT-03: Arquitectura de Despliegue:**
    - Aplicación Node.js monolítica ejecutando:
        - Un servidor HTTP (Fastify) para el "Executor" (Webhooks de Telegram).
        - Un proceso programado (node-cron) para el "Scanner".
- **RT-04: Interacción con Exchange:** Librería CCXT para la comunicación con la API de Binance.
- **RT-05: Interacción con Telegram:** API de bots de Telegram para enviar mensajes y procesar callbacks de botones.
- **RT-06: Dependencias:** El proyecto se gestionará con `npm`.
- **RT-07: Gestión de Secretos:** Las variables de entorno se gestionarán mediante un fichero `.env` no versionado.
- **RT-08: Seguridad del Webhook:** La autenticación del webhook de Telegram se realizará mediante un token secreto compartido en la URL del webhook.
- **RT-09: Despliegue Automatizado (CI/CD):** (Opcional) Despliegue mediante GitHub Actions o manual via SSH/Git pull en el servidor.

## 5. Flujo de Trabajo Detallado

1.  **Inicio (Cron Job):** Según la configuración `CRON_SCHEDULE`, el proceso "Scanner" se activa dentro de la aplicación Node.js.
2.  **Obtener Tickers:** El Scanner pide a Binance todos los tickers.
3.  **Filtrar y Seleccionar:** Filtra los pares `*/USDC` con volumen > `MIN_VOLUME_24H` y se queda con el `TOP_N_MARKETS` por volumen.
4.  **Analizar Mercados:** Para cada uno de los N mercados:
    a. Obtiene las últimas `CANDLE_HISTORY_COUNT` velas de `CANDLE_TIMEFRAME`.
    b. Calcula el volumen promedio de las velas anteriores a la última.
    c. Comprueba si `volumen_ultima_vela > volumen_promedio * VOLUME_SPIKE_FACTOR`.
    d. Comprueba si `precio_cierre_ultima_vela > precio_apertura_ultima_vela * PRICE_SPIKE_FACTOR`.
5.  **Generar Señal:** Si ambas condiciones se cumplen, se considera una señal.
6.  **Enviar Notificación:** El Scanner envía un mensaje a Telegram con el deep link y el botón "Comprar". El `callback_data` del botón contiene la información necesaria (ej: `BUY_BTC/USDC`).
7.  **Interacción del Usuario:** El usuario recibe el mensaje.
    a. **Opción Manual:** Hace clic en el deep link, analiza y opera manualmente.
    b. **Opción Automática:** Pulsa el botón "Comprar".
8.  **Ejecución de Compra:** Telegram envía un webhook a la URL pública del servidor Node.js (incluyendo el token secreto).
9.  **Procesar Orden:** El servidor (Fastify) valida el token secreto. Si es válido, parsea el `callback_data`, y ejecuta la compra a mercado del activo y la posterior orden OCO en Binance.

## 6. Parámetros de Configuración (`.env`)

| Parámetro | Descripción | Valor Inicial Propuesto |
| :--- | :--- | :--- |
| `PORT` | Puerto del servidor HTTP | `3000` |
| `CRON_SCHEDULE` | Frecuencia de ejecución del scanner | `*/5 * * * *` (Cada 5 min) |
| `QUOTE_CURRENCY` | Moneda de cotización a buscar | `USDC` |
| `MIN_VOLUME_24H` | Volumen mínimo en 24h para considerar un mercado | `10000000` |
| `TOP_N_MARKETS` | Nº de mercados a analizar en cada ejecución | `20` |
| `CANDLE_TIMEFRAME` | Temporalidad de las velas a analizar | `5m` |
| `CANDLE_HISTORY_COUNT`| Nº de velas a obtener para el análisis | `10` |
| `VOLUME_SPIKE_FACTOR` | Multiplicador para el pico de volumen | `2.0` (+100%) |
| `PRICE_SPIKE_FACTOR` | Multiplicador para el pico de precio en la vela | `1.01` (+1%) |
| `ORDER_AMOUNT_USDC` | Cantidad en USDC a invertir por operación | `50` (Ejemplo) |
| `TAKE_PROFIT_FACTOR` | Multiplicador para el Take Profit de la OCO | `1.025` (+2.5%) |
| `STOP_LOSS_FACTOR` | Multiplicador para el Stop Loss de la OCO | `0.9875` (-1.25%) |

## 7. Fases de Desarrollo (Actualizado)

- **Fase 1: Migración a Node.js (Completada)**
    - Adaptar código de Cloudflare Workers a Node.js + Fastify.
    - Implementar Cron Job interno.
    - Configurar gestión de variables de entorno.
- **Fase 2: Despliegue y Pruebas.**
    - Configurar Droplet en Digital Ocean.
    - Clonar repositorio y configurar `.env`.
    - Ejecutar `npm install` y `npm run build`.
    - Iniciar aplicación con `pm2` o similar para persistencia.
