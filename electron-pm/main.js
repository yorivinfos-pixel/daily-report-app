const { app, BrowserWindow, Menu, shell, Tray, nativeImage } = require('electron');
const path = require('path');

// Toujours charger la dernière version des pages depuis Render (évite cache obsolète)
app.commandLine.appendSwitch('disable-http-cache');

const PM_URL = 'https://daily-report-app-fanv.onrender.com/pm';

let mainWindow = null;
let tray = null;

function createWindow() {
    const iconPath = path.join(__dirname, 'build', 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: iconPath,
        title: 'YoRiv Dashboard PM',
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const menu = Menu.buildFromTemplate([
        {
            label: 'Fichier',
            submenu: [
                {
                    label: 'Actualiser',
                    accelerator: 'F5',
                    click: () => mainWindow.webContents.reload()
                },
                {
                    label: 'Actualiser (vider cache)',
                    accelerator: 'Ctrl+Shift+R',
                    click: () => mainWindow.webContents.reloadIgnoringCache()
                },
                { type: 'separator' },
                {
                    label: 'Zoom +',
                    accelerator: 'Ctrl+=',
                    click: () => {
                        const current = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(current + 0.1);
                    }
                },
                {
                    label: 'Zoom -',
                    accelerator: 'Ctrl+-',
                    click: () => {
                        const current = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(Math.max(0.3, current - 0.1));
                    }
                },
                {
                    label: 'Zoom 100%',
                    accelerator: 'Ctrl+0',
                    click: () => mainWindow.webContents.setZoomFactor(1.0)
                },
                { type: 'separator' },
                { label: 'Quitter', accelerator: 'Alt+F4', click: () => app.quit() }
            ]
        },
        {
            label: 'Navigation',
            submenu: [
                {
                    label: 'Dashboard PM',
                    click: () => mainWindow.loadURL(PM_URL)
                },
                {
                    label: 'Superviseur',
                    click: () => mainWindow.loadURL('https://daily-report-app-fanv.onrender.com/')
                }
            ]
        },
        {
            label: 'Aide',
            submenu: [
                {
                    label: 'Outils développeur',
                    accelerator: 'F12',
                    click: () => mainWindow.webContents.toggleDevTools()
                }
            ]
        }
    ]);
    Menu.setApplicationMenu(menu);

    mainWindow.loadURL(PM_URL);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
