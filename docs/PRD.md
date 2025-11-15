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
- **RT-02: Plataforma de Despliegue:** Cloudflare Workers.
- **RT-03: Arquitectura de Despliegue:**
    - Un Worker "Scanner" con un `Cron Trigger` para la detección de señales.
    - Un Worker "Executor" como endpoint HTTP para recibir webhooks de Telegram.
- **RT-04: Interacción con Exchange:** Librería CCXT para la comunicación con la API de Binance.
- **RT-05: Interacción con Telegram:** API de bots de Telegram para enviar mensajes y procesar callbacks de botones.
- **RT-06: Dependencias:** El proyecto se gestionará con `npm` o `yarn`.
- **RT-07: Gestión de Secretos:** Las claves de API (Binance, Telegram) y otros tokens sensibles deben gestionarse como `secrets` en el entorno de Cloudflare y no deben ser versionados en el código fuente.
- **RT-08: Seguridad del Webhook:** La autenticación del webhook de Telegram se realizará mediante un token secreto compartido en la URL del webhook.
- **RT-09: Despliegue Automatizado (CI/CD):** El despliegue a Cloudflare se automatizará mediante GitHub Actions, activándose en cada push a la rama principal del repositorio.

## 5. Flujo de Trabajo Detallado

1.  **Inicio (Cron Trigger):** Cada 5 minutos, el Worker "Scanner" se activa.
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
8.  **Ejecución de Compra:** Telegram envía un webhook a la URL del Worker "Executor" (incluyendo el token secreto).
9.  **Procesar Orden:** El Executor valida el token secreto. Si es válido, parsea el `callback_data`, y ejecuta la compra a mercado del activo y la posterior orden OCO en Binance.

## 6. Parámetros de Configuración (`config.ts`)

| Parámetro | Descripción | Valor Inicial Propuesto |
| :--- | :--- | :--- |
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

## 7. Fases de Desarrollo (Propuesta)

- **Fase 1: Configuración y Scanner.**
    - Inicializar proyecto en TypeScript.
    - Crear el fichero de configuración.
    - Desarrollar toda la lógica del Scanner (RF-01 a RF-06).
    - Probar localmente que se detectan señales y se envían a Telegram.
- **Fase 2: Executor y Órdenes.**
    - Desarrollar el Worker Executor.
    - Implementar la lógica de recepción de webhooks (RF-10).
    - Implementar la ejecución de órdenes de compra y OCO (RF-07, RF-08).
- **Fase 3: Despliegue y Pruebas E2E.**
    - Configurar el entorno de Cloudflare y los secretos (RT-07).
    - Configurar el CI/CD con GitHub Actions (RT-09).
    - Desplegar ambos workers.
    - Realizar pruebas completas en el entorno real con capital bajo.
