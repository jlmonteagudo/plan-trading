# Guía de Despliegue en Digital Ocean Droplet con CI/CD

Esta guía detalla los pasos para migrar tu aplicación a un Droplet de Digital Ocean y configurar un despliegue automático usando GitHub Actions.

## 1. Crear y Configurar el Droplet

1.  **Crear Droplet**:
    *   Ve a tu panel de Digital Ocean -> Droplets -> Create Droplet.
    *   **Region**: Elige la más cercana a ti (ej. London, Frankfurt).
    *   **OS**: Ubuntu 24.04 (LTS) x64.
    *   **Size**: Basic -> Regular -> $6/mo (1GB RAM / 1 CPU) es suficiente para empezar.
    *   **Authentication**: **SSH Key**. Crea una nueva o usa una existente. Esto es crucial para que GitHub Actions pueda entrar.
    *   **Hostname**: Ponle un nombre, ej. `trading-bot`.
    *   Dale a "Create Droplet".

2.  **Obtener IP Estática**:
    *   Una vez creado, copia la dirección **IPv4** del Droplet.
    *   **IMPORTANTE**: Ve a Binance y actualiza tu API Key Whitelist con esta nueva IP.

## 2. Preparar el Servidor (Droplet)

Conéctate a tu droplet por terminal:
```bash
ssh root@TU_IP_DEL_DROPLET
```

Ejecuta los siguientes comandos para instalar Node.js, Git y PM2:

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js (versión 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Instalar PM2 (Gestor de procesos para mantener el bot vivo)
npm install -g pm2 ts-node typescript

# Verificar instalaciones
node -v
npm -v
pm2 -v
```

## 3. Despliegue Inicial Manual

1.  **Clonar el repositorio**:
    ```bash
    # En la carpeta /var/www (o donde prefieras)
    mkdir -p /var/www
    cd /var/www
    git clone https://github.com/TU_USUARIO/plan-trading.git
    cd plan-trading
    ```

2.  **Configurar Variables de Entorno**:
    Crea el archivo `.env` con tus secretos (ya que no están en GitHub):
    ```bash
    nano .env
    ```
    *Pega ahí el contenido de tu archivo .env local.* Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

3.  **Instalar y Construir**:
    ```bash
    npm install
    npm run build
    ```

4.  **Iniciar con PM2**:
    ```bash
    # Iniciar la app compilada
    pm2 start dist/index.js --name "trading-bot"

    # Guardar la lista de procesos para que revivan si se reinicia el servidor
    pm2 save
    pm2 startup
    # (Copia y pega el comando que te diga pm2 startup si te lo pide)
    ```

## 4. Configurar Despliegue Automático (GitHub Actions)

Para que GitHub pueda conectarse a tu Droplet y actualizar el código, necesitas configurar "Secretos".

1.  **Generar claves SSH para GitHub Actions** (en tu ordenador local):
    ```bash
    ssh-keygen -t rsa -b 4096 -C "github-actions" -f ./github_deploy_key
    # No pongas contraseña (passphrase), dale a Enter.
    ```
    Esto creará dos archivos: `github_deploy_key` (privada) y `github_deploy_key.pub` (pública).

2.  **Instalar la clave pública en el Droplet**:
    *   Copia el contenido de `github_deploy_key.pub`.
    *   En tu Droplet (conectado como root):
        ```bash
        nano ~/.ssh/authorized_keys
        ```
    *   Pega la clave al final del archivo en una nueva línea. Guarda y sal.

3.  **Configurar Secretos en GitHub**:
    *   Ve a tu repositorio en GitHub -> **Settings** -> **Secrets and variables** -> **Actions**.
    *   Crea los siguientes "New repository secret":
        *   `DROPLET_HOST`: La IP de tu Droplet.
        *   `DROPLET_USERNAME`: `root`
        *   `SSH_PRIVATE_KEY`: Pega el contenido COMPLETO del archivo `github_deploy_key` (la clave privada) que generaste en tu ordenador.

4.  **Crear el Workflow**:
    En tu proyecto, crea el archivo `.github/workflows/deploy.yml` con el siguiente contenido:

    ```yaml
    name: Deploy to Digital Ocean

    on:
      push:
        branches:
          - main

    jobs:
      deploy:
        runs-on: ubuntu-latest
        steps:
          - name: Checkout code
            uses: actions/checkout@v3

          - name: Deploy via SSH
            uses: appleboy/ssh-action@v1.0.0
            with:
              host: ${{ secrets.DROPLET_HOST }}
              username: ${{ secrets.DROPLET_USERNAME }}
              key: ${{ secrets.SSH_PRIVATE_KEY }}
              script: |
                cd /var/www/plan-trading
                git pull origin main
                npm install
                npm run build
                pm2 restart trading-bot
    ```

5.  **Sube los cambios**:
    Haz commit y push de este archivo `.github/workflows/deploy.yml`.

¡Listo! Ahora cada vez que hagas un push a `main`, GitHub Actions se conectará a tu Droplet, bajará los cambios, recompilará y reiniciará el bot automáticamente.

## 5. Monitorización y Logs

Para ver qué está pasando con tu bot, usa los siguientes comandos de PM2:

*   **Ver logs en tiempo real (todos los procesos):**
    ```bash
    pm2 logs
    ```

*   **Ver logs de un proceso específico (por nombre):**
    ```bash
    pm2 logs trading-bot
    ```

*   **Ver las últimas X líneas de log:**
    ```bash
    pm2 logs --lines 100
    ```

*   **Ver estado de los procesos (CPU, Memoria, Uptime):**
    ```bash
    pm2 status
    ```

*   **Monitorización gráfica en terminal:**
    ```bash
    pm2 monit
    ```
